import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMinutes } from '@/lib/ai/claude'
import { enforceAiRateLimit } from '@/lib/ai/rate-limit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const rate = await enforceAiRateLimit(profile.id, 'ai/minutes')
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `AI usage limit reached (${rate.limit}/hour). Please try again later.` },
      { status: 429 }
    )
  }

  const { transcript, agenda, meetingDetails } = await request.json()

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
  }

  try {
    const result = await generateMinutes(
      transcript,
      agenda ?? '',
      meetingDetails ?? { title: 'Board Meeting', date: new Date().toISOString(), attendees: [], absentees: [] }
    )

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai/minutes] pipeline failed: ${message}`)
    return NextResponse.json(
      { error: 'Failed to generate minutes. Please try again.' },
      { status: 500 }
    )
  }
}
