import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateResolution } from '@/lib/ai/claude'
import { logAudit } from '@/lib/audit'
import { isAdminEquivalent } from '@/lib/roles'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !isAdminEquivalent(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { approvalItemId, result } = await request.json()
  if (!approvalItemId || !result) {
    return NextResponse.json({ error: 'approvalItemId and result are required' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  const { data: item } = await serviceSupabase
    .from('approval_items')
    .select('*, approval_votes(*)')
    .eq('id', approvalItemId)
    .single()

  if (!item) return NextResponse.json({ error: 'Approval item not found' }, { status: 404 })

  const votes = item.approval_votes as Array<{ vote: string }>
  const voteOutcome = {
    approve: votes.filter((v) => v.vote === 'Approve').length,
    disapprove: votes.filter((v) => v.vote === 'Disapprove').length,
    abstain: votes.filter((v) => v.vote === 'Abstain').length,
    request_clarification: votes.filter((v) => v.vote === 'Request Clarification').length,
    total_eligible: votes.length,
    result: result as 'approved' | 'rejected',
  }

  const resolution = await generateResolution(
    item.title,
    item.proposal_text,
    voteOutcome
  )

  await serviceSupabase
    .from('approval_items')
    .update({
      status: result,
      resolution_text: resolution.resolution_text,
      closed_at: new Date().toISOString(),
    })
    .eq('id', approvalItemId)

  await logAudit(profile.id, 'approval_closed', 'approval_item', approvalItemId, {
    result,
    vote_outcome: voteOutcome,
  })

  return NextResponse.json({ resolution })
}
