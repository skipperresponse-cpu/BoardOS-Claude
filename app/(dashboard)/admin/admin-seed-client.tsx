'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function AdminSeedClient() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const router = useRouter()

  async function handleSeed() {
    if (!confirm('This will insert demo board members, meetings, documents, action items, and approvals. Run now?')) return
    setStatus('loading')
    setMessage('')
    setLog([])
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Seed failed')
      } else {
        setStatus('done')
        setMessage(data.message ?? 'Done')
        setLog(data.log ?? [])
        router.refresh()
      }
    } catch {
      setStatus('error')
      setMessage('Network error')
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
          <Database className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-900">Seed Demo Data</h4>
          <p className="text-sm text-slate-500 mt-1">
            Populate the database with realistic NRCS governance data: 5 board members, 9 documents, 8 meetings, 22 action items, and 4 approval proposals with votes.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSeed}
              disabled={status === 'loading'}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {status === 'loading' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Seeding… (may take 30–60s)</>
              ) : (
                <><Database className="h-4 w-4" /> Run Seed</>
              )}
            </button>

            {status === 'done' && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
                <CheckCircle2 className="h-4 w-4" /> {message}
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                <AlertCircle className="h-4 w-4" /> {message}
              </span>
            )}
          </div>

          {log.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setShowLog(v => !v)} className="text-xs text-slate-400 hover:text-slate-600">
                {showLog ? 'Hide' : 'Show'} seed log ({log.length} entries)
              </button>
              {showLog && (
                <pre className="mt-2 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto font-mono">
                  {log.join('\n')}
                </pre>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400 mt-3">
            Safe to run again — duplicate meetings and documents are skipped automatically. Board member users are created once.
          </p>
        </div>
      </div>
    </div>
  )
}
