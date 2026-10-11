// Fires Resend events (https://resend.com/docs/api-reference/events/send-event). Each event starts a
// Resend automation that sends a published template; the templates and automations live in Resend
// ("Assistant – Message to staff", "Assistant – Confirmation to sender"). Server only: RESEND_API_KEY.

const RESEND_EVENTS_URL = 'https://api.resend.com/events/send'
const RESEND_TIMEOUT_MS = 10_000

export type ResendEventPayload = Record<string, string>

/** True when Resend accepted the event (202). Never throws. */
export async function sendResendEvent(event: string, email: string, payload: ResendEventPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  try {
    const response = await fetch(RESEND_EVENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, email, payload }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) console.error(`Resend event ${event} was refused with HTTP ${response.status}`)
    return response.ok
  } catch (error) {
    console.error(`Resend event ${event} could not be sent`, error)
    return false
  }
}
