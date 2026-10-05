// Origins allowed to frame /embed (the OpportunitiesGate site). Keep in sync with
// embedAllowedOrigins() in lib/embed-token.ts, which reads the same variable.
const embedAllowedOrigins = (process.env.EMBED_ALLOWED_ORIGINS ?? 'https://opportunitiesgate.net https://www.opportunitiesgate.net')
  .split(/[\s,]+/)
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)
  .join(' ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Everything except /embed refuses to be framed.
        source: '/((?!embed/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${embedAllowedOrigins}` },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default nextConfig
