import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { email, full_name, role } = await request.json()

  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'email, full_name, and role are required' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  const { data, error } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAudit(adminProfile.id, 'user_invited', 'profile', null, { email, role })

  return NextResponse.json({ success: true })
}
