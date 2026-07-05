import { createServiceClient } from '@/lib/supabase/server'
import { canManageMeetings } from '@/lib/roles'

/**
 * Whether this profile can manage THIS SPECIFIC meeting — agenda items
 * (approve/edit/defer/reject/assign) and status transitions through its
 * lifecycle. Layers three sources, any one of which is sufficient:
 *
 *  1. The existing blanket role tier (president/secretary/administrator) —
 *     canManageMeetings, unchanged from before this feature existed.
 *  2. Standing subcommittee chair right — this meeting is scoped to a
 *     subcommittee and the caller is that subcommittee's chair_user_id.
 *     Not date-gated by term_end (confirmed with Daniel): the right lasts
 *     until president/secretary explicitly change/clear chair_user_id.
 *  3. An active ad hoc delegation — president/secretary granted this
 *     specific profile management rights for this specific meeting, and it
 *     hasn't passed its expires_at (2 weeks after grant, by design).
 *
 * Needs a DB round-trip (subcommittee scope + delegation lookup aren't known
 * from the role string alone), so this is async, unlike every other
 * permission check in lib/roles.ts — callers must be server-side (API routes
 * or server components), not inline in client components.
 */
export async function canManageThisMeeting(
  profileId: string,
  role: string | null | undefined,
  meetingId: string
): Promise<boolean> {
  if (canManageMeetings(role)) return true

  const supabase = await createServiceClient()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('subcommittee_id')
    .eq('id', meetingId)
    .single()

  if (meeting?.subcommittee_id) {
    const { data: subcommittee } = await supabase
      .from('subcommittees')
      .select('chair_user_id')
      .eq('id', meeting.subcommittee_id)
      .single()

    if (subcommittee?.chair_user_id === profileId) return true
  }

  const { data: delegation } = await supabase
    .from('meeting_delegations')
    .select('id')
    .eq('meeting_id', meetingId)
    .eq('delegated_to_user_id', profileId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return !!delegation
}
