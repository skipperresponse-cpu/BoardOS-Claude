import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { canReadMeetings } from '@/lib/roles'
import { SubcommitteesClient } from './subcommittees-client'

export default async function SubcommitteesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!canReadMeetings(profile?.role)) redirect('/')

  const [{ data: subcommittees }, { data: profiles }] = await Promise.all([
    supabase
      .from('subcommittees')
      .select(`
        *,
        chair:profiles!chair_user_id(id, full_name),
        members:subcommittee_members(*, profile:profiles!user_id(id, full_name, role))
      `)
      .order('name'),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
  ])

  return (
    <div>
      <Header title="Subcommittees" description="Standing committee structure, membership, and chairs." />
      <SubcommitteesClient
        subcommittees={subcommittees ?? []}
        profiles={profiles ?? []}
        userRole={profile?.role ?? 'viewer'}
      />
    </div>
  )
}
