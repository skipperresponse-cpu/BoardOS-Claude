import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageSubcommittees } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subcommittees')
    .select(`
      *,
      chair:profiles!chair_user_id(id, full_name),
      members:subcommittee_members(*, profile:profiles!user_id(id, full_name, role))
    `)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// RLS on subcommittees already restricts insert to admin_equivalent
// (current_user_role_tier() = 'admin_equivalent', identical to
// canManageSubcommittees), so this can safely use the cookie-aware client —
// the route mainly centralises validation and audit logging.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canManageSubcommittees(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can create a subcommittee' }, { status: 403 })
  }

  const { name, term_start, term_end, chair_user_id } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data: subcommittee, error } = await supabase
    .from('subcommittees')
    .insert({
      name: name.trim(),
      term_start: term_start || null,
      term_end: term_end || null,
      chair_user_id: chair_user_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'subcommittee_created', 'subcommittee', subcommittee.id, { name: subcommittee.name })
  return NextResponse.json(subcommittee, { status: 201 })
}
