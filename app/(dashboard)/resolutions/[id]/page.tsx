import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatDateTime, cn } from '@/lib/utils'
import { ResolutionDetailClient } from './resolution-detail-client'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  circulated: 'bg-blue-100 text-blue-700',
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  noted: 'bg-teal-100 text-teal-700',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function ResolutionDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const { data: resolution } = await supabase
    .from('resolutions')
    .select('*, creator:profiles!created_by(full_name), approval_item:approval_items(*)')
    .eq('id', id)
    .single()

  if (!resolution) notFound()

  const approvalItemId = resolution.approval_item_id

  const { data: votes } = await supabase
    .from('approval_votes')
    .select('*, voter:profiles!voter_user_id(full_name)')
    .eq('approval_item_id', approvalItemId)
    .order('updated_at', { ascending: false })

  const myVote = votes?.find((v) => v.voter_user_id === profile?.id) ?? null

  return (
    <div>
      <Header
        title={resolution.title}
        description={`Pass mode: ${resolution.pass_mode}${resolution.required_threshold ? ` (${Math.round(resolution.required_threshold)}%)` : ''}`}
        action={<Badge className={STATUS_COLORS[resolution.status] ?? ''}>{resolution.status}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ResolutionDetailClient
            resolution={resolution}
            votes={votes ?? []}
            myVote={myVote}
            userRole={profile?.role ?? 'viewer'}
            currentProfileId={profile?.id ?? ''}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">Requested by</p>
                <p className="text-slate-800">{(resolution.creator as { full_name: string } | null)?.full_name ?? '—'}</p>
              </div>
              {resolution.circulated_at && (
                <div>
                  <p className="text-xs text-slate-500">Circulated</p>
                  <p className="text-slate-800">{formatDateTime(resolution.circulated_at)}</p>
                </div>
              )}
              {resolution.eligible_voter_count !== null && (
                <div>
                  <p className="text-xs text-slate-500">Eligible voters</p>
                  <p className="text-slate-800">{resolution.eligible_voter_count}</p>
                </div>
              )}
              {resolution.threshold_reference && (
                <div>
                  <p className="text-xs text-slate-500">Threshold reference</p>
                  <p className="text-slate-800">{resolution.threshold_reference}</p>
                </div>
              )}
              {resolution.vote_result && (
                <div>
                  <p className="text-xs text-slate-500">Vote result</p>
                  <p className="text-slate-800">{resolution.vote_result}</p>
                </div>
              )}
              {resolution.passed_at && (
                <div>
                  <p className="text-xs text-slate-500">Passed</p>
                  <p className="text-slate-800">{formatDate(resolution.passed_at)}</p>
                </div>
              )}
              {resolution.ratified_at_meeting_id && (
                <div>
                  <p className="text-xs text-slate-500">Ratified at meeting</p>
                  <p className={cn('text-slate-800')}>Noted permanently</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
