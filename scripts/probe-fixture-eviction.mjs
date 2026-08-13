/*
 * Verifies that a profile which once ran a dev/E2E build does not keep trusting
 * the demo-corpus fixture CA after upgrading to a production build.
 *
 * The fixture CA's private key is public in this repo, so a profile that
 * retains it treats anyone holding that key as a trusted signer. The build flag
 * TRUST_DEV_FIXTURES stops a production build from LOADING it, but storage
 * outlives the flag, so init() must also evict it.
 *
 *   node probe-fixture-eviction.mjs --e2e-dist <dir> --prod-dist <dir> --corpus <dir>
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}
const E2E_DIST = resolve(arg('--e2e-dist', join(here, 'chrome-e2e')))
const PROD_DIST = resolve(arg('--prod-dist', join(here, 'chrome')))
const CORPUS = resolve(arg('--corpus', join(here, 'demo-corpus')))
const FIXTURE = '01-greentrust-jpeg.jpg' // signed by the dev fixture CA

const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html' }
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'
    const body = await readFile(join(CORPUS, name))
    res.writeHead(200, { 'content-type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const profile = `/tmp/vd-evict-${Date.now()}`

async function run (dist, label) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })
  let sw = ctx.serviceWorkers()[0]
  if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30000 })
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`)
  await page.waitForTimeout(4000)

  const stored = await page.evaluate(async () => {
    const local = await chrome.storage.local.get('trustList')
    return (local?.trustList ?? []).map((l) => l?.name ?? '(unnamed)')
  })
  const r = await page.evaluate(
    async (u) => await chrome.runtime.sendMessage({ action: 'MSG_VALIDATE_URL', data: u }),
    `${origin}/${FIXTURE}`
  )
  await ctx.close()

  const hasFixtureList = stored.includes('Verifieddit Dev Fixtures')
  const trusted = r?.trustList != null
  console.log(`\n===== ${label} =====`)
  console.log(`stored trust lists  : ${JSON.stringify(stored)}`)
  console.log(`fixture CA stored   : ${hasFixtureList}`)
  console.log(`${FIXTURE} trusted : ${trusted}${trusted ? ` (${r.trustList.entity.name})` : ''}`)
  return { hasFixtureList, trusted }
}

const e2e = await run(E2E_DIST, 'STEP 1 — profile runs an E2E build (fixture CA trusted by design)')
const prod = await run(PROD_DIST, 'STEP 2 — same profile upgraded to the PRODUCTION build')
server.close()

const ok = e2e.hasFixtureList && e2e.trusted && !prod.hasFixtureList && !prod.trusted
console.log('\n===== RESULT =====')
console.log(ok
  ? 'PASS: the production build evicted the fixture CA from an existing profile.\nThe public demo key is no longer a trusted signer for that user.'
  : `FAIL: e2e(list=${e2e.hasFixtureList},trusted=${e2e.trusted}) prod(list=${prod.hasFixtureList},trusted=${prod.trusted})`)
process.exit(ok ? 0 : 1)
