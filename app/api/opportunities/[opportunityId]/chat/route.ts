import { NextResponse } from 'next/server'
import { parseHistory } from '@/lib/chat-history'
import type { ChatMessage } from '@/lib/opportunity-ai-client'
import { embedClaimsFromRequest } from '@/lib/embed-token'
import { type RagSource, toSourceReferences } from '@/lib/rag-sources'

// Response of the rag-getway backend: POST /chat
interface RagChatResponse {
  answer: string
  sources?: RagSource[]
}

// Answer generation on the AI server can take tens of seconds on CPU.
const AI_TIMEOUT_MS = 180_000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const { opportunityId } = await params
  // Only viewers the OpportunitiesGate site vouched for (full access to this opportunity).
  if (!embedClaimsFromRequest(request, opportunityId)) {
    return NextResponse.json({ error: 'This assistant session has expired. Please reload the page.' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  // The interface language (e.g. "fr"), forwarded as Accept-Language: the RAG server answers in the
  // question's language and falls back to this one when that is unclear.
  const language = typeof body?.language === 'string' && /^[a-z]{2,3}$/.test(body.language) ? body.language : null
  // The recent conversation, so the RAG server (which keeps no history) understands follow-ups.
  const history = parseHistory(body?.history)

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const apiUrl = process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'
  const apiKey = process.env.CHAT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CHAT_API_KEY is not configured.' }, { status: 500 })

  let response: Response
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...(language ? { 'Accept-Language': language } : {}),
      },
      body: JSON.stringify({ opportunityId, message, history }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'The assistant is unreachable right now.' }, { status: 502 })
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After')
    return NextResponse.json(
      { error: errorMessage(response.status, data) },
      { status: response.status, headers: retryAfter ? { 'Retry-After': retryAfter } : undefined },
    )
  }

  if (!isRagChatResponse(data)) {
    return NextResponse.json({ error: 'The assistant returned an invalid response.' }, { status: 502 })
  }

  const answer: ChatMessage = {
    id: `assistant-${crypto.randomUUID()}`,
    role: 'assistant',
    content: data.answer,
    createdAt: new Date().toISOString(),
    source: 'text',
    sources: toSourceReferences(data.sources),
  }
  return NextResponse.json(answer)
}

function isRagChatResponse(value: unknown): value is RagChatResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.answer === 'string' && (candidate.sources === undefined || Array.isArray(candidate.sources))
}

// The backend returns { detail: string } for its own errors and { detail: [...] } for validation errors.
function errorMessage(status: number, data: unknown): string {
  if (status === 429) return 'Too many questions in a short time. Please wait a moment and try again.'
  if (status === 401 || status === 403) return 'The assistant is not configured correctly.'
  if (status === 422) return 'The question could not be processed.'
  const detail = data && typeof data === 'object' ? (data as Record<string, unknown>).detail : undefined
  return typeof detail === 'string' ? detail : 'The assistant could not answer right now.'
}
