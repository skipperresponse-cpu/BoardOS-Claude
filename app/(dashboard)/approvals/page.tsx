import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ApprovalsClient } from './approvals-client'
import { redirect } from 'next/navigation'

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: approvals } = await supabase
    .from('approval_items')
    .select('*, creator:profiles!created_by(full_name)')
    .order('created_at', { ascending: false })

  const { data: documents } = await supabase
    .from('documents')
    .select('id, title')
    .eq('status', 'active')
    .order('title')

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title')
    .order('meeting_date', { ascending: false })
    .limit(20)

  return (
    <div>
      <Header title="Approvals" description="Board proposals, voting, and resolutions." />
      <ApprovalsClient
        approvals={approvals ?? []}
        documents={documents ?? []}
        meetings={meetings ?? []}
        userRole={profile?.role ?? 'viewer'}
        currentProfileId={profile?.id ?? ''}
      />
    </div>
  )
}
