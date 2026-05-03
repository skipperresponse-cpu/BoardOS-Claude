import Anthropic from '@anthropic-ai/sdk'
import { AI_CONFIG } from './config'
import type { AISource, ActionItem } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface GovernanceAnswer {
  answer: string
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
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

export async function askGovernanceQuestion(
  question: string,
  chunks: Array<{ document_id: string; document_title: string; chunk_text: string; similarity?: number }>
): Promise<GovernanceAnswer> {
  if (chunks.length === 0) {
    return {
      answer: 'The uploaded documents do not contain enough information to answer this question.',
      confidence: 'insufficient',
      sources: [],
    }
  }

  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.chunk_text}`)
    .join('\n\n---\n\n')

  const message = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.maxTokens,
    messages: [
      {
        role: 'user',
        content: `You are a governance assistant for a charity board. Your role is to answer questions strictly based on the provided document excerpts. You must not use any general knowledge or make assumptions beyond what the documents state.

RETRIEVED DOCUMENT EXCERPTS:
${context}

QUESTION: ${question}

INSTRUCTIONS:
- Answer ONLY using information found in the excerpts above.
- If the excerpts do not contain sufficient information to answer the question, say exactly: "The uploaded documents do not contain enough information to answer this question."
- Do not speculate, infer, or use general knowledge.
- Do not advise board members on how to vote or what decisions to make.
- Be precise and cite which source document your answer comes from.
- At the end of your answer, indicate your confidence: HIGH (clear direct answer found), MEDIUM (partial or indirect answer found), or LOW (very limited relevant information).

Format your response as:
ANSWER: [your answer here]
CONFIDENCE: [HIGH/MEDIUM/LOW/INSUFFICIENT]`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  const confidenceMatch = responseText.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW|INSUFFICIENT)/i)
  const answerMatch = responseText.match(/ANSWER:\s*([\s\S]*?)(?=CONFIDENCE:|$)/i)

  const confidenceRaw = confidenceMatch?.[1]?.toUpperCase() ?? 'LOW'
  const confidence = (['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'].includes(confidenceRaw)
    ? confidenceRaw.toLowerCase()
    : 'low') as GovernanceAnswer['confidence']

  const answer =
    answerMatch?.[1]?.trim() ??
    'The uploaded documents do not contain enough information to answer this question.'

  const sources: AISource[] = chunks.map((c) => ({
    document_id: c.document_id,
    document_title: c.document_title,
    chunk_text: c.chunk_text.substring(0, 300) + (c.chunk_text.length > 300 ? '...' : ''),
    relevance_score: c.similarity,
  }))

  return { answer, confidence, sources }
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
