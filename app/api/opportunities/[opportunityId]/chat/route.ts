import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const { opportunityId } = await params
  const body = await request.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const apiUrl = process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'
  const apiKey = process.env.CHAT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'CHAT_API_KEY is not configured.' }, { status: 500 })

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ opportunityId, message }),
  })

  const data = await response.json().catch(() => ({ error: 'The assistant returned an invalid response.' }))
  return NextResponse.json(data, { status: response.status })
}

