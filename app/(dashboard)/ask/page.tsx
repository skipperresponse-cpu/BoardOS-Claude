import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { AskAIClient } from './ask-ai-client'
import { redirect } from 'next/navigation'

export default async function AskPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role === 'viewer') {
    return (
      <div>
        <Header title="Ask AI" />
        <p className="text-slate-500">You do not have permission to use the AI assistant.</p>
      </div>
    )
  }

  const { data: recentQueries } = await supabase
    .from('ai_queries')
    .select('*')
    .eq('user_id', profile?.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div>
      <Header
        title="Ask AI"
        description="Ask questions grounded only in your uploaded governance documents."
      />
      <AskAIClient recentQueries={recentQueries ?? []} />
    </div>
  )
}
