import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { summariseProposal } from '@/lib/ai/claude'
import { enforceAiRateLimit } from '@/lib/ai/rate-limit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (profile) {
    const rate = await enforceAiRateLimit(profile.id, 'ai/summarise-proposal')
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `AI usage limit reached (${rate.limit}/hour). Please try again later.` },
        { status: 429 }
      )
    }
  }

  const { proposalText, linkedDocumentIds } = await request.json()
  if (!proposalText?.trim()) {
    return NextResponse.json({ error: 'Proposal text is required' }, { status: 400 })
  }

  try {
    let linkedDocsSummary = ''

    if (linkedDocumentIds?.length) {
      const serviceSupabase = await createServiceClient()
      const { data: docs } = await serviceSupabase
        .from('documents')
        .select('title, extracted_text')
        .in('id', linkedDocumentIds)

      if (docs) {
        linkedDocsSummary = docs
          .map((d) => `${d.title}:\n${(d.extracted_text ?? '').substring(0, 2000)}`)
          .join('\n\n---\n\n')
      }
    }

    const summary = await summariseProposal(proposalText, linkedDocsSummary)
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai/summarise-proposal] pipeline failed: ${message}`)
    return NextResponse.json(
      { error: 'Failed to summarise proposal. Please try again.' },
      { status: 500 }
    )
  }
}
