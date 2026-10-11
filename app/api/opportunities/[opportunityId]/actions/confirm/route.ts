import { NextResponse } from 'next/server'
import { embedClaimsFromRequest } from '@/lib/embed-token'
import { resolveLocale } from '@/lib/i18n'
import { opportunityPageUrl, SITE_URL } from '@/lib/opportunity-ai-client'
import { sendResendEvent } from '@/lib/resend-events'

// The viewer clicked Send on a message to the OpportunitiesGate team that the RAG server drafted.
// 1. The viewer comes from the embed token signed by the OpportunitiesGate site (name and email
//    included), never from the browser's body.
// 2. The RAG server checks the action token (single use, this opportunity and user) and the
//    per-user limit: POST /v1/opportunity/actions/confirm.
// 3. Only then two Resend events go out: one to the team's fixed address (ASSISTANT_TEAM_EMAIL),
//    one confirming to the viewer. The model never chooses a recipient.

const MAX_SUBJECT_CHARS = 150
const MAX_MESSAGE_CHARS = 3000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const { opportunityId } = await params
  const claims = embedClaimsFromRequest(request, opportunityId)
  if (!claims) {
    return NextResponse.json({ error: 'This assistant session has expired. Please reload the page.' }, { status: 401 })
  }
  if (!claims.email) {
    return NextResponse.json({ error: 'Your account has no email address to reply to.', code: 'NO_EMAIL' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const language = resolveLocale(typeof body?.language === 'string' ? body.language : null)
  if (!token || !subject || !message || subject.length > MAX_SUBJECT_CHARS || message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: 'The message is empty or too long.' }, { status: 422 })
  }

  // Checked before confirming, so a misconfiguration never uses up the user's action token.
  const apiUrl = process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'
  const apiKey = process.env.CHAT_API_KEY
  const teamEmail = process.env.ASSISTANT_TEAM_EMAIL
  if (!apiKey || !teamEmail || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Sending messages is not configured.' }, { status: 500 })
  }

  let confirmation: Response
  try {
    confirmation = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/opportunity/actions/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ token, opportunityId, userId: claims.userId }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'The assistant is unreachable right now.' }, { status: 502 })
  }
  if (confirmation.status === 403) {
    return NextResponse.json({ error: 'This draft has expired. Ask the assistant again.', code: 'EXPIRED' }, { status: 403 })
  }
  if (confirmation.status === 429) {
    const retryAfter = confirmation.headers.get('Retry-After')
    return NextResponse.json(
      { error: 'You have sent several messages recently. Please try again later.', code: 'LIMIT' },
      { status: 429, headers: retryAfter ? { 'Retry-After': retryAfter } : undefined },
    )
  }
  if (!confirmation.ok) {
    return NextResponse.json({ error: 'The message could not be sent right now.' }, { status: 502 })
  }

  const payload = {
    name: claims.name || claims.email,
    email: claims.email,
    subject,
    message,
    language,
    opportunityTitle: claims.title || opportunityId,
    opportunityUrl: claims.slug ? opportunityPageUrl(language, claims.slug) : SITE_URL,
    receivedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  }
  if (!(await sendResendEvent('admin-assistant-message', teamEmail, payload))) {
    return NextResponse.json({ error: 'The message could not be sent right now.' }, { status: 502 })
  }
  // The team has the message; a missing confirmation email is not worth failing the request for.
  await sendResendEvent('client-assistant-message', claims.email, payload)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
