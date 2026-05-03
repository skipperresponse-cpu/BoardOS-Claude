import Anthropic from '@anthropic-ai/sdk'
import { AI_CONFIG } from './config'
import type { AISource, ActionItem } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface GovernanceAnswer {
  answer: string                      // stored in DB (= direct_answer)
  direct_answer: string
  document_evidence: string | null
  gaps: string | null
  practical_guidance: string | null
  confidence: 'high' | 'medium' | 'low'
  sources: AISource[]
}

export interface GeneratedMinutes {
  minutes: string
  actionItems: ExtractedActionItem[]
}

export interface ExtractedActionItem {
  title: string
  description: string
  owner: string | null
  due_date: string | null
  status: 'Not Started'
}

export interface ProposalSummary {
  background: string
  decision_required: string
  key_considerations: string[]
  risks: string[]
  financial_implications: string
}

export interface Resolution {
  resolution_text: string
  date: string
  outcome: string
}

const GOVERNANCE_SYSTEM_PROMPT = `You are a Governance Assistant for a nonprofit charity board. You help board members navigate governance matters with clarity and practical wisdom.

You have access to the organisation's internal governance documents. Your approach:
1. Prioritise information from the provided document excerpts
2. When documents are silent, draw on general nonprofit governance best practices
3. Clearly distinguish: (a) what your documents say, (b) general best practice, (c) your suggestions
4. Use a natural, advisory, collegial tone — like a knowledgeable governance advisor, not a legal document
5. Always surface governance gaps and suggest practical next steps
6. Never advise on how board members should vote on specific matters

Respond with ONLY a valid JSON object — no preamble, no markdown fences, no extra text:
{
  "direct_answer": "A clear, conversational 2-4 sentence answer. If documents are silent, give a best-practice answer and say so.",
  "document_evidence": "What your specific governance documents say about this topic. Use inline citations like [Board Charter §3] or [Financial SOP §2.1]. Use bullet points (- item) for multiple points. Null if no relevant document coverage.",
  "gaps": "Any governance gaps or missing policies this question reveals — things the board may want to address. Null if no gaps identified.",
  "practical_guidance": "Practical next steps or recommendations. What the board should consider doing. Use bullet points for multiple suggestions.",
  "confidence": "high if internal documents directly answer this | medium if documents partially address it or you supplement with best practice | low if answer is entirely from general governance knowledge"
}`

export async function askGovernanceQuestion(
  question: string,
  chunks: Array<{ document_id: string; document_title: string; chunk_text: string; similarity?: number }>,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<GovernanceAnswer> {
  const sources: AISource[] = chunks.map((c) => ({
    document_id: c.document_id,
    document_title: c.document_title,
    chunk_text: c.chunk_text.substring(0, 300) + (c.chunk_text.length > 300 ? '...' : ''),
    relevance_score: c.similarity,
  }))

  const context = chunks.length > 0
    ? chunks.map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.chunk_text}`).join('\n\n---\n\n')
    : 'No governance documents have been uploaded yet.'

  const userContent = `QUESTION: ${question}

RETRIEVED DOCUMENT EXCERPTS:
${context}`

  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.maxTokens,
    system: GOVERNANCE_SYSTEM_PROMPT,
    messages: [
      ...history,
      { role: 'user', content: userContent },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}'

  let parsed: {
    direct_answer?: string
    document_evidence?: string | null
    gaps?: string | null
    practical_guidance?: string | null
    confidence?: string
  } = {}

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText)
  } catch {
    // Fallback: treat whole response as direct answer
    parsed = { direct_answer: responseText, confidence: 'low' }
  }

  const direct_answer = parsed.direct_answer?.trim() || question
  const document_evidence = parsed.document_evidence || null
  const gaps = parsed.gaps || null
  const practical_guidance = parsed.practical_guidance || null

  const rawConf = (parsed.confidence ?? 'low').toLowerCase()
  const confidence = (['high', 'medium', 'low'].includes(rawConf) ? rawConf : 'low') as GovernanceAnswer['confidence']

  return {
    answer: direct_answer,
    direct_answer,
    document_evidence,
    gaps,
    practical_guidance,
    confidence,
    sources,
  }
}

export async function generateMinutes(
  transcript: string,
  agenda: string,
  meetingDetails: {
    title: string
    date: string
    attendees: string[]
    absentees: string[]
  }
): Promise<GeneratedMinutes> {
  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.maxTokens,
    messages: [
      {
        role: 'user',
        content: `You are a governance secretary for a charity board. Generate structured formal board meeting minutes from the following transcript and agenda.

MEETING DETAILS:
Title: ${meetingDetails.title}
Date: ${meetingDetails.date}
Attendees: ${meetingDetails.attendees.join(', ')}
Absentees: ${meetingDetails.absentees.join(', ')}

AGENDA:
${agenda || 'Not provided'}

TRANSCRIPT / NOTES:
${transcript}

Generate minutes using EXACTLY this structure (use markdown headers):

## Meeting Details
[Meeting title, date, time, location/format]

## Attendees
[List of attendees with roles if known]

## Apologies / Absentees
[List of those who sent apologies or were absent]

## Confirmation of Previous Minutes
[Whether previous minutes were confirmed, any matters arising]

## Matters Arising
[Any outstanding items from previous meeting]

## Agenda Items
[For each agenda item: discussion summary and outcome]

## Discussion Summary
[Key points discussed not captured above]

## Decisions Made
[Numbered list of formal decisions/resolutions made]

## Action Items
[Format each as: ACTION | Owner: [name] | Due: [date or TBD] | Description: [what needs to be done]]

## Risks / Issues Noted
[Any risks or issues flagged]

## Next Meeting Date
[If mentioned, the date of the next meeting]

---

After the minutes, output a JSON block containing extracted action items:
\`\`\`json
{
  "action_items": [
    {
      "title": "short title",
      "description": "full description",
      "owner": "person name or null",
      "due_date": "YYYY-MM-DD or null",
      "status": "Not Started"
    }
  ]
}
\`\`\``,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/)
  let actionItems: ExtractedActionItem[] = []

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      actionItems = parsed.action_items ?? []
    } catch {
      actionItems = []
    }
  }

  const minutes = responseText.replace(/```json[\s\S]*?```/, '').trim()

  return { minutes, actionItems }
}

export async function extractActionItems(minutesText: string): Promise<ExtractedActionItem[]> {
  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Extract all action items from the following board meeting minutes. Return a JSON array only.

MINUTES:
${minutesText}

Return ONLY valid JSON in this format:
{
  "action_items": [
    {
      "title": "short descriptive title",
      "description": "full description of what needs to be done",
      "owner": "person's name or null if not specified",
      "due_date": "YYYY-MM-DD format or null if not specified",
      "status": "Not Started"
    }
  ]
}`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}'

  try {
    const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim())
    return parsed.action_items ?? []
  } catch {
    return []
  }
}

export async function summariseProposal(
  proposalText: string,
  linkedDocsSummary: string
): Promise<ProposalSummary> {
  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are assisting a charity board. Summarise the following proposal objectively. Do NOT recommend how to vote. Present facts and considerations only.

PROPOSAL:
${proposalText}

${linkedDocsSummary ? `LINKED DOCUMENTS CONTEXT:\n${linkedDocsSummary}` : ''}

Return a JSON object with exactly these fields:
{
  "background": "context and background for this proposal",
  "decision_required": "what the board is being asked to decide",
  "key_considerations": ["consideration 1", "consideration 2"],
  "risks": ["risk 1", "risk 2"],
  "financial_implications": "any financial implications mentioned, or 'Not specified'"
}`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}'

  try {
    return JSON.parse(responseText.replace(/```json|```/g, '').trim())
  } catch {
    return {
      background: proposalText.substring(0, 500),
      decision_required: 'See full proposal text',
      key_considerations: [],
      risks: [],
      financial_implications: 'Not specified',
    }
  }
}

export async function generateResolution(
  proposalTitle: string,
  proposalText: string,
  voteOutcome: {
    approve: number
    disapprove: number
    abstain: number
    request_clarification: number
    total_eligible: number
    result: 'approved' | 'rejected'
  }
): Promise<Resolution> {
  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Generate a formal resolution record for a charity board decision.

PROPOSAL TITLE: ${proposalTitle}
PROPOSAL SUMMARY: ${proposalText.substring(0, 500)}

VOTE OUTCOME:
- In favour: ${voteOutcome.approve}
- Against: ${voteOutcome.disapprove}
- Abstain: ${voteOutcome.abstain}
- Request clarification: ${voteOutcome.request_clarification}
- Total eligible voters: ${voteOutcome.total_eligible}
- Result: ${voteOutcome.result.toUpperCase()}

Generate a formal resolution in standard charity board format. Return JSON:
{
  "resolution_text": "RESOLVED THAT... [formal wording]",
  "date": "${new Date().toISOString().split('T')[0]}",
  "outcome": "${voteOutcome.result}"
}`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}'

  try {
    return JSON.parse(responseText.replace(/```json|```/g, '').trim())
  } catch {
    return {
      resolution_text: `RESOLVED THAT the board ${voteOutcome.result === 'approved' ? 'approves' : 'rejects'} the proposal: ${proposalTitle}. Vote: ${voteOutcome.approve} in favour, ${voteOutcome.disapprove} against, ${voteOutcome.abstain} abstaining.`,
      date: new Date().toISOString().split('T')[0],
      outcome: voteOutcome.result,
    }
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return magA && magB ? dot / (magA * magB) : 0
}
