// Same-origin proxy to backend-1. This SvelteKit server runs with the browser language override,
// so it is NOT server-side instrumented by Odigos and would not auto-propagate context. We
// therefore explicitly forward the W3C trace-context headers that the browser SDK attached to the
// same-origin /api/chain request, so backend-1 continues the trace (and then calls backend-2).
const BACKEND1_URL = process.env.BACKEND1_URL || 'http://backend-1.test-apps.svc.cluster.local:3001'

async function proxy({ params, request, url }) {
  const target = `${BACKEND1_URL}/${params.path}${url.search}`

  const headers = {}
  for (const h of ['traceparent', 'tracestate', 'baggage', 'content-type']) {
    const v = request.headers.get(h)
    if (v) headers[h] = v
  }

  const init = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  const resp = await fetch(target, init)
  const body = await resp.arrayBuffer()
  return new Response(body, {
    status: resp.status,
    headers: { 'content-type': resp.headers.get('content-type') || 'application/octet-stream' },
  })
}

export const GET = proxy
export const POST = proxy
