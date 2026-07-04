import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canFlagForResolution } from '@/lib/roles'
import { logAudit } from '@/lib/audit'
import { sendResolutionCirculatedNotice } from '@/lib/email/reminders'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canFlagForResolution(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const serviceSupabase = await createServiceClient()

  const { data: resolution } = await serviceSupabase
    .from('resolutions')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!resolution) return NextResponse.json({ error: 'Resolution not found' }, { status: 404 })
  if (resolution.status !== 'draft') {
    return NextResponse.json({ error: `Cannot circulate a resolution in status "${resolution.status}"` }, { status: 400 })
  }

  // Re-snapshot eligible voter count at the moment of circulation (may differ
  // from creation time if roles changed since).
  const { count: eligibleVoterCount } = await serviceSupabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('role', ['president', 'secretary', 'treasurer', 'board_member'])

  const { data: updated, error } = await serviceSupabase
    .from('resolutions')
    .update({
      status: 'circulated',
      circulated_at: new Date().toISOString(),
      eligible_voter_count: eligibleVoterCount ?? 0,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'resolution_circulated', 'resolution', id, {})
  await sendResolutionCirculatedNotice(updated)

  return NextResponse.json(updated)
}
