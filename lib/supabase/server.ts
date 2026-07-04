import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — middleware handles refresh
          }
        },
      },
    }
  )
}

/**
 * A genuine service-role client that always bypasses RLS. Deliberately uses
 * the plain supabase-js client, NOT @supabase/ssr's cookie-aware wrapper —
 * @supabase/ssr auto-detects and restores a session from request cookies,
 * which overrides the Authorization header with the logged-in user's own
 * JWT instead of the service-role key. That silently defeats RLS bypass
 * whenever a real user session is present (the exact scenario every caller
 * of this function is in), even though the service_role key was passed in.
 */
export async function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
