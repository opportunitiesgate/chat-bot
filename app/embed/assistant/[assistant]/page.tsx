import type { Viewport } from 'next'
import { EmbeddedAssistant, EmbedUnavailable } from '@/components/embedded-assistant'
import { parseEmbedOptions, themeStyle } from '@/lib/embed-options'
import { embedAllowedOrigins, verifySiteToken } from '@/lib/embed-token'

// A site-wide assistant (e.g. /embed/assistant/site), framed on the OpportunitiesGate site's public
// pages. Same look options and host messages as the opportunity embed; a site token instead of an
// opportunity token.
export const viewport: Viewport = { colorScheme: 'light' }
export const dynamic = 'force-dynamic'

export default async function SiteAssistantEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ assistant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { assistant } = await params
  const query = await searchParams
  const embedToken = typeof query.token === 'string' ? query.token : null
  const options = parseEmbedOptions(query)
  const claims = verifySiteToken(embedToken, assistant)
  const allowedOrigins = embedAllowedOrigins()

  if (!claims || !embedToken) return <EmbedUnavailable allowedOrigins={allowedOrigins} />
  return (
    <EmbeddedAssistant
      opportunityId=""
      siteAssistant={claims.assistant}
      embedToken={embedToken}
      allowedOrigins={allowedOrigins}
      socketUrl=""
      locale={options.locale}
      assistantName={options.assistantName}
      logoUrl={options.logoUrl}
      themeStyle={themeStyle(options.theme)}
    />
  )
}
