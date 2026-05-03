import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APPROVAL_STATUS_COLORS, formatDate, cn } from '@/lib/utils'
import { ApprovalDetailClient } from './approval-detail-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ApprovalDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('user_id', user.id)
    .single()

  const { data: item } = await supabase
    .from('approval_items')
    .select('*, creator:profiles!created_by(full_name)')
    .eq('id', id)
    .single()

  if (!item) notFound()

  const { data: votes } = await supabase
    .from('approval_votes')
    .select('*, voter:profiles!voter_user_id(full_name)')
    .eq('approval_item_id', id)
    .order('updated_at', { ascending: false })

  const { data: comments } = await supabase
    .from('approval_comments')
    .select('*, user:profiles!user_id(full_name)')
    .eq('approval_item_id', id)
    .is('parent_comment_id', null)
    .order('created_at')

  const myVote = votes?.find((v) => v.voter_user_id === profile?.id)

  const voteSummary = {
    approve: votes?.filter((v) => v.vote === 'Approve').length ?? 0,
    disapprove: votes?.filter((v) => v.vote === 'Disapprove').length ?? 0,
    abstain: votes?.filter((v) => v.vote === 'Abstain').length ?? 0,
    request_clarification: votes?.filter((v) => v.vote === 'Request Clarification').length ?? 0,
    total: votes?.length ?? 0,
  }

  return (
    <div>
      <Header
        title={item.title}
        description={item.summary}
        action={
          <Badge className={cn(APPROVAL_STATUS_COLORS[item.status])}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ApprovalDetailClient
            item={item}
            votes={votes ?? []}
            comments={comments ?? []}
            myVote={myVote ?? null}
            voteSummary={voteSummary}
            userRole={profile?.role ?? 'viewer'}
            currentProfileId={profile?.id ?? ''}
            currentUserName={profile?.full_name ?? ''}
          />
        </div>

        <div className="space-y-4">
          {/* Vote Summary */}
          <Card>
            <CardHeader><CardTitle>Vote Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <VoteBar label="Approve" count={voteSummary.approve} total={voteSummary.total} color="bg-green-500" />
              <VoteBar label="Disapprove" count={voteSummary.disapprove} total={voteSummary.total} color="bg-red-500" />
              <VoteBar label="Abstain" count={voteSummary.abstain} total={voteSummary.total} color="bg-slate-300" />
              <VoteBar label="Clarification" count={voteSummary.request_clarification} total={voteSummary.total} color="bg-amber-400" />
              <p className="text-xs text-slate-400 mt-2">{voteSummary.total} vote{voteSummary.total !== 1 ? 's' : ''} cast</p>
            </CardContent>
          </Card>

          {/* Item Details */}
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <p className="text-slate-800 capitalize">{item.approval_type.replace('_', ' ')}</p>
              </div>
              {item.voting_deadline && (
                <div>
                  <p className="text-xs text-slate-500">Deadline</p>
                  <p className="text-slate-800">{formatDate(item.voting_deadline)}</p>
                </div>
              )}
              {item.closed_at && (
                <div>
                  <p className="text-xs text-slate-500">Closed</p>
                  <p className="text-slate-800">{formatDate(item.closed_at)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500">Created by</p>
                <p className="text-slate-800">{(item.creator as { full_name: string } | null)?.full_name ?? '—'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Resolution (if closed) */}
          {item.resolution_text && (
            <Card>
              <CardHeader><CardTitle>Resolution</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{item.resolution_text}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function VoteBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
