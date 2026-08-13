/*
 * Page-level ground-truth probe: what badge does a user actually see on the
 * demo corpus page?
 *
 * The corpus index.html references its images as /demo-corpus/<file>, so the
 * static root is test/fixtures, matching `bun run serve:fixtures`. Loads the
 * built extension, turns auto-scan on, then reads each injected c2pa icon back
 * out of the DOM. The icon carries no status attribute — its verdict is the
 * SVG fill colour baked into the background-image data URL — so the colour is
 * decoded back into the VALIDATION_STATUS the user is looking at.
 *
 *   node probe-demo-page.mjs [--dist <dir>] [--root <dir>]
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
const DIST = resolve(arg('--dist', join(here, 'chrome')))
const ROOT = resolve(arg('--root', join(here, 'fixtures')))
const SHOT = arg('--screenshot', null)

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
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
    const body = await readFile(join(ROOT, name))
    res.writeHead(200, {
      'content-type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
      'access-control-allow-origin': '*'
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
console.log('fixtures root served at', origin, 'from', ROOT)

const ctx = await chromium.launchPersistentContext(`/tmp/vd-page-${Date.now()}`, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: [
    '--headless=new',
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ]
})

const log = []
ctx.on('page', (p) => {
  p.on('console', (m) => log.push(`[${p.url().slice(0, 60)}] ${m.type()}: ${m.text().slice(0, 300)}`))
  p.on('pageerror', (e) => log.push(`[${p.url().slice(0, 60)}] PAGEERROR: ${e.message}`))
})

let sw = ctx.serviceWorkers()[0]
if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30000 })
const extId = new URL(sw.url()).host
console.log('extension id :', extId)

const helper = await ctx.newPage()
await helper.goto(`chrome-extension://${extId}/options.html`)
// Auto-scan ships OFF: onInstalled writes AUTO_SCAN_DEFAULT (false) on a fresh
// profile, so a bare storage.set here loses the race with the install handler.
// Wait the handler out, then flip the switch the way the popup does — through
// MSG_AUTO_SCAN_UPDATED, which persists it and broadcasts to open tabs.
await helper.waitForTimeout(5000)
await helper.evaluate(async () => {
  await chrome.runtime.sendMessage({ action: 'MSG_AUTO_SCAN_UPDATED', data: true })
})
await helper.waitForTimeout(2000)
const autoScanOn = await helper.evaluate(async () => (await chrome.storage.local.get('autoScan')).autoScan)
console.log('autoScan     :', autoScanOn)

const page = await ctx.newPage()
page.on('console', (m) => log.push(`[demo] ${m.type()}: ${m.text().slice(0, 300)}`))
page.on('pageerror', (e) => log.push(`[demo] PAGEERROR: ${e.message}`))
await page.goto(`${origin}/demo-corpus/index.html`, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(25000)

// Icons are absolutely positioned at document level, not nested inside the
// card, so each one is matched to its image by overlapping bounding box.
// The icon's verdict lives in the fill colour of its inline SVG background.
const seen = await page.evaluate(() => {
  // Each status has its own SVG with hardcoded fills (icon.ts). Decode the
  // badge art back to the VALIDATION_STATUS it represents.
  const icons = [...document.querySelectorAll('div[c2pa-icon]')].map((el) => ({
    el,
    box: el.getBoundingClientRect(),
    bg: decodeURIComponent(el.style.backgroundImage ?? ''),
    opacity: el.style.opacity ?? ''
  }))
  const readVerdict = (bg) => {
    if (bg === '') return '(no background)'
    if (bg.includes('#888888')) return 'no-credentials'
    if (bg.includes('#f0a500')) return 'warning'
    if (bg.includes('fill="#2a8a3c"')) return bg.includes('width="10"') ? 'ai-success' : 'success'
    if (bg.includes('fill="#c83232" stroke="#7a1f1f" stroke-width="2"')) return 'error/ai-error'
    if (bg.includes('camera.svg')) return 'img (still scanning)'
    return '(unrecognised)'
  }
  const rows = [...document.querySelectorAll('.corpus-item')].map((item) => {
    const img = item.querySelector('img')
    const ib = img.getBoundingClientRect()
    // the icon sits in the image's top-right corner
    const hit = icons.find(
      (i) =>
        i.box.left >= ib.left - 40 &&
        i.box.right <= ib.right + 40 &&
        i.box.top >= ib.top - 40 &&
        i.box.top <= ib.top + ib.height
    )
    return {
      title: item.querySelector('h3')?.textContent?.trim() ?? '?',
      src: (img?.getAttribute('src') ?? '').split('/').pop(),
      hasIcon: hit != null,
      opacity: hit?.opacity ?? '',
      verdict: hit == null ? '(no icon)' : readVerdict(hit.bg)
    }
  })
  return {
    totalIcons: icons.length,
    overlayFrames: [...document.querySelectorAll('iframe')].filter((f) => (f.src ?? '').includes('iframe.html')).length,
    allIconVerdicts: icons.map((i) => readVerdict(i.bg)),
    rawSamples: icons.map((i) => decodeURIComponent(i.bg).slice(0, 220)),
    rows
  }
})

console.log('\n===== what the user sees on the demo page =====')
console.log(`icons injected: ${seen.totalIcons} | overlay frames: ${seen.overlayFrames}`)
console.log(`all icon verdicts: ${JSON.stringify(seen.allIconVerdicts)}`)
for (const s of seen.rows) {
  console.log(`• ${s.title}\n    file   : ${s.src}\n    icon   : ${s.hasIcon ? 'present' : 'ABSENT'}${s.opacity !== '' ? ` (opacity ${s.opacity})` : ''}\n    verdict: ${s.verdict}`)
}

if (SHOT != null) {
  await page.screenshot({ path: SHOT, fullPage: true })
  console.log('\nscreenshot written to', SHOT)
}

console.log('\n===== console =====')
for (const line of log) console.log(line)
if (log.length === 0) console.log('(nothing captured)')

console.log('\n===== JSON =====')
console.log(JSON.stringify(seen, null, 2))

await ctx.close()
server.close()
