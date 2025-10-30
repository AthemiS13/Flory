/**
 * Next.js config: proxy /api/* to device IP to avoid CORS during local development.
 * Priority for device base URL:
 *  - process.env.NEXT_PUBLIC_DEVICE_BASE_URL (recommended)
 *  - process.env.DEVICE_BASE_URL
 *  - fallback 'http://flory.local' (use mDNS name instead of numeric IP)
 */
const deviceBase = (process.env.NEXT_PUBLIC_DEVICE_BASE_URL || process.env.DEVICE_BASE_URL || 'http://flory.local').replace(/\/$/, '')

/** @type {import('next').NextConfig} */
module.exports = {
  // Produce a static export in `out/` when building. This replaces the removed
  // `next export` CLI command in newer Next.js versions.
  output: 'export',
  async rewrites() {
    // only proxy /api to the device in development; in production leave rewrites alone
    if (process.env.NODE_ENV === 'production') return []
    return [
      {
        source: '/api/:path*',
        destination: `${deviceBase}/api/:path*`,
      },
    ]
  },
}
