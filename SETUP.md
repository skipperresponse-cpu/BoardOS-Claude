# BoardOS Setup Guide

## 1. Supabase Project

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and API keys from: **Settings → API**
3. Fill in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

## 2. Run Database Migration

In your Supabase dashboard → **SQL Editor**, run the entire contents of:
```
supabase/migrations/001_initial.sql
```

## 3. Create Storage Bucket

In Supabase → **Storage**, create a new bucket:
- Name: `governance-docs`
- Public: **No** (private)

Then add these storage RLS policies (in Storage → Policies):
- Authenticated users can upload to `documents/` folder
- Service role has full access

## 4. Anthropic API Key

Get your API key from [console.anthropic.com](https://console.anthropic.com) and add to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## 5. Optional: Voyage AI Embeddings

For production-quality semantic search, get a Voyage AI key at [voyageai.com](https://www.voyageai.com):
```
EMBEDDING_API_KEY=pa-...
```

Without this, a fallback hash-based embedding is used (works but less accurate).

## 6. Create First Admin User

Since there's no public sign-up, create your first admin user directly in Supabase:
1. Go to **Authentication → Users**
2. Click **Add User**
3. Enter email and password
4. In the SQL Editor, run:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```

## 7. Run Locally

```bash
cd boardos
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## 8. Deploy to Vercel

```bash
npx vercel --prod
```

Add all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

## Architecture Notes

- AI answers are grounded only in uploaded documents (RAG)
- Auth is enforced at layout level (no public access)
- All file uploads go to private Supabase Storage
- Claude API key is server-side only — never exposed to browser
