'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate, cn } from '@/lib/utils'
import { canFlagForResolution, canVoteApprovals } from '@/lib/roles'
import type { Resolution, ApprovalVote, VoteOption, UserRole } from '@/types'
import { useRouter } from 'next/navigation'

interface Props {
  resolution: Resolution
  votes: ApprovalVote[]
  myVote: ApprovalVote | null
  userRole: UserRole
  currentProfileId: string
}

const VOTE_OPTIONS: { value: VoteOption; label: string; class: string }[] = [
  { value: 'Approve', label: 'Approve', class: 'bg-green-600 hover:bg-green-700 text-white' },
  { value: 'Disapprove', label: 'Disapprove', class: 'bg-red-600 hover:bg-red-700 text-white' },
  { value: 'Abstain', label: 'Abstain', class: 'bg-slate-200 hover:bg-slate-300 text-slate-800' },
]

export function ResolutionDetailClient({ resolution, votes: initialVotes, myVote: initialMyVote, userRole, currentProfileId }: Props) {
  const [votes, setVotes] = useState(initialVotes)
  const [myVote, setMyVote] = useState(initialMyVote)
  const [voteReason, setVoteReason] = useState(initialMyVote?.reason ?? '')
  const [submittingVote, setSubmittingVote] = useState(false)
  const [circulating, setCirculating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const canCirculate = resolution.status === 'draft' && canFlagForResolution(userRole)
  const canVote = resolution.status === 'circulated' && canVoteApprovals(userRole)

  async function handleCirculate() {
    setCirculating(true)
    const res = await fetch(`/api/resolutions/${resolution.id}/circulate`, { method: 'POST' })
    setCirculating(false)
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to circulate')
    }
  }

  async function castVote(vote: VoteOption) {
    setSubmittingVote(true)
    if (myVote) {
      await supabase.from('approval_votes').update({ vote, reason: voteReason }).eq('id', myVote.id)
      setMyVote({ ...myVote, vote, reason: voteReason })
    } else {
      const { data } = await supabase.from('approval_votes').insert({
        approval_item_id: resolution.approval_item_id,
        voter_user_id: currentProfileId,
        vote,
        reason: voteReason,
      }).select('*, voter:profiles!voter_user_id(full_name)').single()
      if (data) {
        setMyVote(data)
        setVotes((prev) => [data, ...prev])
      }
    }
    setSubmittingVote(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {canCirculate && (
        <Card className="p-4 bg-indigo-50 border-indigo-200">
          <p className="text-sm text-indigo-900 mb-3">
            This resolution is still a draft. Circulating it opens voting to eligible board-tier members
            (in-app only — no email is sent yet).
          </p>
          <Button size="sm" disabled={circulating} onClick={handleCirculate}>
            {circulating ? 'Circulating...' : 'Circulate for Signature'}
          </Button>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="prose text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {resolution.content}
          </div>
        </CardContent>
      </Card>

      {resolution.status === 'circulated' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {!canVote ? (
              <p className="text-sm text-slate-500">You do not have permission to sign this resolution.</p>
            ) : (
              <>
                {myVote && (
                  <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                    Your current vote: <strong>{myVote.vote}</strong>. You can change it while circulation is open.
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">Cast your vote:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {VOTE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => castVote(opt.value)}
                        disabled={submittingVote}
                        className={cn(
                          'rounded-md px-4 py-3 text-sm font-medium transition-colors border-2',
                          myVote?.vote === opt.value ? 'ring-2 ring-offset-1 ring-slate-800 ' + opt.class : opt.class + ' border-transparent',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
                  <Textarea value={voteReason} onChange={(e) => setVoteReason(e.target.value)} rows={2} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Votes ({votes.length})</p>
        {votes.length === 0 ? (
          <p className="text-sm text-slate-400">No votes cast yet.</p>
        ) : (
          <div className="space-y-2">
            {votes.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-md px-3 py-2">
                <span className="text-slate-700">{(v.voter as { full_name: string } | null)?.full_name ?? '—'}</span>
                <div className="flex items-center gap-3">
                  <Badge className={
                    v.vote === 'Approve' ? 'bg-green-100 text-green-700'
                    : v.vote === 'Disapprove' ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-600'
                  }>{v.vote}</Badge>
                  <span className="text-xs text-slate-400">{formatDate(v.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
