'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, BookOpen, ChevronDown, ChevronUp, MessageSquare,
  FileText, AlertTriangle, Lightbulb, Sparkles, Loader2,
} from 'lucide-react'
import { cn, CONFIDENCE_COLORS } from '@/lib/utils'
import type { AIQuery, AISource } from '@/types'

// ─── Types ─────────────────────────────────────────────────���──────────────────

interface StructuredAnswer {
  direct_answer: string
  document_evidence: string | null
  gaps: string | null
  practical_guidance: string | null
  confidence: 'high' | 'medium' | 'low'
  sources: AISource[]
}

interface Message {
  id: string
  type: 'user' | 'assistant'
  content?: string
  result?: StructuredAnswer
  loading?: boolean
  error?: string
}

interface Props {
  recentQueries: AIQuery[]
}

// ─── Confidence metadata ─────────────────────────────────���───────────────────��

const CONF_META = {
  high:   { label: 'High confidence',  bg: 'bg-emerald-100 text-emerald-700', note: 'Directly from your governance documents' },
  medium: { label: 'Medium confidence', bg: 'bg-amber-100 text-amber-700',   note: 'Combines your documents with governance best practice' },
  low:    { label: 'Advisory',          bg: 'bg-slate-100 text-slate-600',    note: 'General governance best practice — no specific document coverage' },
}

// ─── Simple text renderer ─────────────────────────────────────────────────────

function TextBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5 text-sm leading-relaxed', className)}>
      {text.split('\n').map((line, i) => {
        const t = line.trim()
        if (!t) return null
        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-current opacity-50 flex-shrink-0" />
              <span>{t.slice(2)}</span>
            </div>
          )
        }
        return <p key={i}>{t}</p>
      })}
    </div>
  )
}

// ─── Component ─────────────────────────────��─────────────────────────────��────

export function AskAIClient({ recentQueries }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sourcesOpen, setSourcesOpen] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function buildHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const m of messages) {
      if (m.loading || m.error) continue
      if (m.type === 'user' && m.content) {
        result.push({ role: 'user', content: m.content })
      } else if (m.type === 'assistant' && m.result) {
        const r = m.result
        const parts = [r.direct_answer]
        if (r.document_evidence) parts.push(`What documents say: ${r.document_evidence}`)
        if (r.gaps) parts.push(`Gaps noted: ${r.gaps}`)
        if (r.practical_guidance) parts.push(`Guidance: ${r.practical_guidance}`)
        result.push({ role: 'assistant', content: parts.join('\n\n') })
      }
    }
    return result
  }

  async function handleSend(questionText?: string) {
    const q = (questionText ?? input).trim()
    if (!q) return

    const history = buildHistory()
    const userMsgId = `u-${Date.now()}`
    const asstMsgId = `a-${Date.now()}`

    setInput('')
    setMessages(prev => [
      ...prev,
      { id: userMsgId, type: 'user', content: q },
      { id: asstMsgId, type: 'assistant', loading: true },
    ])

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')

      setMessages(prev => prev.map(m =>
        m.id === asstMsgId ? { ...m, loading: false, result: data as StructuredAnswer } : m
      ))
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === asstMsgId
          ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Something went wrong' }
          : m
      ))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const EXAMPLES = [
    'What does our constitution say about quorum?',
    'What are the procurement thresholds for large contracts?',
    'How do we appoint new board members?',
    'What are our obligations around conflicts of interest?',
  ]

  const isLoading = messages.some(m => m.loading)

  return (
    <div className="flex gap-5" style={{ height: 'calc(100vh - 11rem)' }}>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* Message thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-5 pb-8">
              <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Governance Assistant</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">
                  Ask about your governance documents, board procedures, or best practices. I'll draw on your uploaded documents and general nonprofit governance knowledge.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {EXAMPLES.map(q => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map(msg => (
            <div key={msg.id}>

              {/* User bubble */}
              {msg.type === 'user' && (
                <div className="flex justify-end">
                  <div className="max-w-[72%] bg-indigo-600 text-white rounded-2xl rounded-tr-md px-4 py-3">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              )}

              {/* Assistant response */}
              {msg.type === 'assistant' && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] space-y-2.5">

                    {msg.loading && (
                      <div className="flex items-center gap-2 text-slate-400 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking…</span>
                      </div>
                    )}

                    {msg.error && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                        {msg.error}
                      </div>
                    )}

                    {msg.result && (() => {
                      const r = msg.result
                      const conf = CONF_META[r.confidence] ?? CONF_META.low
                      return (
                        <>
                          {/* Confidence */}
                          <div className="flex items-center gap-2">
                            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', conf.bg)}>
                              {conf.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{conf.note}</span>
                          </div>

                          {/* Direct answer */}
                          <div className="bg-slate-50 rounded-xl px-4 py-3.5 text-slate-800">
                            <TextBlock text={r.direct_answer} />
                          </div>

                          {/* What documents say */}
                          {r.document_evidence && (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
                              <div className="flex items-center gap-1.5 mb-2">
                                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                                <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">What your documents say</span>
                              </div>
                              <TextBlock text={r.document_evidence} className="text-indigo-900" />
                            </div>
                          )}

                          {/* Gaps */}
                          {r.gaps && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5">
                              <div className="flex items-center gap-1.5 mb-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Gaps / Areas to address</span>
                              </div>
                              <TextBlock text={r.gaps} className="text-amber-900" />
                            </div>
                          )}

                          {/* Practical guidance */}
                          {r.practical_guidance && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Lightbulb className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Practical guidance</span>
                              </div>
                              <TextBlock text={r.practical_guidance} className="text-emerald-900" />
                            </div>
                          )}

                          {/* Sources — collapsible */}
                          {r.sources.length > 0 && (
                            <div>
                              <button
                                onClick={() => setSourcesOpen(o => ({ ...o, [msg.id]: !o[msg.id] }))}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                                {sourcesOpen[msg.id] ? 'Hide' : 'Show'} document sources ({r.sources.length})
                                {sourcesOpen[msg.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                              {sourcesOpen[msg.id] && (
                                <div className="mt-2 space-y-2">
                                  {r.sources.slice(0, 5).map((s, i) => (
                                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                                      <p className="text-xs font-semibold text-slate-700 mb-1">{s.document_title}</p>
                                      <p className="text-xs text-slate-500 italic leading-relaxed">&ldquo;{s.chunk_text}&rdquo;</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about governance, policies, board procedures…"
                rows={2}
                disabled={isLoading}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 transition-colors pr-12"
              />
              <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-300 select-none">⌘↵</span>
            </div>
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0 mb-0.5"
            >
              {isLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />
              }
            </button>
          </div>
          {messages.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              Conversation context is maintained within this session
            </p>
          )}
        </div>
      </div>

      {/* ── Past questions sidebar ────────────────────────────────────────── */}
      {recentQueries.length > 0 && (
        <div className="w-60 flex-shrink-0 hidden lg:block">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Past questions
              </h3>
            </div>
            <ul className="divide-y divide-slate-100 overflow-y-auto flex-1">
              {recentQueries.slice(0, 15).map(q => (
                <li
                  key={q.id}
                  onClick={() => setInput(q.question)}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">{q.question}</p>
                  <span className={cn(
                    'mt-1.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    CONFIDENCE_COLORS[q.confidence as keyof typeof CONFIDENCE_COLORS] ?? 'bg-slate-100 text-slate-500'
                  )}>
                    {q.confidence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
