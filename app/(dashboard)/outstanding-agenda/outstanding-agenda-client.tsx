'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { AgendaItem, AgendaItemQueueHistory } from '@/types'
import { ChevronDown, ChevronUp, Trash2, ArrowRightCircle, Paperclip, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  items: AgendaItem[]
  meetings: Array<{ id: string; title: string; meeting_date: string; status: string }>
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  edited_approved: 'bg-teal-100 text-teal-700',
  deferred: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-600',
  noted: 'bg-green-100 text-green-700',
}

function ItemRow({ item, meetings, isAcknowledgement }: {
  item: AgendaItem
  meetings: Props['meetings']
  isAcknowledgement: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<AgendaItemQueueHistory[] | null>(null)
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function toggleExpand() {
    if (!expanded && history === null) {
      const res = await fetch(`/api/agenda-items/${item.id}/history`)
      if (res.ok) setHistory(await res.json())
    }
    setExpanded(!expanded)
  }

  async function handleAssign() {
    if (!assignTo) return
    setBusy(true)
    const res = await fetch(`/api/agenda-items/${item.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', assignToMeetingId: assignTo }),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to assign')
    }
  }

  async function handleReject() {
    if (!confirm('Reject this agenda item? It will no longer be actionable.')) return
    setBusy(true)
    const res = await fetch(`/api/agenda-items/${item.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to reject')
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">{item.title}</p>
          {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge className={STATUS_COLORS[item.status] ?? ''}>{item.status.replace('_', ' ')}</Badge>
            {item.submitter && <span className="text-xs text-slate-400">by {item.submitter.full_name}</span>}
          </div>
          {(item.attachments ?? []).length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {item.attachments!.map((doc) => (
                <li key={doc.id} className="flex items-center gap-1.5 text-xs">
                  <Paperclip className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <a
                    href={`/api/documents/${doc.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-600 hover:text-slate-900 hover:underline truncate flex items-center gap-1"
                  >
                    {doc.title}
                    <Download className="h-3 w-3 flex-shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={toggleExpand} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="text-xs flex-1">
          <option value="">Pull into meeting...</option>
          {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </Select>
        <Button size="sm" variant="outline" disabled={!assignTo || busy} onClick={handleAssign}>
          <ArrowRightCircle className="h-3.5 w-3.5" />
        </Button>
        {/* Acknowledgement items get NO delete/dismiss control — not rendered
            at all, not even disabled, per the brief's explicit requirement
            that a passed resolution has no exit path from acknowledgement. */}
        {!isAcknowledgement && (
          <Button size="sm" variant="outline" disabled={busy} onClick={handleReject} title="Reject">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Queue history</p>
          {history === null ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">No history recorded.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-slate-600">
                  {formatDateTime(h.changed_at)} — {h.reason.replace('_', ' ')}
                  {': '}
                  {(h as unknown as { from_meeting?: { title: string } }).from_meeting?.title ?? 'Unassigned'}
                  {' → '}
                  {(h as unknown as { to_meeting?: { title: string } }).to_meeting?.title ?? 'Unassigned'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

export function OutstandingAgendaClient({ items, meetings }: Props) {
  const discussionItems = items.filter((i) => i.type !== 'acknowledgement')
  const acknowledgementItems = items.filter((i) => i.type === 'acknowledgement')

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Discussion Items</h3>
        {discussionItems.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nothing outstanding.</p>
        ) : (
          <div className="space-y-3">
            {discussionItems.map((item) => (
              <ItemRow key={item.id} item={item} meetings={meetings} isAcknowledgement={false} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Resolution Acknowledgements</h3>
        {acknowledgementItems.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nothing outstanding.</p>
        ) : (
          <div className="space-y-3">
            {acknowledgementItems.map((item) => (
              <ItemRow key={item.id} item={item} meetings={meetings} isAcknowledgement={true} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
