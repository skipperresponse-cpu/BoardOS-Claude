import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { ResolutionsClient } from './resolutions-client'

export default async function ResolutionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: resolutions } = await supabase
    .from('resolutions')
    .select('*, creator:profiles!created_by(full_name)')
    .order('created_at', { ascending: false })

  const { data: approvedItems } = await supabase
    .from('approval_items')
    .select('id, title, status, closed_at')
    .eq('status', 'approved')
    .order('closed_at', { ascending: false })
    .limit(30)

  // Exclude items already formalised as a resolution.
  const resolvedApprovalIds = new Set((resolutions ?? []).map((r) => r.approval_item_id))
  const formalisable = (approvedItems ?? []).filter((a) => !resolvedApprovalIds.has(a.id))

  return (
    <div>
      <Header title="Resolutions" description="Out-of-meeting board decisions, circulated and signed between meetings." />
      <ResolutionsClient
        resolutions={resolutions ?? []}
        formalisableApprovals={formalisable}
        userRole={profile?.role ?? 'viewer'}
      />
    </div>
  )
}
