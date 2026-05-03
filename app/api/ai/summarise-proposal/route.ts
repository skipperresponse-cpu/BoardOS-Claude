import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { summariseProposal } from '@/lib/ai/claude'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { proposalText, linkedDocumentIds } = await request.json()
  if (!proposalText?.trim()) {
    return NextResponse.json({ error: 'Proposal text is required' }, { status: 400 })
  }

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
}
