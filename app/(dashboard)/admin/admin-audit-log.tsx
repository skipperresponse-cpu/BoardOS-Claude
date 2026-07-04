'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface AuditEntry {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  user: { full_name: string } | null
}

interface Props {
  logs: AuditEntry[]
}

const COLLAPSED_ROW_COUNT = 8

export function AdminAuditLog({ logs }: Props) {
  const [minimised, setMinimised] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (logs.length === 0) {
    return <p className="text-sm text-slate-400">No audit entries yet.</p>
  }

  const visibleLogs = showAll ? logs : logs.slice(0, COLLAPSED_ROW_COUNT)
  const hasMore = logs.length > COLLAPSED_ROW_COUNT

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setMinimised((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-3 bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <span>{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</span>
        {minimised ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {!minimised && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 font-medium text-slate-500">Action</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden sm:table-cell">Resource</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500 hidden md:table-cell">User</th>
                <th className="text-left px-6 py-3 font-medium text-slate-500">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Badge className="bg-slate-100 text-slate-600 font-mono text-xs">{log.action}</Badge>
                  </td>
                  <td className="px-6 py-3 text-slate-500 hidden sm:table-cell text-xs">
                    {log.resource_type}
                    {log.resource_id && <span className="ml-1 text-slate-400">#{log.resource_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-600 hidden md:table-cell">
                    {log.user?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-400">{formatDateTime(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-6 py-2.5 text-sm text-slate-500 hover:bg-slate-50 border-t border-slate-100"
            >
              {showAll ? 'Show less' : `Show all ${logs.length}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
