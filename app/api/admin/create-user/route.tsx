import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminProfile } = await supabase
    .from('profiles').select('id, role').eq('user_id', user.id).single()
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { email, full_name, role, password } = await request.json()
  if (!email || !full_name || !role || !password) {
    return NextResponse.json({ error: 'email, full_name, role, and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Poll briefly for the trigger to create the profile
  let profileId: string | null = null
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500))
    const { data } = await serviceSupabase
      .from('profiles').select('id').eq('user_id', authData.user.id).single()
    if (data) { profileId = (data as { id: string }).id; break }
  }

  if (profileId) {
    await serviceSupabase.from('profiles').update({ role }).eq('id', profileId)
  }

  await logAudit(adminProfile.id, 'user_created', 'profile', profileId, { email, role })

  return NextResponse.json({ success: true, userId: authData.user.id })
}
