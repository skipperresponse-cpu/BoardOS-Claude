import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { askGovernanceQuestion, cosineSimilarity } from '@/lib/ai/claude'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { AI_CONFIG } from '@/lib/ai/config'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question } = await request.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role === 'viewer') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const serviceSupabase = await createServiceClient()

  // Get embedding for the question
  const questionEmbedding = await generateEmbedding(question)

  // Get active document IDs and titles
  const { data: activeDocs } = await serviceSupabase
    .from('documents')
    .select('id, title')
    .eq('status', 'active')

  if (!activeDocs || activeDocs.length === 0) {
    const result = {
      answer: 'No documents have been uploaded yet. Please upload governance documents before asking questions.',
      confidence: 'insufficient',
      sources: [],
    }
    await serviceSupabase.from('ai_queries').insert({
      user_id: profile.id,
      question,
      answer: result.answer,
      confidence: result.confidence,
      sources_used: result.sources,
    })
    return NextResponse.json(result)
  }

  const docTitleMap: Record<string, string> = {}
  for (const d of activeDocs) docTitleMap[d.id] = d.title
  const activeDocIds = Object.keys(docTitleMap)

  // Fetch all chunks for active documents
  const { data: chunks } = await serviceSupabase
    .from('document_chunks')
    .select('id, document_id, chunk_text, chunk_index, embedding')
    .in('document_id', activeDocIds)

  if (!chunks || chunks.length === 0) {
    const result = {
      answer: 'The uploaded documents have not been processed yet. Please open each document and click "Re-process" to extract and index its content.',
      confidence: 'insufficient',
      sources: [],
    }
    await serviceSupabase.from('ai_queries').insert({
      user_id: profile.id,
      question,
      answer: result.answer,
      confidence: result.confidence,
      sources_used: result.sources,
    })
    return NextResponse.json(result)
  }

  // Rank chunks by cosine similarity
  const scored = chunks
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

  const result = await askGovernanceQuestion(question, scored)

  await serviceSupabase.from('ai_queries').insert({
    user_id: profile.id,
    question,
    answer: result.answer,
    confidence: result.confidence,
    sources_used: result.sources,
  })

  return NextResponse.json(result)
}
