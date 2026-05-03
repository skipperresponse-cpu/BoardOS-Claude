'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, BookOpen, ChevronDown, ChevronUp,
  FileText, AlertTriangle, Lightbulb, Sparkles, Loader2,
  ShieldAlert, ScrollText, ClipboardList, Users,
} from 'lucide-react'
import { cn, CONFIDENCE_COLORS } from '@/lib/utils'
import type { AISource } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Confidence metadata ──────────────────────────────────────────────────────

const CONF_META = {
  high:   { label: 'High confidence',   bg: 'bg-emerald-100 text-emerald-700', note: 'Directly from your governance documents' },
  medium: { label: 'Medium confidence', bg: 'bg-amber-100 text-amber-700',     note: 'Combines your documents with governance best practice' },
  low:    { label: 'Advisory',          bg: 'bg-slate-100 text-slate-600',      note: 'General governance best practice — no specific document coverage' },
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTED = [
  { icon: ShieldAlert,   label: 'Governance risks',     q: 'What are our key governance risks?' },
  { icon: ScrollText,    label: 'Recent decisions',     q: 'Summarise our recent board decisions and any outstanding items.' },
  { icon: ClipboardList, label: 'Missing policies',     q: 'What policies are missing from our governance framework?' },
  { icon: Users,         label: 'Board composition',    q: 'What does our constitution say about board composition and appointments?' },
]

// ─── Text renderer ────────────────────────────────────────────────────────────

function TextBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5 text-sm leading-relaxed', className)}>
      {text.split('\n').map((line, i) => {
        const t = line.trim()
        if (!t) return null
        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-current opacity-40 flex-shrink-0" />
              <span>{t.slice(2)}</span>
            </div>
          )
        }
        return <p key={i}>{t}</p>
      })}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AskAIClient() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sourcesOpen, setSourcesOpen] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  const isLoading = messages.some(m => m.loading)
  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col gap-4">

      {/* ── Input panel (always at top) ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about governance, policies, board procedures, or best practices…"
              rows={3}
              disabled={isLoading}
              className="w-full resize-none bg-slate-50 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 transition-colors"
            />
            <div className="flex items-center justify-between mt-2.5 gap-3 flex-wrap">
              {/* Suggested prompt chips */}
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.map(s => (
                  <button
                    key={s.q}
                    type="button"
                    onClick={() => handleSend(s.q)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                  >
                    <s.icon className="h-3 w-3" />
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Send button + hint */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasMessages && (
                  <span className="text-[11px] text-slate-400 hidden sm:block">context maintained</span>
                )}
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</>
                    : <><Send className="h-4 w-4" /> Ask</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!hasMessages && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED.map(s => (
            <button
              key={s.q}
              onClick={() => handleSend(s.q)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors group"
            >
              <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <s.icon className="h-4 w-4 text-slate-500 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">{s.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.q}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Conversation thread ─────────────────────────────────────────── */}
      {hasMessages && (
        <div className="space-y-5">
          {messages.map(msg => (
            <div key={msg.id}>

              {/* User bubble */}
              {msg.type === 'user' && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] sm:max-w-[70%] bg-indigo-600 text-white rounded-2xl rounded-tr-md px-4 py-3">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              )}

              {/* Assistant response */}
              {msg.type === 'assistant' && (
                <div className="flex justify-start">
                  <div className="w-full max-w-full space-y-2.5">

                    {msg.loading && (
                      <div className="flex items-center gap-2 text-slate-400 py-2 px-1">
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
                          {/* Confidence pill */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', conf.bg)}>
                              {conf.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{conf.note}</span>
                          </div>

                          {/* Direct answer */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3.5 text-slate-800">
                            <TextBlock text={r.direct_answer} />
                          </div>

                          {/* Document evidence */}
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
                                {sourcesOpen[msg.id] ? 'Hide' : 'View'} document sources ({r.sources.length})
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
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  )
}
