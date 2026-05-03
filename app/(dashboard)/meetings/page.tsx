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

  const { data: meetings } = await supabase
    .from('meetings')
    .select('*, creator:profiles!created_by(full_name)')
    .order('meeting_date', { ascending: false })

  return (
    <div>
      <Header title="Meetings" description="Board meeting records and minutes." />
      <MeetingsClient meetings={meetings ?? []} userRole={profile?.role ?? 'viewer'} />
    </div>
  )
}
