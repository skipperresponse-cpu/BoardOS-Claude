'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { APPROVAL_STATUS_COLORS, formatDate, timeAgo, cn } from '@/lib/utils'
import type { ApprovalItem, ApprovalVote, ApprovalComment, VoteOption, ApprovalStatus, UserRole } from '@/types'
import { MessageSquare, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  item: ApprovalItem
  votes: ApprovalVote[]
  comments: ApprovalComment[]
  myVote: ApprovalVote | null
  voteSummary: {
    approve: number
    disapprove: number
    abstain: number
    request_clarification: number
    total: number
  }
  userRole: UserRole
  currentProfileId: string
  currentUserName: string
}

const VOTE_OPTIONS: { value: VoteOption; label: string; class: string }[] = [
  { value: 'Approve', label: 'Approve', class: 'bg-green-600 hover:bg-green-700 text-white' },
  { value: 'Disapprove', label: 'Disapprove', class: 'bg-red-600 hover:bg-red-700 text-white' },
  { value: 'Abstain', label: 'Abstain', class: 'bg-slate-200 hover:bg-slate-300 text-slate-800' },
  { value: 'Request Clarification', label: 'Request Clarification', class: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
]

export function ApprovalDetailClient({ item, votes: initialVotes, comments: initialComments, myVote: initialMyVote, voteSummary, userRole, currentProfileId, currentUserName }: Props) {
  const [activeTab, setActiveTab] = useState<'proposal' | 'vote' | 'comments' | 'votes'>('proposal')
  const [myVote, setMyVote] = useState(initialMyVote)
  const [votes, setVotes] = useState(initialVotes)
  const [comments, setComments] = useState(initialComments)
  const [voteReason, setVoteReason] = useState(initialMyVote?.reason ?? '')
  const [newComment, setNewComment] = useState('')
  const [submittingVote, setSubmittingVote] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [aiSummary, setAiSummary] = useState<{ background: string; decision_required: string; key_considerations: string[]; risks: string[]; financial_implications: string } | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const isOpen = item.status === 'open'
  const canVote = userRole !== 'viewer' && isOpen

  async function castVote(vote: VoteOption) {
    setSubmittingVote(true)
    if (myVote) {
      await supabase.from('approval_votes').update({ vote, reason: voteReason }).eq('id', myVote.id)
      setMyVote({ ...myVote, vote, reason: voteReason })
    } else {
      const { data } = await supabase.from('approval_votes').insert({
        approval_item_id: item.id,
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

  async function submitComment() {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    const { data } = await supabase.from('approval_comments').insert({
      approval_item_id: item.id,
      user_id: currentProfileId,
      comment_text: newComment.trim(),
    }).select('*, user:profiles!user_id(full_name)').single()
    if (data) {
      setComments((prev) => [...prev, data])
      setNewComment('')
    }
    setSubmittingComment(false)
  }

  async function generateSummary() {
    setGeneratingSummary(true)
    const res = await fetch('/api/ai/summarise-proposal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalText: item.proposal_text,
        linkedDocumentIds: item.linked_documents_json ?? [],
      }),
    })
    if (res.ok) {
      setAiSummary(await res.json())
    }
    setGeneratingSummary(false)
  }

  async function adminAction(action: 'paused' | 'open' | 'archived') {
    setAdminLoading(true)
    await supabase.from('approval_items').update({ status: action }).eq('id', item.id)
    setAdminLoading(false)
    router.refresh()
  }

  async function closeApproval(result: 'approved' | 'rejected') {
    setAdminLoading(true)
    await fetch('/api/approvals/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalItemId: item.id, result }),
    })
    setAdminLoading(false)
    router.refresh()
  }

  const tabs = [
    { key: 'proposal', label: 'Proposal' },
    { key: 'vote', label: 'My Vote' },
    { key: 'comments', label: `Comments (${comments.length})` },
    { key: 'votes', label: `All Votes (${votes.length})` },
  ] as const

  return (
    <div className="space-y-4">
      {/* Admin Controls */}
      {userRole === 'admin' && (
        <div className="flex flex-wrap gap-2">
          {item.status === 'open' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => adminAction('paused')} disabled={adminLoading}>Pause Voting</Button>
              <Button size="sm" onClick={() => closeApproval('approved')} disabled={adminLoading}>Close: Approved</Button>
              <Button size="sm" variant="danger" onClick={() => closeApproval('rejected')} disabled={adminLoading}>Close: Rejected</Button>
            </>
          )}
          {item.status === 'paused' && (
            <Button size="sm" onClick={() => adminAction('open')} disabled={adminLoading}>Reopen Voting</Button>
          )}
          {!['archived', 'open'].includes(item.status) && (
            <Button size="sm" variant="ghost" onClick={() => adminAction('archived')} disabled={adminLoading}>Archive</Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-slate-800 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Proposal Tab */}
      {activeTab === 'proposal' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="prose text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {item.proposal_text}
              </div>
            </CardContent>
          </Card>

          {userRole !== 'viewer' && !aiSummary && (
            <Button variant="secondary" size="sm" onClick={generateSummary} disabled={generatingSummary}>
              <Sparkles className="h-4 w-4" />
              {generatingSummary ? 'Generating AI Summary...' : 'Generate AI Summary'}
            </Button>
          )}

          {aiSummary && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700">AI-Generated Summary</span>
                  <Badge className="bg-amber-100 text-amber-700 text-xs">For information only — does not recommend a vote</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-slate-700 mb-1">Background</p>
                    <p className="text-slate-600">{aiSummary.background}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700 mb-1">Decision Required</p>
                    <p className="text-slate-600">{aiSummary.decision_required}</p>
                  </div>
                  {aiSummary.key_considerations.length > 0 && (
                    <div>
                      <p className="font-medium text-slate-700 mb-1">Key Considerations</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600">
                        {aiSummary.key_considerations.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiSummary.risks.length > 0 && (
                    <div>
                      <p className="font-medium text-slate-700 mb-1">Risks</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600">
                        {aiSummary.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-700 mb-1">Financial Implications</p>
                    <p className="text-slate-600">{aiSummary.financial_implications}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Vote Tab */}
      {activeTab === 'vote' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {!canVote ? (
              <p className="text-sm text-slate-500">
                {item.status !== 'open'
                  ? 'Voting is closed for this item.'
                  : 'You do not have permission to vote.'}
              </p>
            ) : (
              <>
                {myVote && (
                  <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                    Your current vote: <strong>{myVote.vote}</strong>. You can change it while voting is open.
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">Cast your vote:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VOTE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => castVote(opt.value)}
                        disabled={submittingVote}
                        className={cn(
                          'rounded-md px-4 py-3 text-sm font-medium transition-colors border-2',
                          myVote?.vote === opt.value
                            ? 'ring-2 ring-offset-1 ring-slate-800 ' + opt.class
                            : opt.class + ' border-transparent',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Reason or comment (optional)
                  </label>
                  <Textarea
                    value={voteReason}
                    onChange={(e) => setVoteReason(e.target.value)}
                    placeholder="Add a reason or clarification for your vote..."
                    rows={3}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <div className="space-y-4">
          {userRole !== 'viewer' && isOpen && (
            <Card>
              <CardContent className="pt-6">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment or question about this proposal..."
                  rows={3}
                />
                <div className="mt-3">
                  <Button size="sm" onClick={submitComment} disabled={submittingComment || !newComment.trim()}>
                    <MessageSquare className="h-4 w-4" />
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {comments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {(c.user as { full_name: string } | null)?.full_name?.charAt(0) ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{(c.user as { full_name: string } | null)?.full_name}</span>
                    <span className="text-xs text-slate-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.comment_text}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Votes Tab */}
      {activeTab === 'votes' && (
        <div>
          {votes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No votes cast yet.</p>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {item.show_individual_votes_to_board && (
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Board Member</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Vote</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Reason</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {votes.map((v) => (
                    <tr key={v.id}>
                      {item.show_individual_votes_to_board && (
                        <td className="px-4 py-3 text-slate-700">{(v.voter as { full_name: string } | null)?.full_name ?? '—'}</td>
                      )}
                      <td className="px-4 py-3">
                        <Badge className={
                          v.vote === 'Approve' ? 'bg-green-100 text-green-700'
                          : v.vote === 'Disapprove' ? 'bg-red-100 text-red-700'
                          : v.vote === 'Abstain' ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-100 text-amber-700'
                        }>{v.vote}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell text-xs">
                        {v.reason ? v.reason.substring(0, 100) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                        {formatDate(v.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
