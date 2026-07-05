import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageSubcommittees } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params
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

  const { error } = await supabase
    .from('subcommittee_members')
    .delete()
    .eq('id', memberId)
    .eq('subcommittee_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(profile.id, 'subcommittee_member_removed', 'subcommittee', id, { member_id: memberId })
  return NextResponse.json({ success: true })
}
