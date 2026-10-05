import type { Viewport } from 'next'
import { EmbeddedAssistant, EmbedUnavailable } from '@/components/embedded-assistant'
import { parseEmbedOptions, themeStyle } from '@/lib/embed-options'
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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { opportunityId } = await params
  const query = await searchParams
  const token = query.token
  // Optional look and language from the host page: ?lang, ?name, ?logo and palette colors.
  const options = parseEmbedOptions(query)
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
      locale={options.locale}
      assistantName={options.assistantName}
      logoUrl={options.logoUrl}
      themeStyle={themeStyle(options.theme)}
    />
  )
}
