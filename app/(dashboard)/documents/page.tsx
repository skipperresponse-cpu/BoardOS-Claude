import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { DocumentsClient } from './documents-client'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user!.id)
    .single()

  const { data: documents } = await supabase
    .from('documents')
    .select('*, uploader:profiles!uploaded_by(full_name)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <Header title="Documents" description="Governance documents and records." />
      <DocumentsClient documents={documents ?? []} userRole={profile?.role ?? 'viewer'} />
    </div>
  )
}
