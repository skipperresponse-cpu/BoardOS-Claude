'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import type { DocumentStatus } from '@/types'

interface Props {
  documentId: string
  currentStatus: DocumentStatus
}

export function DocumentActions({ documentId, currentStatus }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function updateStatus(newStatus: DocumentStatus) {
    setLoading(true)
    await supabase.from('documents').update({ status: newStatus }).eq('id', documentId)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      {currentStatus !== 'archived' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => updateStatus('archived')}
          disabled={loading}
        >
          Archive
        </Button>
      )}
      {currentStatus === 'archived' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => updateStatus('active')}
          disabled={loading}
        >
          Restore
        </Button>
      )}
    </div>
  )
}
