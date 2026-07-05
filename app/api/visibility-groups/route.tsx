import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageVisibilityGroups } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('visibility_groups')
    .select(`
      *,
      subcommittee:subcommittees!subcommittee_id(id, name),
      members:visibility_group_members(id, user_id, profile:profiles!user_id(id, full_name))
    `)
    .order('is_system', { ascending: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// RLS already restricts insert to admin_equivalent (identical to
// canManageVisibilityGroups), so the cookie-aware client is fine here —
// this route mainly validates the membership-shape and logs the audit entry.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !canManageVisibilityGroups(profile.role)) {
    return NextResponse.json({ error: 'Only President or Secretary can create a visibility group' }, { status: 403 })
  }

  const { name, membershipType, subcommitteeId } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (membershipType !== 'subcommittee' && membershipType !== 'static') {
    return NextResponse.json({ error: 'membershipType must be "subcommittee" or "static" — role-based groups are fixed system groups' }, { status: 400 })
  }
  if (membershipType === 'subcommittee' && !subcommitteeId) {
    return NextResponse.json({ error: 'subcommitteeId is required for a subcommittee-linked group' }, { status: 400 })
  }

  const { data: group, error } = await supabase
    .from('visibility_groups')
    .insert({
      name: name.trim(),
      membership_type: membershipType,
      subcommittee_id: membershipType === 'subcommittee' ? subcommitteeId : null,
      is_system: false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A visibility group with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit(profile.id, 'visibility_group_created', 'visibility_group', group.id, { name: group.name, membershipType })
  return NextResponse.json(group, { status: 201 })
}
