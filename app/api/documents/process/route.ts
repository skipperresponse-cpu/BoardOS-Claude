import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { chunkText, generateEmbedding } from '@/lib/ai/embeddings'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { documentId } = await request.json()
  if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })

  const serviceSupabase = await createServiceClient()

  const { data: doc, error: docError } = await serviceSupabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  try {
    const { data: fileData, error: downloadError } = await serviceSupabase
      .storage
      .from('governance-docs')
      .download(doc.file_path)

    if (downloadError || !fileData) {
      throw new Error('Could not download file: ' + downloadError?.message)
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const fileName = doc.file_path.toLowerCase()
    let extractedText = ''

    if (fileName.endsWith('.pdf')) {
      const { getDocumentProxy, extractText } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await extractText(pdf, { mergePages: true })
      extractedText = text
    } else if (fileName.endsWith('.docx')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      extractedText = result.value
    } else {
      extractedText = buffer.toString('utf-8')
    }

    await serviceSupabase
      .from('documents')
      .update({ extracted_text: extractedText })
      .eq('id', documentId)

    await serviceSupabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)

    const chunks = chunkText(extractedText)

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i])
      const { error: chunkError } = await serviceSupabase.from('document_chunks').insert({
        document_id: documentId,
        chunk_text: chunks[i],
        chunk_index: i,
        embedding: JSON.stringify(embedding),
      })
      if (chunkError) {
        console.error(`Chunk ${i} insert failed:`, chunkError.message)
        throw new Error(`Failed to store chunk ${i}: ${chunkError.message}`)
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profile) {
      await logAudit(profile.id, 'document_processed', 'document', documentId, {
        chunks_created: chunks.length,
      })
    }

    return NextResponse.json({ success: true, chunksCreated: chunks.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
