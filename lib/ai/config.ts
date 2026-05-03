export const AI_CONFIG = {
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
  maxTokens: 4096,
  temperature: 0,
  chunkSize: 1500,
  chunkOverlap: 200,
  maxChunksForRAG: 8,
} as const
