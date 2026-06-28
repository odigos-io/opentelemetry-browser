// Proxy same-origin /api/* to the standalone backend-1 service. Next.js rewrites act as a
// transparent reverse proxy and forward the incoming request headers (including the browser's
// traceparent), so the trace continues into backend-1 (which then calls backend-2).
const BACKEND1_URL = process.env.BACKEND1_URL || 'http://backend-1.test-apps.svc.cluster.local:3001'

/** @type {import('next').NextConfig} */
export default {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND1_URL}/:path*` }]
  },
}
