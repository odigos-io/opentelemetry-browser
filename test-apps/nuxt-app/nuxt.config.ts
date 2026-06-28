// Nuxt's Nitro server proxies same-origin /api/** to backend-1, forwarding incoming request
// headers (including the browser's traceparent) so the trace continues into backend-1, which then
// calls backend-2.
const BACKEND1_URL = process.env.BACKEND1_URL || 'http://backend-1.test-apps.svc.cluster.local:3001'

export default defineNuxtConfig({
  ssr: true,
  routeRules: {
    '/api/**': { proxy: `${BACKEND1_URL}/**` },
  },
  app: {
    head: {
      title: 'Browser OTel - Nuxt (SSR)',
    },
  },
  compatibilityDate: '2024-09-01',
})
