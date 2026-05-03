'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_CATEGORIES, formatDate, cn } from '@/lib/utils'
import type { Document, DocumentCategory, UserRole } from '@/types'
import { Upload, Search, FileText, Archive, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  documents: Document[]
  userRole: UserRole
}

export function DocumentsClient({ documents: initialDocs, userRole }: Props) {
  const [documents, setDocuments] = useState(initialDocs)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    title: '',
    category: 'Policy' as DocumentCategory,
    description: '',
    document_date: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const filtered = documents.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase()) ||
      (d.description ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || d.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setUploadError('')
    const file = fileRef.current?.files?.[0]
    if (!file) { setUploadError('Please select a file.'); return }

    const allowed = ['.pdf', '.docx', '.txt', '.md']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) {
      setUploadError('Only PDF, DOCX, TXT, and MD files are supported.')
      return
    }

    setUploading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      const filePath = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: uploadError } = await supabase.storage
        .from('governance-docs')
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw uploadError

      const { data: doc, error: insertError } = await supabase
        .from('documents')
        .insert({
          title: form.title,
          category: form.category,
          description: form.description || null,
          file_path: filePath,
          uploaded_by: profile?.id,
          document_date: form.document_date || null,
          status: 'active',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Trigger text extraction and chunking in background
      fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })

      setDocuments((prev) => [doc, ...prev])
      setShowUpload(false)
      setForm({ title: '', category: 'Policy', description: '', document_date: '' })
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {/* Filters + Upload */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="sm:w-52"
        >
          <option value="all">All categories</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        {userRole === 'admin' && (
          <Button onClick={() => setShowUpload(!showUpload)} variant="primary">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Upload Form */}
      {showUpload && (
        <Card className="mb-6 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Upload New Document</h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Document Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Safeguarding Policy 2024"
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="document_date">Document Date</Label>
                <Input
                  id="document_date"
                  type="date"
                  value={form.document_date}
                  onChange={(e) => setForm({ ...form, document_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="file">File *</Label>
                <input
                  ref={fileRef}
                  id="file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm file:font-medium hover:file:bg-slate-200 cursor-pointer"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of this document..."
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
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Documents Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 font-medium text-slate-500">Title</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden sm:table-cell">Category</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">Date</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden lg:table-cell">Uploaded</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{doc.title}</div>
                    {doc.description && (
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{doc.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <Badge className="bg-slate-100 text-slate-600">{doc.category}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                    {formatDate(doc.document_date)}
                  </td>
                  <td className="px-6 py-4 text-slate-500 hidden lg:table-cell">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-slate-600 hover:text-slate-900 font-medium text-xs"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
