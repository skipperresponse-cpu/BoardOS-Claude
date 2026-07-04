import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminEquivalent } from '@/lib/roles'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!isAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'President/Secretary access required' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('agenda_item_queue_history')
    .select('*, from_meeting:meetings!from_meeting_id(title), to_meeting:meetings!to_meeting_id(title)')
    .eq('agenda_item_id', id)
    .order('changed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
