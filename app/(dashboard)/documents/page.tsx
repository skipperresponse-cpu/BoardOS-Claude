import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { DocumentsClient } from './documents-client'
import type { DocumentFolder } from '@/types'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: documents },
    { data: folders },
    { data: docFolderIds },
  ] = await Promise.all([
    supabase.from('profiles').select('id, role').eq('user_id', user!.id).single(),
    supabase
      .from('documents')
      .select('*, uploader:profiles!uploaded_by(full_name), folder:document_folders!folder_id(id, name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('document_folders')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true }),
    supabase.from('documents').select('folder_id'),
  ])

  const countMap: Record<string, number> = {}
  docFolderIds?.forEach((d: { folder_id: string | null }) => {
    if (d.folder_id) countMap[d.folder_id] = (countMap[d.folder_id] ?? 0) + 1
  })

  const foldersWithCounts = (folders ?? []).map((f: DocumentFolder) => ({
    ...f,
    document_count: countMap[f.id] ?? 0,
  }))

  return (
    <div>
      <Header title="Documents" description="Governance documents and records." />
      <DocumentsClient
        documents={documents ?? []}
        folders={foldersWithCounts}
        userRole={profile?.role ?? 'viewer'}
      />
    </div>
  )
}
