'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CONFIDENCE_COLORS, formatDate, cn } from '@/lib/utils'
import type { AIQuery, AISource } from '@/types'
import { MessageSquare, Send, BookOpen, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  recentQueries: AIQuery[]
}

interface AnswerResult {
  answer: string
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
  sources: AISource[]
}

export function AskAIClient({ recentQueries: initialQueries }: Props) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [error, setError] = useState('')
  const [queries, setQueries] = useState(initialQueries)
  const [expandedSources, setExpandedSources] = useState(false)

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setError('')
    setResult(null)
    setLoading(true)
    setExpandedSources(false)

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Request failed')
      }

      const data: AnswerResult = await res.json()
      setResult(data)
      setQueries((prev) => [
        {
          id: Date.now().toString(),
          user_id: '',
          question: question.trim(),
          answer: data.answer,
          confidence: data.confidence,
          sources_used: data.sources,
          created_at: new Date().toISOString(),
        },
        ...prev.slice(0, 9),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const EXAMPLE_QUESTIONS = [
    'Who can vote at board meetings?',
    'What does the constitution say about quorum?',
    'What is the process for appointing new board members?',
    'What are our safeguarding obligations?',
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {/* Question Form */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleAsk} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Your question
                </label>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What does our constitution say about board appointments?"
                  rows={3}
                  disabled={loading}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuestion(q)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                    >
                      {q.substring(0, 35)}{q.length > 35 ? '...' : ''}
                    </button>
                  ))}
                </div>
                <Button type="submit" disabled={loading || !question.trim()}>
                  <Send className="h-4 w-4" />
                  {loading ? 'Searching...' : 'Ask'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Answer */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-slate-500">
                <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                <span className="text-sm">Searching documents and generating answer...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Confidence badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Confidence:</span>
                <Badge className={cn(CONFIDENCE_COLORS[result.confidence])}>
                  {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)}
                </Badge>
              </div>

              {/* Answer text */}
              <div className="prose text-sm text-slate-800">
                <p className="whitespace-pre-wrap">{result.answer}</p>
              </div>

              {/* Sources */}
              {result.sources.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setExpandedSources(!expandedSources)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    <BookOpen className="h-4 w-4" />
                    Sources used ({result.sources.length})
                    {expandedSources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {expandedSources && (
                    <div className="mt-3 space-y-3">
                      {result.sources.map((source, i) => (
                        <div key={i} className="rounded-md bg-slate-50 border border-slate-200 p-4">
                          <p className="text-xs font-semibold text-slate-700 mb-1">{source.document_title}</p>
                          <p className="text-xs text-slate-500 italic leading-relaxed">
                            &ldquo;{source.chunk_text}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Questions Sidebar */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              Recent Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queries.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-400">No recent questions.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {queries.map((q) => (
                  <li
                    key={q.id}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-50"
                    onClick={() => setQuestion(q.question)}
                  >
                    <p className="text-sm text-slate-800 line-clamp-2">{q.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn('text-xs', CONFIDENCE_COLORS[q.confidence])}>
                        {q.confidence}
                      </Badge>
                      <span className="text-xs text-slate-400">{formatDate(q.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
