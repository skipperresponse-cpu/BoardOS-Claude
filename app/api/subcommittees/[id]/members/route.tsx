import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageSubcommittees } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canManageSubcommittees(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can manage subcommittee membership' }, { status: 403 })
  }

  const { user_id, external_name, external_affiliation, external_email } = await request.json()

  if (!user_id && !external_name?.trim()) {
    return NextResponse.json({ error: 'Provide either an internal user_id or an external_name' }, { status: 400 })
  }
  if (user_id && external_name?.trim()) {
    return NextResponse.json({ error: 'A member is either internal or external, not both' }, { status: 400 })
  }

  const { data: member, error } = await supabase
    .from('subcommittee_members')
    .insert({
      subcommittee_id: id,
      user_id: user_id || null,
      external_name: external_name?.trim() || null,
      external_affiliation: external_affiliation?.trim() || null,
      external_email: external_email?.trim() || null,
    })
    .select('*, profile:profiles!user_id(id, full_name, role)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This person is already a member of this subcommittee' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit(profile.id, 'subcommittee_member_added', 'subcommittee', id, {
    user_id: user_id ?? null,
    external_name: external_name ?? null,
  })

  return NextResponse.json(member, { status: 201 })
}
