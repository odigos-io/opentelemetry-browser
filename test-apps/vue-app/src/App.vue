<script setup>
import { ref } from 'vue'

const API = 'https://jsonplaceholder.typicode.com'
const count = ref(0)
const log = ref([])

function append(line) {
  const ts = new Date().toLocaleTimeString()
  log.value = [`[${ts}] ${line}`, ...log.value].slice(0, 12)
}

async function fetchGet() {
  append('fetch GET /todos/1 ...')
  try {
    const res = await fetch(`${API}/todos/1`)
    const data = await res.json()
    append(`fetch GET ok: "${data.title}"`)
  } catch (e) {
    append(`fetch GET error: ${e.message}`)
  }
}

async function fetchPost() {
  append('fetch POST /posts ...')
  try {
    const res = await fetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'otel', body: 'browser', userId: 1 }),
    })
    const data = await res.json()
    append(`fetch POST ok: created id ${data.id}`)
  } catch (e) {
    append(`fetch POST error: ${e.message}`)
  }
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

function xhrGet() {
  append('XHR GET /users/1 ...')
  const xhr = new XMLHttpRequest()
  xhr.open('GET', `${API}/users/1`)
  xhr.onload = () => {
    try {
      const data = JSON.parse(xhr.responseText)
      append(`XHR GET ok: ${data.name}`)
    } catch {
      append('XHR GET ok (unparsed)')
    }
  }
  xhr.onerror = () => append('XHR GET error')
  xhr.send()
}

function bump() {
  count.value += 1
  append(`counter -> ${count.value}`)
}
</script>

<template>
  <main class="app">
    <header>
      <span class="badge vue">Vue</span>
      <h1>Browser OpenTelemetry Test Subject</h1>
      <p>Click buttons to generate document-load, fetch, XHR, user-interaction, and backend-chain (browser -&gt; backend-1 -&gt; backend-2) spans.</p>
    </header>

    <section class="actions">
      <button @click="fetchGet">fetch GET</button>
      <button @click="fetchPost">fetch POST</button>
      <button @click="xhrGet">XHR GET</button>
      <button @click="backendChain">backend chain</button>
      <button @click="bump">counter: {{ count }}</button>
    </section>

    <section class="log">
      <h2>Activity log</h2>
      <ul>
        <li v-if="log.length === 0" class="muted">No activity yet.</li>
        <li v-for="(l, i) in log" :key="i">{{ l }}</li>
      </ul>
    </section>
  </main>
</template>
