import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { isAdminEquivalent } from '@/lib/roles'
import { OutstandingAgendaClient } from './outstanding-agenda-client'

export default async function OutstandingAgendaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!isAdminEquivalent(profile?.role)) redirect('/')

  const { data: items } = await supabase
    .from('agenda_items')
    .select('*, submitter:profiles!submitted_by(full_name), resolution:resolutions(*), attachments:documents!agenda_item_id(*)')
    .is('current_meeting_id', null)
    .order('created_at', { ascending: true })

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, meeting_date, status')
    .in('status', ['draft', 'agenda_open'])
    .order('meeting_date', { ascending: true })

  return (
    <div>
      <Header title="Outstanding Agenda" description="Deferred agenda items and resolution acknowledgements awaiting a meeting." />
      <OutstandingAgendaClient items={items ?? []} meetings={meetings ?? []} />
    </div>
  )
}
