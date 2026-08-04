#!/usr/bin/env node
/*
 * Firefox functional smoke test.
 *
 * Why this exists instead of a Playwright project: Playwright cannot install
 * WebExtensions into Firefox at all. geckodriver can, via the non-standard
 * WebDriver endpoint POST /session/:id/moz/addon/install with temporary:true,
 * which is the same mechanism `web-ext run` uses. So the Chrome side stays on
 * Playwright (test/e2e) and the Gecko side is driven from here.
 *
 * What it proves that `web-ext lint` cannot: that the C2PA WASM engine actually
 * initialises inside a Firefox MV3 *event page* (Chrome runs it in an offscreen
 * document, which Firefox has no equivalent for), and that verdict badges reach
 * the DOM. Lint is a static gate; this is the behavioural one.
 *
 * The extension ships with auto-scan OFF, so a passive page load would prove
 * nothing. Build the bundle under test with AUTO_SCAN=true so it self-triggers:
 *
 *   AUTO_SCAN=true TRUST_DEV_FIXTURES=true bun run build
 *   bun run serve:fixtures &
 *   node scripts/firefox-smoke.mjs
 *
 * Usage: node scripts/firefox-smoke.mjs [--url URL] [--min N] [--source-dir DIR]
 *                                       [--firefox PATH] [--headed]
 * Exit code 0 = pass, 1 = fail.
 */

import { execSync, spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function arg (name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

const URL_UNDER_TEST = arg('url', 'http://localhost:3000/demo-corpus/')
const MIN_BADGES = Number(arg('min', '5'))
const SOURCE_DIR = path.resolve(repoRoot, arg('source-dir', 'dist/firefox'))
const FIREFOX_BIN = arg('firefox', '/Applications/Firefox.app/Contents/MacOS/firefox')
const HEADED = process.argv.includes('--headed')
const CLICK_PROBE = process.argv.includes('--click')
const PORT = Number(arg('port', '4444'))
const BASE = `http://127.0.0.1:${PORT}`

// Badge contract: src/icon.ts appends a div carrying the `c2pa-icon` attribute
// to document.body for every media element it reaches a verdict on.
const BADGE_SELECTOR = '[c2pa-icon]'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wd (method, endpoint, body) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = json?.value?.message ?? JSON.stringify(json)
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${err}`)
  }
  return json.value
}

async function waitForDriver (timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/status`)
      if (res.ok) return
    } catch { /* not up yet */ }
    await sleep(250)
  }
  throw new Error(`geckodriver did not start on ${BASE}`)
}

let driver
let sessionId

async function main () {
  console.log(`[smoke] extension : ${SOURCE_DIR}`)
  console.log(`[smoke] target    : ${URL_UNDER_TEST}`)
  console.log(`[smoke] firefox   : ${FIREFOX_BIN}`)
  console.log(`[smoke] threshold : >= ${MIN_BADGES} badges\n`)

  /*
   * geckodriver is deliberately NOT a devDependency: its postinstall downloads
   * a platform binary, which would both churn bun.lock and break offline/CI
   * installs for everyone who never runs this test. Fail with instructions
   * instead of failing obscurely inside spawn().
   */
  try {
    execSync('command -v geckodriver', { stdio: 'ignore' })
  } catch {
    throw new Error(
      'geckodriver not found on PATH.\n' +
      '       Install it with:  bun add -g geckodriver\n' +
      '       (kept out of devDependencies on purpose — it downloads a binary at install time)'
    )
  }

  driver = spawn('geckodriver', ['--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] })
  driver.stderr.on('data', (d) => {
    const s = String(d)
    if (/error|fatal/i.test(s)) process.stderr.write(`[geckodriver] ${s}`)
  })
  await waitForDriver()

  const args = HEADED ? [] : ['-headless']
  const caps = {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': { binary: FIREFOX_BIN, args }
      }
    }
  }
  const session = await wd('POST', '/session', caps)
  sessionId = session.sessionId
  const v = session.capabilities?.browserVersion ?? 'unknown'
  console.log(`[smoke] Firefox ${v}, session ${sessionId}`)

  const addonId = await wd('POST', `/session/${sessionId}/moz/addon/install`, {
    path: SOURCE_DIR,
    temporary: true
  })
  console.log(`[smoke] installed add-on: ${addonId}`)

  // The event page initialises the WASM engine and fetches trust lists on
  // startup; give it a beat before the page starts asking it for verdicts.
  await sleep(3000)

  await wd('POST', `/session/${sessionId}/url`, { url: URL_UNDER_TEST })

  const probe = `
    const badges = Array.from(document.querySelectorAll(${JSON.stringify(BADGE_SELECTOR)}));
    return {
      images: document.querySelectorAll('img').length,
      badges: badges.length,
      titles: badges.map(b => b.title || '').filter(Boolean).slice(0, 12)
    };
  `

  let last = { images: 0, badges: 0, titles: [] }
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    last = await wd('POST', `/session/${sessionId}/execute/sync`, { script: probe, args: [] })
    if (last.badges >= MIN_BADGES) break
    await sleep(1000)
  }

  console.log(`\n[smoke] images on page : ${last.images}`)
  console.log(`[smoke] badges rendered: ${last.badges}`)
  for (const t of last.titles) console.log(`         - ${t}`)

  /*
   * --click: does clicking a badge actually open the overlay?
   *
   * Worth probing separately because it exercises a path lint cannot see and
   * that Chrome and Firefox implement differently. The overlay UI lives in
   * iframe.html, an extension page embedded as an iframe in the tab, and the
   * click is delivered by runtime.sendMessage fanning out to extension
   * contexts. Badges rendering proves the engine works; it says nothing about
   * whether that fan-out reaches an embedded extension page in Gecko.
   */
  if (CLICK_PROBE) {
    console.log('\n[smoke] --- click probe ---')
    const before = await wd('POST', `/session/${sessionId}/execute/sync`, {
      script: `
        const frames = Array.from(document.querySelectorAll('iframe'));
        return {
          iframes: frames.length,
          extFrames: frames.filter(f => (f.src||'').startsWith('moz-extension://')).map(f => ({
            src: (f.src||'').slice(-24),
            display: getComputedStyle(f).display,
            visibility: getComputedStyle(f).visibility,
            w: f.getBoundingClientRect().width,
            h: f.getBoundingClientRect().height
          }))
        };`,
      args: []
    })
    console.log(`[smoke] before click: ${before.iframes} iframe(s), ${before.extFrames.length} extension iframe(s)`)
    for (const f of before.extFrames) console.log(`         ${JSON.stringify(f)}`)

    const clicked = await wd('POST', `/session/${sessionId}/execute/sync`, {
      script: `
        const b = document.querySelector('[c2pa-icon]');
        if (!b) return { clicked: false, reason: 'no badge found' };
        b.click();
        return { clicked: true, hasOnclick: typeof b.onclick === 'function' };`,
      args: []
    })
    console.log(`[smoke] click dispatched: ${JSON.stringify(clicked)}`)

    await sleep(3000)

    const after = await wd('POST', `/session/${sessionId}/execute/sync`, {
      script: `
        const frames = Array.from(document.querySelectorAll('iframe'));
        const ext = frames.filter(f => (f.src||'').startsWith('moz-extension://'));
        return {
          iframes: frames.length,
          extFrames: ext.map(f => ({
            display: getComputedStyle(f).display,
            visibility: getComputedStyle(f).visibility,
            w: Math.round(f.getBoundingClientRect().width),
            h: Math.round(f.getBoundingClientRect().height)
          })),
          toasts: document.querySelectorAll('[c2pa-toast]').length
        };`,
      args: []
    })
    console.log(`[smoke] after click : ${after.iframes} iframe(s), ${after.extFrames.length} extension iframe(s), ${after.toasts} toast(s)`)
    for (const f of after.extFrames) console.log(`         ${JSON.stringify(f)}`)

    const overlayVisible = after.extFrames.some(
      (f) => f.display !== 'none' && f.visibility !== 'hidden' && f.w > 0 && f.h > 0
    )
    console.log(`[smoke] OVERLAY VISIBLE: ${overlayVisible ? 'YES' : 'NO'}`)
    if (!overlayVisible) {
      console.error('\nFAIL: badge click did not open a visible overlay.')
      return 1
    }
  }

  if (last.badges < MIN_BADGES) {
    console.error(`\nFAIL: expected >= ${MIN_BADGES} badges, got ${last.badges}.`)
    console.error('The add-on installed but produced no verdicts — the C2PA engine')
    console.error('likely failed to initialise in the Firefox event page.')
    return 1
  }
  console.log(`\nPASS: ${last.badges} verdict badges rendered in Firefox ${v}.`)
  return 0
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`\nFAIL: ${err.message}`)
  process.exitCode = 1
} finally {
  try { if (sessionId) await wd('DELETE', `/session/${sessionId}`) } catch { /* best effort */ }
  driver?.kill()
}
