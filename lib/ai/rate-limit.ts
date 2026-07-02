import { createServiceClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

// Generous per-user hourly cap on AI calls. This is a seatbelt against a runaway
// loop or an over-eager user quietly running up the Anthropic bill during the
// demo period — NOT a metering / quota system. Override via AI_HOURLY_LIMIT.
export const AI_HOURLY_LIMIT = Number(process.env.AI_HOURLY_LIMIT ?? 60)

const AI_CALL_ACTION = 'ai_call'

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
}

/**
 * Counts this profile's AI calls in the last hour (from audit_logs) and, if
 * under the limit, records the current call so it counts toward the window.
 * Returns { allowed: false } when the cap is hit, so the route can respond 429.
 *
 * Fails OPEN: if the counter query errors, the call is allowed through — a
 * broken seatbelt must not block a legitimate board demo.
 *
 * @param profileId  profiles.id (NOT the auth user id)
 * @param route      short label for logging, e.g. 'ai/ask'
 */
export async function enforceAiRateLimit(
  profileId: string,
  route: string
): Promise<RateLimitResult> {
  const limit = AI_HOURLY_LIMIT
  try {
    const supabase = await createServiceClient()
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId)
      .eq('action', AI_CALL_ACTION)
      .gte('created_at', sinceIso)

    if (error) {
      console.error(`[ai-rate-limit] count failed, allowing through: ${error.message}`)
      return { allowed: true, count: 0, limit }
    }

    const used = count ?? 0
    if (used >= limit) {
      console.warn(
        `[ai-rate-limit] BLOCKED profile ${profileId} on ${route}: ${used}/${limit} AI calls in the last hour`
      )
      return { allowed: false, count: used, limit }
    }

    // Record this call so it counts toward the rolling window.
    await logAudit(profileId, AI_CALL_ACTION, 'ai', null, { route })
    return { allowed: true, count: used + 1, limit }
  } catch (err) {
    console.error(
      `[ai-rate-limit] error, allowing through: ${err instanceof Error ? err.message : String(err)}`
    )
    return { allowed: true, count: 0, limit }
  }
}
