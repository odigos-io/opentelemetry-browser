// Orchestrates one e2e case: serve a framework test-app behind the harness, drive one browser
// against it, and confirm the browser agent exported traces (the harness forwards them to the
// collector). Exit code 0 = the agent produced and exported spans; non-zero = failure.
//
// Usage: node e2e/run.mjs --framework <react|vue|angular|next|nuxt|sveltekit> --browser <chromium|firefox|webkit>
//
// Env:
//   OTEL_HTTP_ENDPOINT  collector OTLP/HTTP base URL   (default http://localhost:4318)
//   AGENT_JS            path to built agent bundle     (default <repo>/dist/agent.js)
//   HARNESS_PORT        port the harness listens on     (default 8080)
//   SERVICE_NAME        service.name reported           (default browser-<framework>-<browser>)
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { access } from 'node:fs/promises'
import { startHarness } from './harness.mjs'
import { launchAndGenerate } from './drive.mjs'
import { APPS } from './apps.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--framework') args.framework = argv[++i]
    else if (a === '--browser') args.browser = argv[++i]
  }
  return args
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForHTTP(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(url)
      return true
    } catch {
      await sleep(500)
    }
  }
  return false
}

async function main() {
  const { framework, browser } = parseArgs(process.argv.slice(2))
  if (!framework || !browser) {
    console.error('usage: node e2e/run.mjs --framework <name> --browser <chromium|firefox|webkit>')
    process.exit(2)
  }
  const app = APPS[framework]
  if (!app) {
    console.error(`unknown framework "${framework}". known: ${Object.keys(APPS).join(', ')}`)
    process.exit(2)
  }

  const otelHttpEndpoint = process.env.OTEL_HTTP_ENDPOINT || 'http://localhost:4318'
  const agentJsPath = process.env.AGENT_JS || join(REPO_ROOT, 'dist', 'agent.js')
  const harnessPort = Number(process.env.HARNESS_PORT || 8080)
  const serviceName = process.env.SERVICE_NAME || `browser-${framework}-${browser}`

  await access(agentJsPath).catch(() => {
    console.error(`agent bundle not found at ${agentJsPath} — run "npm run build" first`)
    process.exit(2)
  })

  console.log(`e2e: framework=${framework} browser=${browser} service=${serviceName}`)
  console.log(`  collector=${otelHttpEndpoint} agent=${agentJsPath}`)

  let ssrChild = null
  let harness = null
  let driver = null
  let exitCode = 1

  const cleanup = async () => {
    try {
      if (driver) await driver.close()
    } catch {}
    try {
      if (harness) await harness.close()
    } catch {}
    if (ssrChild && !ssrChild.killed) {
      ssrChild.kill('SIGTERM')
    }
  }

  try {
    let harnessOpts = {
      port: harnessPort,
      serviceName,
      agentJsPath,
      otelHttpEndpoint,
    }

    if (app.type === 'static') {
      const staticDir = join(REPO_ROOT, app.staticDir)
      await access(staticDir).catch(() => {
        throw new Error(`static dir not found: ${staticDir} — build the app first`)
      })
      harnessOpts = { ...harnessOpts, mode: 'static', staticDir }
    } else {
      // Spawn the SSR server, then point the harness at it.
      const appDir = join(REPO_ROOT, app.dir)
      const [cmd, ...cmdArgs] = app.start
      console.log(`  starting SSR server: ${app.start.join(' ')} (cwd=${appDir})`)
      ssrChild = spawn(cmd, cmdArgs, {
        cwd: appDir,
        env: { ...process.env, ...(app.env || {}) },
        stdio: 'inherit',
      })
      ssrChild.on('exit', (code) => {
        if (code && code !== 0) console.error(`  SSR server exited early with code ${code}`)
      })
      const upstream = `http://127.0.0.1:${app.port}`
      const ready = await waitForHTTP(upstream, 60000)
      if (!ready) throw new Error(`SSR server did not become ready at ${upstream}`)
      console.log(`  SSR server ready at ${upstream}`)
      harnessOpts = { ...harnessOpts, mode: 'proxy', upstream }
    }

    harness = await startHarness(harnessOpts)
    console.log(`  harness listening at ${harness.url}`)

    driver = await launchAndGenerate({ browserName: browser, url: harness.url })

    // Wait for the BatchSpanProcessor to flush (default 5s) and the harness to forward.
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      const stats = harness.getStats()
      if (stats.traceRequests > 0 && stats.spansForwarded > 0) {
        console.log(`  ✅ agent exported traces: ${JSON.stringify(stats)}`)
        exitCode = 0
        break
      }
      await sleep(1000)
    }

    if (exitCode !== 0) {
      console.error(`  ❌ no traces exported by the agent within timeout: ${JSON.stringify(harness.getStats())}`)
    }
  } catch (err) {
    console.error(`  ❌ e2e error: ${err && err.stack ? err.stack : err}`)
    exitCode = 1
  } finally {
    await cleanup()
  }

  process.exit(exitCode)
}

main()
