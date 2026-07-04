import { Resend } from 'resend'

// Lazily constructed — the Resend SDK throws synchronously in its constructor
// if the API key is missing, which would crash module evaluation (and the
// build itself) for every route that transitively imports this file, even
// ones that never actually send an email. Deferring construction to first use
// means a missing key only fails the specific send attempt, not the build.
let _client: Resend | null = null
export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY)
  return _client
}

// Falls back to Resend's shared sandbox sender, which only delivers to the
// Resend account owner's own verified email — fine for testing, replace with
// a verified domain address once one exists.
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'BoardOS <onboarding@resend.dev>'
