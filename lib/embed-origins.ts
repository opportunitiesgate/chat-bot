// Origins allowed to frame /embed and to receive its postMessage events, from
// EMBED_ALLOWED_ORIGINS: exact origins, or `https://*.example.com` for every subdomain
// (the same syntax as CSP frame-ancestors; the wildcard does not match example.com itself).
// Shared by the server (embed page) and the browser (EmbeddedAssistant), so no Node imports.

export const DEFAULT_EMBED_ALLOWED_ORIGINS = 'https://opportunitiesgate.net https://*.opportunitiesgate.net'

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? DEFAULT_EMBED_ALLOWED_ORIGINS)
    .split(/[\s,]+/)
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function isAllowedOrigin(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const wildcard = pattern.match(/^(https?):\/\/\*\.(.+)$/)
    if (!wildcard) return origin === pattern
    const [, scheme, domain] = wildcard
    let url: URL
    try {
      url = new URL(origin)
    } catch {
      return false
    }
    // Like CSP: a wildcard without a port only matches the default port.
    return url.protocol === `${scheme}:` && url.port === "" && url.hostname.endsWith(`.${domain}`) && url.origin === origin
  })
}
