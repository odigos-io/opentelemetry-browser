<script setup>
// useState keeps the value consistent between server render and client hydration.
const renderedAt = useState('renderedAt', () => new Date().toISOString())
const log = ref([])

function append(line) {
  const ts = new Date().toLocaleTimeString()
  log.value = [`[${ts}] ${line}`, ...log.value].slice(0, 12)
}

async function backendChain() {
  append('backend chain GET /api/chain ...')
  try {
    const res = await fetch('/api/chain')
    const data = await res.json()
    append(`backend chain ok: ${data.service} -> ${data.downstream?.service}`)
  } catch (e) {
    append(`backend chain error: ${e.message}`)
  }
}
</script>

<template>
  <main class="app">
    <span class="badge">Nuxt · server-side rendered</span>
    <h1>Browser OpenTelemetry SSR Test Subject</h1>
    <p>
      This HTML was rendered on the server at <code>{{ renderedAt }}</code>, then served to the
      browser where the Odigos agent runs.
    </p>
    <p>
      The <strong>backend chain</strong> button issues a same-origin <code>/api/chain</code>
      request. Nuxt's Nitro server proxies it to <code>backend-1</code>, which calls
      <code>backend-2</code> — producing a single trace across three services.
    </p>

    <button @click="backendChain">backend chain</button>

    <h2>Activity log</h2>
    <ul>
      <li v-if="log.length === 0" class="muted">No activity yet.</li>
      <li v-for="(l, i) in log" :key="i">{{ l }}</li>
    </ul>
  </main>
</template>

<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 2rem;
  background: #0b1020;
  color: #e6e9f5;
  line-height: 1.5;
}
.app {
  max-width: 720px;
  margin: 0 auto;
}
.badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: #111827;
  border: 1px solid #2d3a66;
  font-size: 12px;
  letter-spacing: 0.4px;
}
button {
  padding: 0.6rem 1rem;
  border-radius: 8px;
  border: 1px solid #41b883;
  background: #2f8f63;
  color: white;
  font-size: 15px;
  cursor: pointer;
}
h2 {
  font-size: 16px;
  margin-top: 1.5rem;
}
ul {
  padding-left: 1.2rem;
}
.muted {
  opacity: 0.5;
}
</style>
