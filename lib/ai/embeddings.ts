import { AI_CONFIG } from './config'

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.ANTHROPIC_API_KEY

  // Use Voyage AI if EMBEDDING_API_KEY is set, otherwise fall back to simple TF-IDF-style hashing
  if (process.env.EMBEDDING_API_KEY) {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [text.substring(0, 8000)],
        model: 'voyage-3',
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.data[0].embedding
    }
  }

  // Fallback: deterministic hash-based pseudo-embedding for development
  // Replace with a real embedding API in production
  return simpleHashEmbedding(text)
}

function simpleHashEmbedding(text: string): number[] {
  const dim = 512
  const embedding = new Array(dim).fill(0)
  const words = text.toLowerCase().split(/\s+/)

  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i)
      const idx = (code * 31 + i * 17) % dim
      embedding[idx] += 1 / (words.length || 1)
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
  return magnitude > 0 ? embedding.map((v) => v / magnitude) : embedding
}

export function chunkText(text: string): string[] {
  const { chunkSize, chunkOverlap } = AI_CONFIG
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - chunkOverlap
    if (start >= text.length) break
  }

  return chunks.filter((c) => c.trim().length > 50)
}
