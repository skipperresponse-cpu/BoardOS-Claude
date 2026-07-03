import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { AskAIClient } from './ask-ai-client'
import { redirect } from 'next/navigation'
import { canUseAI } from '@/lib/roles'

export default async function AskPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!canUseAI(profile?.role)) {
    return (
      <div>
        <Header title="Governance Assistant" />
        <p className="text-slate-500">You do not have permission to use the AI assistant.</p>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Governance Assistant"
        description="Ask about board governance, policies, and best practices. Grounded in your documents, informed by general governance knowledge."
      />
      <AskAIClient />
    </div>
  )
}
