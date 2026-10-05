import type { Viewport } from 'next'
import { EmbeddedAssistant, EmbedUnavailable } from '@/components/embedded-assistant'
import { embedAllowedOrigins, verifyEmbedToken } from '@/lib/embed-token'

// Rendered inside an iframe on the OpportunitiesGate opportunity page. A fixed light scheme
// keeps the iframe transparent over the host page (a scheme mismatch paints a backdrop).
export const viewport: Viewport = { colorScheme: 'light' }
export const dynamic = 'force-dynamic'

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { opportunityId } = await params
  const { token } = await searchParams
  const embedToken = typeof token === 'string' ? token : null
  const claims = verifyEmbedToken(embedToken, opportunityId)
  const allowedOrigins = embedAllowedOrigins()

  if (!claims || !embedToken) return <EmbedUnavailable allowedOrigins={allowedOrigins} />
  return (
    <EmbeddedAssistant
      opportunityId={opportunityId}
      opportunityName={claims.title || undefined}
      embedToken={embedToken}
      allowedOrigins={allowedOrigins}
      socketUrl={process.env.NEXT_PUBLIC_AI_VOICE_SOCKET_URL ?? 'wss://ai-chat.opportunitiesgate.net/ws/voice'}
    />
  )
}
