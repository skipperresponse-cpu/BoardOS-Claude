/**
 * scripts/reembed.ts
 * ------------------
 * One-off backfill: regenerate embeddings for ALL existing document_chunks
 * using the real Voyage 3.5 Lite path in lib/ai/embeddings.ts.
 *
 * WHY: chunks embedded while the silent hash fallback was active have
 * meaningless vectors. This rebuilds them with real embeddings so RAG works.
 *
 * WHEN TO RUN:
 *   - ONCE after setting a valid EMBEDDING_API_KEY (Voyage), and
 *   - again any time embeddings must be regenerated (e.g. model/dimension change).
 *
 * Usage:  npm run reembed
 *
 * Idempotent & safe to re-run: it overwrites each chunk's embedding with a
 * freshly computed one. It never adds or removes chunks.
 *
 * Requires env (read from .env.local automatically, or the real environment):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMBEDDING_API_KEY
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from '../lib/ai/embeddings'

// --- Load .env.local (standalone scripts don't get Next.js env loading) ---
function loadEnvFile(file: string) {
  try {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8')
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // No .env.local present — fall back to the ambient environment.
  }
}
loadEnvFile('.env.local')

// Force the "fail loud" path in generateEmbedding: if Voyage errors we want a
// thrown error (counted as a failure), never a silent hash re-poisoning.
// (NODE_ENV is typed read-only; assign through a cast.)
;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

const BATCH_SIZE = 20
const DELAY_MS = 500

function fail(msg: string): never {
  console.error(`\n[reembed] ${msg}\n`)
  process.exit(1)
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!process.env.EMBEDDING_API_KEY) {
    fail(
      'EMBEDDING_API_KEY is not set. Set a valid Voyage key before re-embedding — ' +
        'otherwise the vectors would be meaningless (this script refuses to run without it).'
    )
  }
  if (!supabaseUrl || !serviceKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('[reembed] Fetching all document chunks…')
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text')
    .order('id', { ascending: true })

  if (error) fail(`Failed to fetch chunks: ${error.message}`)

  const total = chunks?.length ?? 0
  if (total === 0) {
    console.log('[reembed] No chunks found. Nothing to do.')
    return
  }

  console.log(`[reembed] Found ${total} chunks. Re-embedding in batches of ${BATCH_SIZE}…`)

  let processed = 0
  let failures = 0

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = chunks!.slice(i, i + BATCH_SIZE)

    for (const chunk of batch) {
      try {
        const text = (chunk.chunk_text ?? '').trim()
        if (!text) {
          processed++
          continue
        }
        const embedding = await generateEmbedding(text)
        const { error: upErr } = await supabase
          .from('document_chunks')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', chunk.id)
        if (upErr) throw new Error(upErr.message)
      } catch (err) {
        failures++
        console.error(
          `[reembed] Chunk ${chunk.id} failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      processed++
    }

    console.log(`[reembed] Re-embedded ${Math.min(processed, total)} of ${total} chunks`)
    if (i + BATCH_SIZE < total) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`[reembed] Done. ${total - failures}/${total} succeeded, ${failures} failed.`)
  if (failures > 0) process.exit(1)
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
