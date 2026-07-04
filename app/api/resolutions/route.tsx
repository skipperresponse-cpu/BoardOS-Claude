import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canFlagForResolution } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

// Eligible-voter tiers match the existing approval_votes voting-eligibility RLS exactly.
async function countEligibleVoters(serviceSupabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const { count } = await serviceSupabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('role', ['president', 'secretary', 'treasurer', 'board_member'])
  return count ?? 0
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('resolutions')
    .select('*, creator:profiles!created_by(full_name), approval_item:approval_items(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canFlagForResolution(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions to create a resolution' }, { status: 403 })
  }

  const {
    title, content, passMode, thresholdValue, thresholdIsCount, thresholdReference,
    existingApprovalItemId, documentLink,
  } = await request.json()

  if (!title?.trim() || !content?.trim() || !passMode) {
    return NextResponse.json({ error: 'title, content, and passMode are required' }, { status: 400 })
  }
  if (!['unanimous', 'threshold'].includes(passMode)) {
    return NextResponse.json({ error: 'passMode must be unanimous or threshold' }, { status: 400 })
  }
  if (passMode === 'threshold' && (thresholdValue === undefined || thresholdValue === null)) {
    return NextResponse.json({ error: 'thresholdValue is required for threshold mode' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()
  const eligibleVoterCount = await countEligibleVoters(serviceSupabase)

  // Retroactive path: formalise an already-closed/approved approval_item as a resolution.
  if (existingApprovalItemId) {
    const { data: item } = await serviceSupabase
      .from('approval_items')
      .select('*, approval_votes(*)')
      .eq('id', existingApprovalItemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Approval item not found' }, { status: 404 })
    if (item.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved items can be formalised as a resolution' }, { status: 400 })
    }

    const votes = item.approval_votes as Array<{ vote: string }>
    const approveCount = votes.filter((v) => v.vote === 'Approve').length
    const voteResult = `${approveCount} of ${eligibleVoterCount} approved (retroactive)`

    const { data: resolution, error } = await serviceSupabase
      .from('resolutions')
      .insert({
        approval_item_id: existingApprovalItemId,
        title: title.trim(),
        content: content.trim(),
        pass_mode: passMode,
        required_threshold: passMode === 'threshold'
          ? (thresholdIsCount ? (thresholdValue / eligibleVoterCount) * 100 : thresholdValue)
          : null,
        threshold_reference: thresholdReference || null,
        eligible_voter_count: eligibleVoterCount,
        status: 'passed',
        created_by: profile.id,
        circulated_at: item.created_at,
        passed_at: item.closed_at ?? new Date().toISOString(),
        vote_result: voteResult,
        document_link: documentLink || null,
        resolution_requested_by: profile.id,
        resolution_requested_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // No new vote event will fire the pass-detection trigger for a retroactive
    // resolution (the votes already happened), so queue the acknowledgement
    // item directly here — same logic the trigger runs on a fresh pass.
    const { data: nextMeeting } = await serviceSupabase
      .from('meetings')
      .select('id')
      .in('status', ['draft', 'agenda_open'])
      .order('meeting_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: agendaItem } = await serviceSupabase
      .from('agenda_items')
      .insert({
        type: 'acknowledgement',
        current_meeting_id: nextMeeting?.id ?? null,
        submitted_by: null,
        title: resolution.title,
        description: `Acknowledgement of passed resolution: ${resolution.title}`,
        status: 'pending',
        resolution_id: resolution.id,
      })
      .select('id')
      .single()

    if (agendaItem) {
      await serviceSupabase.from('agenda_item_queue_history').insert({
        agenda_item_id: agendaItem.id,
        from_meeting_id: null,
        to_meeting_id: nextMeeting?.id ?? null,
        reason: 'initial_submission',
      })
      await serviceSupabase.from('resolutions').update({ queued_for_meeting_id: nextMeeting?.id ?? null }).eq('id', resolution.id)
    }

    await logAudit(profile.id, 'resolution_formalised_retroactively', 'resolution', resolution.id, { existingApprovalItemId })
    return NextResponse.json(resolution, { status: 201 })
  }

  // Fresh creation path: new approval_item + resolution pair, both draft/open.
  const { data: approvalItem, error: approvalError } = await serviceSupabase
    .from('approval_items')
    .insert({
      title: title.trim(),
      summary: content.trim().slice(0, 300),
      proposal_text: content.trim(),
      approval_type: passMode === 'unanimous' ? 'unanimous' : 'custom',
      custom_threshold: passMode === 'threshold'
        ? (thresholdIsCount ? (thresholdValue / eligibleVoterCount) * 100 : thresholdValue)
        : null,
      status: 'open',
      created_by: profile.id,
    })
    .select()
    .single()

  if (approvalError || !approvalItem) {
    return NextResponse.json({ error: approvalError?.message ?? 'Failed to create approval item' }, { status: 500 })
  }

  const { data: resolution, error } = await serviceSupabase
    .from('resolutions')
    .insert({
      approval_item_id: approvalItem.id,
      title: title.trim(),
      content: content.trim(),
      pass_mode: passMode,
      required_threshold: passMode === 'threshold'
        ? (thresholdIsCount ? (thresholdValue / eligibleVoterCount) * 100 : thresholdValue)
        : null,
      threshold_reference: thresholdReference || null,
      eligible_voter_count: eligibleVoterCount,
      status: 'draft',
      created_by: profile.id,
      document_link: documentLink || null,
      resolution_requested_by: profile.id,
      resolution_requested_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'resolution_created', 'resolution', resolution.id, { passMode })

  return NextResponse.json(resolution, { status: 201 })
}
