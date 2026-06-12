# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

This project uses **Next.js 16.2.4** — not the version in your training data. APIs, conventions, and file structure differ from prior versions. Read `node_modules/next/dist/docs/` before writing App Router code and heed deprecation notices.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run lint     # ESLint
```

No test suite is configured.

## Critical: file extensions

`next.config.ts` sets `pageExtensions: ['tsx', 'jsx', 'js']` — `.ts` files are excluded. **All API routes and page files must use `.tsx`**, even if they contain no JSX.

## Architecture

### Authentication & roles

Supabase Auth (email/password). `middleware.ts` gates all `/(dashboard)` routes and redirects unauthenticated users to `/login`. Role is stored in the `profiles` table (`admin` | `board_member` | `viewer`), not in Supabase auth metadata.

Three access levels:
- `admin` — full access + admin panel
- `board_member` — read/write on all content, can use AI
- `viewer` — read-only, no AI access

### Supabase client pattern

There are two distinct clients — **do not swap them**:

| Client | Import | Use for |
|--------|--------|---------|
| Browser | `createClient` from `@/lib/supabase/client` | Client components |
| Server (cookie-aware) | `createClient` from `@/lib/supabase/server` | Server components, API routes for RLS-respecting queries |
| Service role | `createServiceClient` from `@/lib/supabase/server` | Bypasses RLS; use for admin/background operations |
| Raw admin | `createClient as createSupabaseClient` from `@supabase/supabase-js` | **Required** for `auth.admin.*` operations — the SSR wrapper does not support these |

The raw admin pattern (used in seed, unseed, create-user routes):
```ts
const adminSupa: any = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

### Database schema (key tables)

- `profiles` — one row per auth user; `user_id` FK to `auth.users`; `role` field
- `documents` + `document_chunks` — document library with 512-dim pgvector embeddings for RAG
- `meetings` — board meetings; attendees/absentees/agenda stored as JSONB arrays
- `action_items` — task tracking with `owner_user_id` FK to `profiles.id`
- `approval_items` + `approval_votes` — voting workflow
- `audit_logs` — all significant actions logged via `logAudit()` from `@/lib/audit`

A PostgreSQL trigger `handle_new_user` fires on `auth.users` INSERT and creates the `profiles` row. If the trigger is slow, routes poll for it and fall back to a manual insert with `ON CONFLICT (user_id) DO UPDATE`.

### AI / RAG pipeline

`lib/ai/config.ts` — model, token limits, chunk sizes (`AI_CONFIG`)  
`lib/ai/claude.ts` — all Anthropic API calls; exports `askGovernanceQuestion`, `generateMeetingMinutes`, `extractActionItems`, `summariseProposal`, `generateResolution`, `cosineSimilarity`  
`lib/ai/embeddings.ts` — Voyage AI embeddings; falls back to hash-based pseudo-embeddings if `EMBEDDING_API_KEY` is absent

RAG flow in `/api/ai/ask/route.tsx`:
1. Embed the question
2. Fetch all active document chunks
3. Rank by cosine similarity, take top-N (`AI_CONFIG.maxChunksForRAG`)
4. Pass ranked chunks + conversation history to `askGovernanceQuestion`
5. Returns structured `GovernanceAnswer`: `direct_answer`, `document_evidence`, `gaps`, `practical_guidance`, `confidence`, `sources`

### Route layout

```
app/
  (dashboard)/          # auth-gated group; layout.tsx fetches profile + passes to Sidebar
    dashboard/          # overview with KPIs, donut chart, attendance bar chart
    documents/[id]/     # document detail; triggers /api/documents/process on upload
    meetings/[id]/      # meeting detail with AI minutes generation
    action-items/
    approvals/[id]/     # voting UI
    ask/                # conversational governance assistant
    admin/              # seed/unseed, user management (admin-only)
  login/
api/
  ai/ask, ai/minutes, ai/extract-actions, ai/summarise-proposal
  documents/process     # extracts text, chunks, embeds; runs async after upload
  admin/seed, admin/unseed, admin/create-user, admin/invite
  approvals/close
```

### Component conventions

- `*-client.tsx` files are `'use client'` components that receive server-fetched data as props
- Shared UI primitives live in `components/ui/` (Button, Card, Badge, Input, Select, Textarea, Label)
- `Header` component accepts an optional `action` prop for page-level buttons
- Tailwind 4 is used; responsive pattern is mobile-first with `sm:`, `md:`, `lg:` breakpoints

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
EMBEDDING_API_KEY   # optional — Voyage AI; falls back to hash embeddings if absent
```
