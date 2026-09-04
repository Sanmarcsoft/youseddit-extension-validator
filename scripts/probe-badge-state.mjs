/*
 * Ground-truth probe for the on-page BADGE, not the raw validation result.
 *
 * probe-trust-corpus.mjs answers "what did the worker compute?". This answers
 * "what colour did the user see?", which is a different question and the one
 * that went wrong: the CBC/Radio-Canada fixture had a clean validation result
 * and an intact signature, and still rendered the red integrity badge because
 * getC2PAStatus collapsed an expired certificate into an error.
 *
 * The status is read back out of the rendered SVG. src/icon.ts bakes a
 * status-specific palette into the data URL rather than exposing a data
 * attribute (see FIXME(#24) in test/e2e/a-verify.spec.ts, which is skipped for
 * exactly that reason), so the colours ARE the observable contract today.
 *
 *   node scripts/probe-badge-state.mjs [--dist <dir>] [--corpus <dir>]
 *
 * Needs an auto-scan build, since production ships auto-scan off (#86):
 *   AUTO_SCAN=true TRUST_DEV_FIXTURES=true bun run build
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
const DIST = resolve(arg('--dist', join(here, '..', 'dist', 'chrome-autoscan')))
const CORPUS = resolve(arg('--corpus', join(here, '..', 'test', 'fixtures', 'demo-corpus')))

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.html': 'text/html',
  '.json': 'application/json'
}

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
console.log('corpus served at', origin)

const ctx = await chromium.launchPersistentContext(`/tmp/vd-badge-${Date.now()}`, {
  headless: false,
  args: [
    '--headless=new',
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ]
})

let sw = ctx.serviceWorkers()[0]
if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30000 })
console.log('extension id :', new URL(sw.url()).host)

const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
const pageLog = []
page.on('console', (m) => pageLog.push(`${m.type()}: ${m.text()}`))
await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' })

// Media is badged only while visible (src/visible.ts), so a grid taller than
// the viewport leaves everything below the fold unscanned. Walk the page.
await page.setViewportSize({ width: 1280, height: 1400 })
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(1200)
}
await page.evaluate(() => { window.scrollTo(0, 0) })
await page.waitForTimeout(4000)

const diag = await page.evaluate(() => ({
  media: document.querySelectorAll('img, video, audio').length,
  icons: document.querySelectorAll('[c2pa-icon]').length
}))
// chrome.storage is not reachable from the page's main world, only from an
// extension context, so the auto-scan setting is read on its own page.
const optionsPage = await ctx.newPage()
await optionsPage.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`)
const autoScan = await optionsPage.evaluate(async () => (await chrome.storage.local.get('autoScan')).autoScan)
await optionsPage.close()
console.log('\ndiagnostics  :', JSON.stringify({ ...diag, autoScan }))
console.log('\n===== page console (last 40) =====')
for (const l of pageLog.slice(-40)) console.log(' ', l)

const badges = await page.evaluate(() => {
  // Each status paints a distinct SVG. Match on marks unique to one of them
  // rather than on a single fill colour: the warning art carries the error red
  // in its alert triangle, so a naive '#c83232' test reports every amber badge
  // as red.
  const classify = (svg) => {
    if (svg.includes('viewBox="0 0 157 141"')) return 'warning'
    if (svg.includes('M28 38.4')) return svg.includes('width="10"') ? 'ai-error' : 'error'
    if (svg.includes('circle') && svg.includes('#888888')) return 'no-credentials'
    if (svg.includes('rect') && svg.includes('width="10"')) return 'ai-success'
    if (svg.includes('#2a8a3c')) return 'success'
    return 'unknown'
  }
  const out = []
  for (const c of document.querySelectorAll('[c2pa-icon]')) {
    const painted = c.querySelector('div') ?? c
    const bg = getComputedStyle(painted).backgroundImage
    const m = /url\("data:image\/svg\+xml;utf8,([^"]*)"\)/.exec(bg)
    const svg = m == null ? '' : decodeURIComponent(m[1])
    // Icons are appended to document.body, not next to their media, so the
    // only link back is the title set by CrIcon.setMetadataLink.
    const src = /C2PA metadata: (\S+)/.exec(c.title ?? '')?.[1] ?? '(unlinked)'
    out.push({ media: decodeURIComponent(src.split('/').pop() ?? src), status: classify(svg) })
  }
  return out
})

console.log('\n===== rendered badge state =====')
for (const b of badges.sort((a, z) => String(a.media).localeCompare(String(z.media)))) {
  console.log(`  ${String(b.media).padEnd(40)} ${b.status}`)
}
console.log(`\ntotal badges: ${badges.length}`)

await ctx.close()
server.close()
