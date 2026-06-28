<script>
  export let data

  let log = []

  function append(line) {
    const ts = new Date().toLocaleTimeString()
    log = [`[${ts}] ${line}`, ...log].slice(0, 12)
  }

  async function backendChain() {
    append('backend chain GET /api/chain ...')
    try {
      const res = await fetch('/api/chain')
      const d = await res.json()
      append(`backend chain ok: ${d.service} -> ${d.downstream?.service}`)
    } catch (e) {
      append(`backend chain error: ${e.message}`)
    }
  }
</script>

<main class="app">
  <span class="badge">SvelteKit · server-side rendered</span>
  <h1>Browser OpenTelemetry SSR Test Subject</h1>
  <p>
    This HTML was rendered on the server at <code>{data.renderedAt}</code>, then served to the
    browser where the Odigos agent runs.
  </p>
  <p>
    The <strong>backend chain</strong> button issues a same-origin <code>/api/chain</code> request.
    A SvelteKit server route forwards it (with the trace headers) to <code>backend-1</code>, which
    calls <code>backend-2</code> — producing a single trace across three services.
  </p>

  <button on:click={backendChain}>backend chain</button>

  <h2>Activity log</h2>
  <ul>
    {#if log.length === 0}
      <li class="muted">No activity yet.</li>
    {/if}
    {#each log as l}
      <li>{l}</li>
    {/each}
  </ul>
</main>

<style>
  :global(body) {
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
    border: 1px solid #ff5722;
    background: #e23b1f;
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
