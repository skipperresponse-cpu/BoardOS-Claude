export const AI_CONFIG = {
  // Generation (minutes, proposal summaries, resolutions, action extraction) — quality-sensitive.
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
  // Ask Q&A — high-volume; Haiku handles it well and cheaply.
  qaModel: process.env.CLAUDE_QA_MODEL ?? 'claude-haiku-4-5-20251001',
  maxTokens: 4096,
  temperature: 0,
  chunkSize: 1500,
  chunkOverlap: 200,
  maxChunksForRAG: 8,
} as const
