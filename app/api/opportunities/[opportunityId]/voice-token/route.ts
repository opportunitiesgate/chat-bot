import { NextResponse } from 'next/server'
import { embedClaimsFromRequest } from '@/lib/embed-token'

// Exchanges the server-only CHAT_API_KEY for a short-lived, single-use voice token, so the
// browser can open the voice WebSocket without ever seeing the API key.
const BOT_ID = 'opportunity-assistant'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const { opportunityId } = await params
  // Only viewers the OpportunitiesGate site vouched for; the voice session is tied to their user id.
  const claims = embedClaimsFromRequest(request, opportunityId)
  if (!claims) {
    return NextResponse.json({ error: 'This assistant session has expired. Please reload the page.' }, { status: 401 })
  }
  const userId = claims.userId

  const apiUrl = process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'
  const apiKey = process.env.CHAT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CHAT_API_KEY is not configured.' }, { status: 500 })

  let response: Response
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/opportunity/voice/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ opportunityId, userId, botId: BOT_ID }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'The voice assistant is unreachable right now.' }, { status: 502 })
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error =
      response.status === 429
        ? 'Too many requests in a short time. Please wait a moment and try again.'
        : 'The voice assistant is not available right now.'
    return NextResponse.json({ error }, { status: response.status })
  }

  const token = data && typeof data === 'object' ? (data as Record<string, unknown>).token : undefined
  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'The voice assistant returned an invalid response.' }, { status: 502 })
  }
  return NextResponse.json({ token, userId, botId: BOT_ID }, { headers: { 'Cache-Control': 'no-store' } })
}
