import { AI_CONFIG } from './config'

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.EMBEDDING_API_KEY
  const isProd = process.env.NODE_ENV === 'production'

  if (apiKey) {
    try {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: [text.substring(0, 8000)],
          model: 'voyage-3.5-lite',
          // voyage-3.5 / voyage-3.5-lite support configurable output dimensions.
          // Request 512 to match the DB schema (vector(512)).
          output_dimension: 512,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return data.data[0].embedding
      }

      const detail = await response.text().catch(() => '')
      throw new Error(
        `Voyage embeddings API returned ${response.status} ${response.statusText}: ${detail}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[embeddings] Voyage embedding failed: ${message}`)
      if (isProd) {
        // Never silently poison the vector store in production — fail loudly.
        throw err instanceof Error ? err : new Error(message)
      }
      console.warn(
        '[embeddings] DEV ONLY: falling back to hash pseudo-embedding. RAG results will be meaningless.'
      )
      return simpleHashEmbedding(text)
    }
  }

  // No EMBEDDING_API_KEY configured.
  const noKeyMsg = 'EMBEDDING_API_KEY is not set — real embeddings unavailable.'
  console.error(`[embeddings] ${noKeyMsg}`)
  if (isProd) {
    // The silent hash fallback is exactly what poisoned the DB last time.
    throw new Error(`[embeddings] ${noKeyMsg}`)
  }
  console.warn(
    '[embeddings] DEV ONLY: falling back to hash pseudo-embedding. RAG results will be meaningless.'
  )
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
