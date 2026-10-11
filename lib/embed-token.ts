import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseAllowedOrigins } from '@/lib/embed-origins'

// Embed tokens are signed by the OpportunitiesGate site (opportunitiesgate-front,
// src/lib/opportunities/assistant.ts) for a viewer who has full access to one opportunity.
// Format: base64url(JSON { opp, sub, title, exp, name?, email?, slug? }) "." base64url(HMAC-SHA256),
// with the secret both apps share (EMBED_SIGNING_SECRET here, OPPORTUNITY_ASSISTANT_EMBED_SECRET
// there). name and email identify the sender of a message to the team; slug links back to the page.

export interface EmbedClaims {
  opportunityId: string
  userId: string
  title: string
  expiresAt: number
  name?: string
  email?: string
  slug?: string
}

export const EMBED_TOKEN_HEADER = 'X-Embed-Token'

/** The claims of a token signed with EMBED_SIGNING_SECRET, or null if it is forged or malformed. */
function signedClaims(token: string | null | undefined): Record<string, unknown> | null {
  const secret = process.env.EMBED_SIGNING_SECRET
  if (!secret || !token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expected = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function verifyEmbedToken(token: string | null | undefined, opportunityId: string, now = Date.now()): EmbedClaims | null {
  const claims = signedClaims(token)
  if (!claims) return null
  if (
    typeof claims.opp !== 'string' ||
    typeof claims.sub !== 'string' ||
    typeof claims.exp !== 'number' ||
    claims.opp !== opportunityId ||
    claims.exp * 1000 < now
  ) {
    return null
  }
  return {
    opportunityId: claims.opp,
    userId: claims.sub,
    title: typeof claims.title === 'string' ? claims.title : '',
    expiresAt: claims.exp,
    name: optionalText(claims.name),
    email: optionalText(claims.email),
    slug: optionalText(claims.slug),
  }
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// Site-wide assistants, framed on every public page (except opportunity pages). Their token,
// signed by the OpportunitiesGate site with the same secret, is { ast, sub, exp }: it names the
// assistant and has no "opp", so an opportunity token never opens a site assistant and vice versa.
export const SITE_ASSISTANTS = ['legal'] as const
export type SiteAssistant = (typeof SITE_ASSISTANTS)[number]

export interface SiteClaims {
  assistant: SiteAssistant
  /** The signed-in user's id, or "guest". */
  userId: string
  expiresAt: number
}

export function isSiteAssistant(value: string): value is SiteAssistant {
  return (SITE_ASSISTANTS as readonly string[]).includes(value)
}

export function verifySiteToken(token: string | null | undefined, assistant: string, now = Date.now()): SiteClaims | null {
  const claims = signedClaims(token)
  if (
    !claims ||
    !isSiteAssistant(assistant) ||
    claims.ast !== assistant ||
    'opp' in claims ||
    typeof claims.sub !== 'string' ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < now
  ) {
    return null
  }
  return { assistant, userId: claims.sub, expiresAt: claims.exp }
}

export function siteClaimsFromRequest(request: Request, assistant: string): SiteClaims | null {
  return verifySiteToken(request.headers.get(EMBED_TOKEN_HEADER), assistant)
}

/** The embed token sent by the widget with each request to the API routes. */
export function embedClaimsFromRequest(request: Request, opportunityId: string): EmbedClaims | null {
  return verifyEmbedToken(request.headers.get(EMBED_TOKEN_HEADER), opportunityId)
}

/** Origin patterns allowed to frame /embed and to receive its postMessage events. */
export function embedAllowedOrigins(): string[] {
  return parseAllowedOrigins(process.env.EMBED_ALLOWED_ORIGINS)
}
