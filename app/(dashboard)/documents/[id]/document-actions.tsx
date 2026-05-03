'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import type { DocumentStatus } from '@/types'

interface Props {
  documentId: string
  currentStatus: DocumentStatus
}

export function DocumentActions({ documentId, currentStatus }: Props) {
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processMsg, setProcessMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function updateStatus(newStatus: DocumentStatus) {
    setLoading(true)
    await supabase.from('documents').update({ status: newStatus }).eq('id', documentId)
    setLoading(false)
    router.refresh()
  }

  async function reprocess() {
    setProcessing(true)
    setProcessMsg('')
    try {
      const res = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setProcessMsg(`Error: ${data.error ?? 'Processing failed'}`)
      } else {
        setProcessMsg(`Done — ${data.chunksCreated} chunks indexed`)
        router.refresh()
      }
    } catch {
      setProcessMsg('Network error — please try again')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={reprocess}
          disabled={processing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
          {processing ? 'Processing…' : 'Re-process for AI'}
        </Button>
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
      {processMsg && (
        <p className={`text-xs ${processMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
          {processMsg}
        </p>
      )}
    </div>
  )
}
