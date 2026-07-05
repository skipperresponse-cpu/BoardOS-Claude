import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { AdminUsersClient } from './admin-users-client'
import { AdminAuditLog } from './admin-audit-log'
import { AdminSeedClient } from './admin-seed-client'
import { AdminVisibilityGroups } from './admin-visibility-groups'
import { canManageUsers } from '@/lib/roles'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!canManageUsers(profile?.role)) redirect('/')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at')

  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*, user:profiles!user_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: stats } = await supabase.rpc('get_stats').maybeSingle() ?? { data: null }

  const [{ data: visibilityGroups }, { data: subcommittees }] = await Promise.all([
    supabase
      .from('visibility_groups')
      .select(`
        *,
        subcommittee:subcommittees!subcommittee_id(id, name),
        members:visibility_group_members(id, user_id, profile:profiles!user_id(id, full_name))
      `)
      .order('is_system', { ascending: false })
      .order('name'),
    supabase.from('subcommittees').select('id, name').order('name'),
  ])

  return (
    <div>
      <Header title="Admin" description="User management and system audit logs." />

      <div className="space-y-8">
        <section>
          <h3 className="text-base font-semibold text-slate-800 mb-4">Demo Data</h3>
          <AdminSeedClient />
        </section>

        <section>
          <h3 className="text-base font-semibold text-slate-800 mb-4">Users</h3>
          <AdminUsersClient profiles={profiles ?? []} />
        </section>

        <section>
          <h3 className="text-base font-semibold text-slate-800 mb-4">Document Visibility Groups</h3>
          <AdminVisibilityGroups
            groups={visibilityGroups ?? []}
            profiles={profiles ?? []}
            subcommittees={subcommittees ?? []}
          />
        </section>

        <section>
          <h3 className="text-base font-semibold text-slate-800 mb-4">Audit Log</h3>
          <AdminAuditLog logs={auditLogs ?? []} />
        </section>
      </div>
    </div>
  )
}
