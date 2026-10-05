import { createHmac, timingSafeEqual } from 'node:crypto'

// Embed tokens are signed by the OpportunitiesGate site (opportunitiesgate-front,
// src/lib/opportunities/assistant.ts) for a viewer who has full access to one opportunity.
// Format: base64url(JSON { opp, sub, title, exp }) "." base64url(HMAC-SHA256), with the
// secret both apps share (EMBED_SIGNING_SECRET here, OPPORTUNITY_ASSISTANT_EMBED_SECRET there).

export interface EmbedClaims {
  opportunityId: string
  userId: string
  title: string
  expiresAt: number
}

export const EMBED_TOKEN_HEADER = 'X-Embed-Token'

export function verifyEmbedToken(token: string | null | undefined, opportunityId: string, now = Date.now()): EmbedClaims | null {
  const secret = process.env.EMBED_SIGNING_SECRET
  if (!secret || !token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expected = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
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
  }
}

/** The embed token sent by the widget with each request to the API routes. */
export function embedClaimsFromRequest(request: Request, opportunityId: string): EmbedClaims | null {
  return verifyEmbedToken(request.headers.get(EMBED_TOKEN_HEADER), opportunityId)
}

/** Origins allowed to frame /embed and to receive its postMessage events. */
export function embedAllowedOrigins(): string[] {
  return (process.env.EMBED_ALLOWED_ORIGINS ?? 'https://opportunitiesgate.net https://www.opportunitiesgate.net')
    .split(/[\s,]+/)
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}
