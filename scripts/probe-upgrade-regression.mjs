/*
 * Reproduces the upgrade regression: a profile that first ran a pre-v1.2 build
 * never picks up the Trusteddit trust anchors, so trusteddit.com-signed media
 * loses its green badge while every other fixture behaves normally.
 *
 * init() in src/trustlist.ts only calls loadDefaultTrustLists() when the stored
 * list is empty. chrome.storage.local survives extension updates, so any anchor
 * added after a user's first install is bundled but never loaded.
 *
 * The probe runs the SAME v1.2.1 build twice in one profile:
 *   pass 1 — fresh profile, anchors load, fixture 08 is TRUSTED (the happy path
 *            that hid this bug from every clean-profile test we ran)
 *   pass 2 — storage rewritten to the 3 lists a v1.1.3 profile would hold, then
 *            the worker is restarted. Anchors are still in the bundle.
 *
 *   node probe-upgrade-regression.mjs [--dist <dir>] [--corpus <dir>]
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
const CORPUS = resolve(arg('--corpus', join(here, 'demo-corpus')))
const FIXTURE = '08-trusted-trusteddit-signed.jpg'

// Anchors added after v1.1.3, i.e. exactly what a pre-upgrade profile lacks.
const POST_V113_LISTS = ['Trusteddit Trust List', 'tsa.trusteddit.com']

const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html' }

const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'
    const body = await readFile(join(CORPUS, name))
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

const profile = `/tmp/vd-upgrade-${Date.now()}`

async function launch () {
  const ctx = await chromium.launchPersistentContext(profile, {
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
  const extId = new URL(sw.url()).host
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${extId}/options.html`)
  await page.waitForTimeout(4000)
  return { ctx, page }
}

async function inspect (page, label) {
  const stored = await page.evaluate(async () => {
    const local = await chrome.storage.local.get('trustList')
    return (local?.trustList ?? []).map((l) => l?.name ?? '(unnamed)')
  })
  const r = await page.evaluate(
    async (u) => await chrome.runtime.sendMessage({ action: 'MSG_VALIDATE_URL', data: u }),
    `${origin}/${FIXTURE}`
  )
  const trusted = r?.trustList != null
  console.log(`\n===== ${label} =====`)
  console.log(`stored trust lists : ${JSON.stringify(stored)}`)
  console.log(`signer             : ${r?.manifestStore?.manifests?.[r?.manifestStore?.activeManifest]?.signatureInfo?.issuer ?? '(none)'}`)
  console.log(`trust verdict      : ${trusted ? `TRUSTED — ${r.trustList.entity.name}` : 'NOT in trust list  <-- user sees a WARNING badge, not green'}`)
  console.log(`tsa trust          : ${r?.tsaTrustList?.entity?.name ?? '(none)'}`)
  return { stored, trusted }
}

// Pass 1: fresh profile — the clean-install path.
const first = await launch()
const clean = await inspect(first.page, 'PASS 1 — fresh install (clean profile)')

// Simulate a profile created by v1.1.3: same storage, minus anchors that build
// never knew about. Nothing else changes; the bundle still carries them.
await first.page.evaluate(async (drop) => {
  const local = await chrome.storage.local.get('trustList')
  const downgraded = (local?.trustList ?? []).filter(
    (l) => !drop.includes(l?.name) && !drop.includes(l?.entities?.[0]?.name)
  )
  await chrome.storage.local.set({ trustList: downgraded })
}, POST_V113_LISTS)
await first.ctx.close()

// Pass 2: same profile, same build, restarted worker — the upgrade path.
const second = await launch()
const upgraded = await inspect(second.page, 'PASS 2 — pre-v1.2 profile upgraded to this build')
await second.ctx.close()

server.close()

const reproduced = clean.trusted && !upgraded.trusted
console.log(`\n===== RESULT =====`)
console.log(reproduced
  ? 'REGRESSION REPRODUCED: identical build, identical fixture. Trusted on a fresh\nprofile, untrusted after upgrading a pre-v1.2 profile. Bundled anchors never load.'
  : `NOT reproduced (clean=${clean.trusted}, upgraded=${upgraded.trusted}).`)
process.exit(reproduced ? 0 : 1)
