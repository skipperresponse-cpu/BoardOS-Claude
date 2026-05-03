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

export function AdminAuditLog({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate-400">No audit entries yet.</p>
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
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
          {logs.map((log) => (
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
    </div>
  )
}
