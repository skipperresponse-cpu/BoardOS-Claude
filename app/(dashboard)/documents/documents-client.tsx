'use client'

import { useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_CATEGORIES, formatDate, cn } from '@/lib/utils'
import { canManageDocuments } from '@/lib/roles'
import type { Document, DocumentCategory, DocumentFolder, UserRole } from '@/types'
import {
  Upload, Search, FileText, X, LayoutList, LayoutGrid,
  Download, Trash2, Folder, FolderOpen,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'folder'
type ViewMode = 'list' | 'grid'
type DocWithFolder = Document & { folder?: { id: string; name: string } | null }
type FolderWithCount = DocumentFolder & { document_count: number }

interface Props {
  documents: DocWithFolder[]
  folders: FolderWithCount[]
  userRole: UserRole
}

function getSaved<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const v = localStorage.getItem(key)
  return (v !== null ? v : fallback) as T
}

function fileTypeBadge(filePath: string): { label: string; cls: string } {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, { label: string; cls: string }> = {
    pdf:  { label: 'PDF',  cls: 'bg-red-100 text-red-700' },
    docx: { label: 'DOCX', cls: 'bg-blue-100 text-blue-700' },
    md:   { label: 'MD',   cls: 'bg-purple-100 text-purple-700' },
  }
  return map[ext ?? ''] ?? { label: 'TXT', cls: 'bg-slate-100 text-slate-600' }
}

export function DocumentsClient({ documents: initialDocs, folders: initialFolders, userRole }: Props) {
  const [documents, setDocuments] = useState<DocWithFolder[]>(initialDocs)
  const [folders, setFolders] = useState<FolderWithCount[]>(initialFolders)
  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => getSaved('boardos_docs_view', 'list'))
  const [sort, setSort] = useState<SortKey>(() => getSaved('boardos_docs_sort', 'date_desc'))
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [form, setForm] = useState({
    title: '',
    category: 'Policy' as DocumentCategory,
    description: '',
    document_date: '',
    folder_id: initialFolders.find(f => f.name === 'General')?.id ?? '',
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const generalFolder = useMemo(() => folders.find(f => f.name === 'General'), [folders])
  const systemFolders = useMemo(() => folders.filter(f => f.is_system), [folders])
  const customFolders = useMemo(
    () => [...folders.filter(f => !f.is_system)].sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  )

  const folderDocCounts = useMemo(() => {
    const m: Record<string, number> = {}
    documents.forEach(d => {
      if (d.folder_id) m[d.folder_id] = (m[d.folder_id] ?? 0) + 1
    })
    return m
  }, [documents])

  const filtered = useMemo(() => {
    let list = documents
    if (activeFolder !== null) list = list.filter(d => d.folder_id === activeFolder)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.folder?.name ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'date_asc':  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'name_asc':  return a.title.localeCompare(b.title)
        case 'name_desc': return b.title.localeCompare(a.title)
        case 'folder':    return (a.folder?.name ?? '').localeCompare(b.folder?.name ?? '')
        default:          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
  }, [documents, activeFolder, search, sort])

  function changeView(v: ViewMode) { setView(v); localStorage.setItem('boardos_docs_view', v) }
  function changeSort(s: SortKey) { setSort(s); localStorage.setItem('boardos_docs_sort', s) }

  function resetForm() {
    setForm({
      title: '', category: 'Policy', description: '', document_date: '',
      folder_id: generalFolder?.id ?? '',
    })
    setShowNewFolderInput(false)
    setNewFolderName('')
    setUploadError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setUploadError('')
    const file = fileRef.current?.files?.[0]
    if (!file) { setUploadError('Please select a file.'); return }

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
    if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) {
      setUploadError('Only PDF, DOCX, TXT, and MD files are supported.')
      return
    }
    if (showNewFolderInput && !newFolderName.trim()) {
      setUploadError('Enter a name for the new folder.')
      return
    }

    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile } = await supabase
        .from('profiles').select('id').eq('user_id', user.id).single()

      let folderId: string | null = form.folder_id || generalFolder?.id || null

      if (showNewFolderInput && newFolderName.trim()) {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newFolderName.trim() }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to create folder')
        folderId = data.id
        setFolders(prev => [...prev, { ...data, document_count: 0 }])
      }

      const filePath = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: storageErr } = await supabase.storage
        .from('governance-docs')
        .upload(filePath, file, { upsert: false })
      if (storageErr) throw storageErr

      const { data: doc, error: insertErr } = await supabase
        .from('documents')
        .insert({
          title: form.title,
          category: form.category,
          description: form.description || null,
          file_path: filePath,
          uploaded_by: profile?.id,
          document_date: form.document_date || null,
          folder_id: folderId,
          status: 'active',
        })
        .select('*, uploader:profiles!uploaded_by(full_name), folder:document_folders!folder_id(id, name)')
        .single()

      if (insertErr) throw insertErr

      fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })

      setDocuments(prev => [doc as DocWithFolder, ...prev])
      setShowUpload(false)
      resetForm()
      router.refresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteDocument(doc: DocWithFolder) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    setDeletingDocId(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Delete failed')
        return
      }
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } finally {
      setDeletingDocId(null)
    }
  }

  async function handleDeleteFolder(folder: FolderWithCount) {
    if (!confirm(`Delete folder "${folder.name}"?`)) return
    const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? 'Delete failed')
      return
    }
    setFolders(prev => prev.filter(f => f.id !== folder.id))
    if (activeFolder === folder.id) setActiveFolder(null)
  }

  function handleDownload(doc: DocWithFolder) {
    window.open(`/api/documents/${doc.id}/download`, '_blank')
  }

  const folderBtnCls = (id: string | null) => cn(
    'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left',
    activeFolder === id
      ? 'bg-slate-100 font-semibold text-slate-900'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  )

  return (
    <div>
      {/* Upload button */}
      {canManageDocuments(userRole) && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => { setShowUpload(v => !v); if (showUpload) resetForm() }}
            variant="primary"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      )}

      <div className="flex gap-6">
        {/* ── Desktop folder sidebar ── */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <nav className="space-y-0.5">
            <button onClick={() => setActiveFolder(null)} className={folderBtnCls(null)}>
              <span className="flex items-center gap-2">
                <LayoutList className="h-4 w-4 flex-shrink-0" />
                All Documents
              </span>
              <span className="text-xs text-slate-400">{documents.length}</span>
            </button>

            {systemFolders.length > 0 && (
              <div className="pt-3">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Folders
                </p>
                {systemFolders.map(f => (
                  <button key={f.id} onClick={() => setActiveFolder(f.id)} className={folderBtnCls(f.id)}>
                    <span className="flex items-center gap-2 truncate">
                      <Folder className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {folderDocCounts[f.id] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {customFolders.length > 0 && (
              <div className="pt-3">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Custom
                </p>
                {customFolders.map(f => {
                  const count = folderDocCounts[f.id] ?? 0
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        'flex items-center rounded-md transition-colors',
                        activeFolder === f.id ? 'bg-slate-100' : 'hover:bg-slate-50'
                      )}
                    >
                      <button
                        onClick={() => setActiveFolder(f.id)}
                        className={cn(
                          'flex-1 flex items-center gap-2 px-3 py-2 text-sm min-w-0',
                          activeFolder === f.id ? 'font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        <FolderOpen className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                      <div className="flex items-center gap-1 pr-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{count}</span>
                        {canManageDocuments(userRole) && count === 0 && (
                          <button
                            onClick={() => handleDeleteFolder(f)}
                            className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                            title="Delete folder"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </nav>
        </aside>

        {/* ── Main content area ── */}
        <div className="flex-1 min-w-0">
          {/* Mobile folder pills */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
            <button
              onClick={() => setActiveFolder(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                activeFolder === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              All ({documents.length})
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  activeFolder === f.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {f.name} ({folderDocCounts[f.id] ?? 0})
              </button>
            ))}
          </div>

          {/* ── Upload form ── */}
          {showUpload && (
            <Card className="mb-6 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Upload New Document</h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="doc-title">Document Title *</Label>
                    <Input
                      id="doc-title"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Safeguarding Policy 2024"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="doc-folder">Folder *</Label>
                    <Select
                      id="doc-folder"
                      value={showNewFolderInput ? '__new__' : form.folder_id}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowNewFolderInput(true)
                          setNewFolderName('')
                        } else {
                          setShowNewFolderInput(false)
                          setForm({ ...form, folder_id: e.target.value })
                        }
                      }}
                    >
                      <optgroup label="System Folders">
                        {systemFolders.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </optgroup>
                      {customFolders.length > 0 && (
                        <optgroup label="Custom Folders">
                          {customFolders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </optgroup>
                      )}
                      <option value="__new__">+ Create new folder…</option>
                    </Select>
                    {showNewFolderInput && (
                      <Input
                        className="mt-2"
                        placeholder="New folder name…"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>

                  <div>
                    <Label htmlFor="doc-category">Category *</Label>
                    <Select
                      id="doc-category"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}
                    >
                      {DOCUMENT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="doc-date">Document Date</Label>
                    <Input
                      id="doc-date"
                      type="date"
                      value={form.document_date}
                      onChange={(e) => setForm({ ...form, document_date: e.target.value })}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor="doc-file">File *</Label>
                    <input
                      ref={fileRef}
                      id="doc-file"
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm file:font-medium hover:file:bg-slate-200 cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="doc-desc">Description</Label>
                  <Textarea
                    id="doc-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description of this document…"
                    rows={2}
                  />
                </div>

                {uploadError && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {uploadError}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setShowUpload(false); resetForm() }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* ── Toolbar ── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Search by name or folder…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              className="sm:w-56"
            >
              <option value="date_desc">Date uploaded (newest first)</option>
              <option value="date_asc">Date uploaded (oldest first)</option>
              <option value="name_asc">File name (A–Z)</option>
              <option value="name_desc">File name (Z–A)</option>
              <option value="folder">Folder name</option>
            </Select>

            <div className="flex rounded-md border border-slate-200 overflow-hidden flex-shrink-0">
              <button
                onClick={() => changeView('list')}
                className={cn(
                  'px-3 py-2 transition-colors',
                  view === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                )}
                title="List view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => changeView('grid')}
                className={cn(
                  'px-3 py-2 border-l border-slate-200 transition-colors',
                  view === 'grid' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                )}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Results ── */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? 'No documents match your search.' : 'No documents in this folder.'}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 text-xs text-slate-500 underline hover:text-slate-700"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : view === 'list' ? (
            /* ── List view ── */
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Document</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Folder</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Uploaded by</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/documents/${doc.id}`}
                          className="font-medium text-slate-900 hover:text-slate-600 block"
                        >
                          {doc.title}
                        </Link>
                        {doc.folder && (
                          <Badge className="mt-1 bg-blue-50 text-blue-700 sm:hidden">
                            {doc.folder.name}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {doc.folder
                          ? <Badge className="bg-blue-50 text-blue-700">{doc.folder.name}</Badge>
                          : <span className="text-slate-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">
                        {(doc.uploader as { full_name: string } | null)?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {canManageDocuments(userRole) && (
                            <button
                              onClick={() => handleDeleteDocument(doc)}
                              disabled={deletingDocId === doc.id}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Grid view ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((doc) => {
                const ft = fileTypeBadge(doc.file_path)
                return (
                  <Card key={doc.id} className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold', ft.cls)}>
                        {ft.label}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1 rounded text-slate-300 hover:text-slate-600 transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canManageDocuments(userRole) && (
                          <button
                            onClick={() => handleDeleteDocument(doc)}
                            disabled={deletingDocId === doc.id}
                            className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <Link href={`/documents/${doc.id}`} className="flex-1 min-h-0">
                      <p className="text-sm font-medium text-slate-900 line-clamp-2 hover:text-slate-600">
                        {doc.title}
                      </p>
                    </Link>
                    <div className="space-y-1">
                      {doc.folder && (
                        <Badge className="bg-blue-50 text-blue-700">{doc.folder.name}</Badge>
                      )}
                      <p className="text-[11px] text-slate-400">{formatDate(doc.created_at)}</p>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
