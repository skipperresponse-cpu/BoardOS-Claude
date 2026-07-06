import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { MeetingsClient } from './meetings-client'
import { redirect } from 'next/navigation'

export default async function MeetingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const [{ data: meetings }, { data: profiles }, { data: subcommittees }] = await Promise.all([
    supabase
      .from('meetings')
      .select('*, creator:profiles!created_by(full_name), subcommittee:subcommittees!subcommittee_id(id, name)')
      .order('meeting_date', { ascending: false }),
    // Attendee checkbox source (Task 3's org-structure stub) — viewer has no
    // meeting-participation role, so excluded here specifically. Board
    // members/advisors/staff (administrator) come straight from profiles;
    // subcommittee members (including external) layer on top per subcommittee.
    supabase.from('profiles').select('id, full_name, role').neq('role', 'viewer').order('full_name'),
    supabase
      .from('subcommittees')
      .select('*, members:subcommittee_members(*, profile:profiles!user_id(id, full_name, role))')
      .order('name'),
  ])

  return (
    <div>
      <Header title="Meetings" description="Board meeting records and minutes." />
      <MeetingsClient
        meetings={meetings ?? []}
        profiles={profiles ?? []}
        subcommittees={subcommittees ?? []}
        userRole={profile?.role ?? 'viewer'}
      />
    </div>
  )
}
