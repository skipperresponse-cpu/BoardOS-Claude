import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ActionItemsClient } from './action-items-client'
import { redirect } from 'next/navigation'

export default async function ActionItemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*, owner:profiles!owner_user_id(full_name), meeting:meetings!meeting_id(title)')
    .order('due_date', { ascending: true, nullsFirst: false })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')

  return (
    <div>
      <Header title="Action Items" description="Tasks assigned from board meetings." />
      <ActionItemsClient
        actionItems={actionItems ?? []}
        profiles={profiles ?? []}
        userRole={profile?.role ?? 'viewer'}
        currentProfileId={profile?.id ?? ''}
      />
    </div>
  )
}
