import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { askGovernanceQuestion, cosineSimilarity } from '@/lib/ai/claude'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { AI_CONFIG } from '@/lib/ai/config'
import { enforceAiRateLimit } from '@/lib/ai/rate-limit'
import { canUseAI } from '@/lib/roles'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { question, history = [] } = body
  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canUseAI(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const rate = await enforceAiRateLimit(profile.id, 'ai/ask')
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `AI usage limit reached (${rate.limit}/hour). Please try again later.` },
      { status: 429 }
    )
  }

  try {
    const serviceSupabase = await createServiceClient()

    // Get embedding for the question
    const questionEmbedding = await generateEmbedding(question)

    // Get active document IDs and titles
    const { data: activeDocs } = await serviceSupabase
      .from('documents')
      .select('id, title')
      .eq('status', 'active')

    const docTitleMap: Record<string, string> = {}
    for (const d of (activeDocs ?? [])) docTitleMap[d.id] = d.title
    const activeDocIds = Object.keys(docTitleMap)

    // Fetch all chunks for active documents (empty array is fine — Claude handles no-doc gracefully)
    const { data: chunks } = activeDocIds.length > 0
      ? await serviceSupabase
          .from('document_chunks')
          .select('id, document_id, chunk_text, chunk_index, embedding')
          .in('document_id', activeDocIds)
      : { data: [] }

    // Rank chunks by cosine similarity
    const scored = (chunks ?? [])
      .filter((c) => c.embedding)
      .map((c) => {
        const emb = typeof c.embedding === 'string'
          ? JSON.parse(c.embedding)
          : c.embedding as number[]
        return {
          document_id: c.document_id,
          document_title: docTitleMap[c.document_id] ?? 'Unknown',
          chunk_text: c.chunk_text,
          similarity: cosineSimilarity(questionEmbedding, emb),
        }
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, AI_CONFIG.maxChunksForRAG)

    const result = await askGovernanceQuestion(question, scored, history)

    await serviceSupabase.from('ai_queries').insert({
      user_id: profile.id,
      question,
      answer: result.answer,
      confidence: result.confidence,
      sources_used: result.sources,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai/ask] pipeline failed: ${message}`)
    return NextResponse.json(
      { error: 'Failed to answer question. Please try again.' },
      { status: 500 }
    )
  }
}
