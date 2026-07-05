import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { DocumentActions } from './document-actions'
import { DocumentFolderControl } from './document-folder-control'
import { DocumentVisibilityControl } from './document-visibility-control'
import { canManageDocuments, canRecategorizeDocuments, isAdminEquivalent } from '@/lib/roles'
import { FileText, Calendar, User, Tag, Folder, Eye } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DocumentDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: doc } = await supabase
    .from('documents')
    .select('*, uploader:profiles!uploaded_by(full_name, email), folder:document_folders!folder_id(id, name), visibility_group:visibility_groups!visibility_group_id(id, name)')
    .eq('id', id)
    .single()

  if (!doc) notFound()

  const serviceSupabase = await createServiceClient()
  const [{ data: urlData }, { count: chunkCount }, { data: folders }, { data: visibilityGroups }] = await Promise.all([
    serviceSupabase.storage.from('governance-docs').createSignedUrl(doc.file_path, 3600),
    serviceSupabase.from('document_chunks').select('id', { count: 'exact', head: true }).eq('document_id', id),
    serviceSupabase.from('document_folders').select('id, name').order('name'),
    serviceSupabase.from('visibility_groups').select('id, name').order('is_system', { ascending: false }).order('name'),
  ])

  const canSetVisibility = isAdminEquivalent(profile?.role) || doc.uploaded_by === profile?.id

  return (
    <div>
      <Header
        title={doc.title}
        description={doc.description ?? undefined}
        action={
          canManageDocuments(profile?.role) ? (
            <DocumentActions documentId={doc.id} currentStatus={doc.status} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Document Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <Tag className="h-3.5 w-3.5" /> Category
                  </dt>
                  <dd><Badge className="bg-slate-100 text-slate-700">{doc.category}</Badge></dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <Folder className="h-3.5 w-3.5" /> Folder
                  </dt>
                  <dd>
                    {canRecategorizeDocuments(profile?.role) ? (
                      <DocumentFolderControl
                        documentId={doc.id}
                        currentFolderId={doc.folder_id}
                        currentFolderName={(doc.folder as { name: string } | null)?.name ?? '—'}
                        folders={folders ?? []}
                      />
                    ) : (
                      <Badge className="bg-slate-100 text-slate-700">{(doc.folder as { name: string } | null)?.name ?? '—'}</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <Eye className="h-3.5 w-3.5" /> Visibility
                  </dt>
                  <dd>
                    {canSetVisibility ? (
                      <DocumentVisibilityControl
                        documentId={doc.id}
                        currentGroupId={doc.visibility_group_id}
                        currentGroupName={(doc.visibility_group as { name: string } | null)?.name ?? '—'}
                        groups={visibilityGroups ?? []}
                      />
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700">{(doc.visibility_group as { name: string } | null)?.name ?? '—'}</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <Calendar className="h-3.5 w-3.5" /> Document Date
                  </dt>
                  <dd className="text-sm text-slate-800">{formatDate(doc.document_date)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <User className="h-3.5 w-3.5" /> Uploaded By
                  </dt>
                  <dd className="text-sm text-slate-800">
                    {(doc.uploader as { full_name: string } | null)?.full_name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
                    <Calendar className="h-3.5 w-3.5" /> Uploaded On
                  </dt>
                  <dd className="text-sm text-slate-800">{formatDate(doc.created_at)}</dd>
                </div>
              </dl>

              {urlData?.signedUrl && (
                <div className="mt-6">
                  <a
                    href={urlData.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Open Document
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Extracted Text Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                {chunkCount && chunkCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    ✓ Indexed — {chunkCount} chunk{chunkCount !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    ⚠ Not indexed — click &quot;Re-process for AI&quot;
                  </span>
                )}
              </div>
              {doc.extracted_text ? (
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-[20]">
                  {doc.extracted_text}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  No text extracted yet. Click &quot;Re-process for AI&quot; to index this document.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
