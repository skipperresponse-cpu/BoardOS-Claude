import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Auth check with cookie-based client
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

  // Use raw supabase-js client (not SSR wrapper) for auth.admin operations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupa: any = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: authData, error: authError } = await adminSupa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const newUserId: string = authData.user.id

  // Poll for the trigger to create the profile (up to 3s)
  let profileId: string | null = null
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500))
    const { data } = await adminSupa
      .from('profiles').select('id').eq('user_id', newUserId).single()
    if (data?.id) { profileId = data.id; break }
  }

  // If trigger didn't fire, insert profile manually
  if (!profileId) {
    const { data: inserted } = await adminSupa.from('profiles').insert({
      user_id: newUserId,
      full_name,
      email,
      role,
    }).select('id').single()
    profileId = inserted?.id ?? null
  }

  // Ensure role is correctly set (trigger may default to board_member)
  if (profileId) {
    await adminSupa.from('profiles').update({ role, full_name, email }).eq('id', profileId)
  }

  await logAudit(adminProfile.id, 'user_created', 'profile', profileId, { email, role })

  return NextResponse.json({ success: true, userId: newUserId })
}
