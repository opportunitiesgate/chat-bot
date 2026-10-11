import { NextResponse } from 'next/server'
import { parseHistory } from '@/lib/chat-history'
import { siteClaimsFromRequest } from '@/lib/embed-token'
import { gatewayErrorMessage, isRagChatResponse, toAssistantMessage } from '@/lib/rag-response'

// A site-wide assistant (e.g. legal): POST /v1/<assistant>/chat on the gateway. Only viewers of a
// page of the OpportunitiesGate site (site token, signed-in or guest) can ask it.
const AI_TIMEOUT_MS = 180_000

export async function POST(request: Request, { params }: { params: Promise<{ assistant: string }> }) {
  const { assistant } = await params
  if (!siteClaimsFromRequest(request, assistant)) {
    return NextResponse.json({ error: 'This assistant session has expired. Please reload the page.' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const language = typeof body?.language === 'string' && /^[a-z]{2,3}$/.test(body.language) ? body.language : null
  const history = parseHistory(body?.history)
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const apiUrl = process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'
  const apiKey = process.env.CHAT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CHAT_API_KEY is not configured.' }, { status: 500 })

  let response: Response
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/${assistant}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...(language ? { 'Accept-Language': language } : {}),
      },
      body: JSON.stringify({ message, history }),
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
      { error: gatewayErrorMessage(response.status, data) },
      { status: response.status, headers: retryAfter ? { 'Retry-After': retryAfter } : undefined },
    )
  }
  if (!isRagChatResponse(data)) {
    return NextResponse.json({ error: 'The assistant returned an invalid response.' }, { status: 502 })
  }
  return NextResponse.json(toAssistantMessage(data))
}
