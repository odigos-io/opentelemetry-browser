// Drives a single browser against the harness URL: loads the page (→ document-load span + browser
// events), waits for the agent to initialize, then generates same-origin activity (fetch + click)
// so fetch spans and user-action events are emitted. The caller waits for traces to be exported
// by polling the harness stats.
import { chromium, firefox, webkit } from 'playwright'

const ENGINES = { chromium, firefox, webkit }

export async function launchAndGenerate({ browserName, url, log = console.log }) {
  const engine = ENGINES[browserName]
  if (!engine) throw new Error(`unknown browser "${browserName}" (expected chromium|firefox|webkit)`)

  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (msg) => log(`    [page:${browserName}] ${msg.type()}: ${msg.text()}`))
  page.on('pageerror', (err) => log(`    [page:${browserName}] pageerror: ${err.message}`))

  log(`  navigating ${browserName} to ${url}`)
  await page.goto(url, { waitUntil: 'load', timeout: 45000 })

  // Confirm the injected agent actually initialized in this browser.
  await page.waitForFunction(() => window.__ODIGOS_AGENT_STARTED__ === true, null, {
    timeout: 30000,
  })
  log(`  agent initialized in ${browserName}`)

  // Same-origin fetch spans (no external network dependency).
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await fetch('/__otel/work')
      } catch {
        /* ignore */
      }
    }
  })

  // User-action / fetch activity: append our own probe button and click it, rather than the app's
  // buttons (which call external services or in-cluster backends that don't exist in CI).
  await page.evaluate(() => {
    const b = document.createElement('button')
    b.id = '__otel_probe__'
    b.textContent = 'otel probe'
    b.addEventListener('click', () => {
      fetch('/__otel/work').catch(() => {})
    })
    document.body.appendChild(b)
  })
  try {
    await page.click('#__otel_probe__', { timeout: 5000 })
  } catch {
    /* ignore */
  }

  return {
    async close() {
      await context.close()
      await browser.close()
    },
  }
}
