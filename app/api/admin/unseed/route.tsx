import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const DEMO_EMAILS = [
  'sarah.lim@nrcs.sg',
  'michael.chen@nrcs.sg',
  'rachel.wong@nrcs.sg',
  'james.ong@nrcs.sg',
  'linda.koh@nrcs.sg',
]

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa: any = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const log: string[] = []

  try {
    // 1. Delete approval votes
    const { error: e1 } = await supa.from('approval_votes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (e1) log.push(`WARN approval_votes: ${e1.message}`)
    else log.push('Deleted: approval_votes')

    // 2. Delete approval items
    const { error: e2 } = await supa.from('approval_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (e2) log.push(`WARN approval_items: ${e2.message}`)
    else log.push('Deleted: approval_items')

    // 3. Delete action items
    const { error: e3 } = await supa.from('action_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (e3) log.push(`WARN action_items: ${e3.message}`)
    else log.push('Deleted: action_items')

    // 4. Delete meetings
    const { error: e4 } = await supa.from('meetings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (e4) log.push(`WARN meetings: ${e4.message}`)
    else log.push('Deleted: meetings')

    // 5. Delete document chunks (for demo documents)
    const { data: demoDocs } = await supa.from('documents').select('id').like('file_path', 'demo/%')
    const demoDocIds = (demoDocs ?? []).map((d: { id: string }) => d.id)
    if (demoDocIds.length > 0) {
      const { error: e5 } = await supa.from('document_chunks').delete().in('document_id', demoDocIds)
      if (e5) log.push(`WARN document_chunks: ${e5.message}`)
      else log.push(`Deleted: document_chunks (${demoDocIds.length} docs)`)

      // 6. Delete demo documents
      const { error: e6 } = await supa.from('documents').delete().in('id', demoDocIds)
      if (e6) log.push(`WARN documents: ${e6.message}`)
      else log.push(`Deleted: documents (${demoDocIds.length})`)
    } else {
      log.push('No demo documents found')
    }

    // 7. Delete AI queries for demo users
    const { data: demoProfiles } = await supa.from('profiles').select('id').in('email', DEMO_EMAILS)
    const demoProfileIds = (demoProfiles ?? []).map((p: { id: string }) => p.id)
    if (demoProfileIds.length > 0) {
      await supa.from('ai_queries').delete().in('user_id', demoProfileIds)
      await supa.from('audit_logs').delete().in('user_id', demoProfileIds)
      log.push(`Cleared ai_queries and audit_logs for ${demoProfileIds.length} demo users`)
    }

    // 8. Delete demo board member auth users (triggers profile cascade)
    let deletedUsers = 0
    for (const email of DEMO_EMAILS) {
      const { data: authList } = await supa.auth.admin.listUsers()
      const authUser = (authList?.users ?? []).find((u: { email: string }) => u.email === email)
      if (authUser) {
        const { error: delErr } = await supa.auth.admin.deleteUser(authUser.id)
        if (delErr) log.push(`WARN delete user ${email}: ${delErr.message}`)
        else { deletedUsers++; log.push(`Deleted user: ${email}`) }
      } else {
        log.push(`User not found: ${email}`)
      }
    }
    log.push(`Deleted ${deletedUsers} board member accounts`)

    return NextResponse.json({ message: 'Demo data cleared successfully.', log })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unseed failed'
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
