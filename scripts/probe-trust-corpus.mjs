/*
 * Ground-truth probe for the demo corpus.
 *
 * Loads the built PRODUCTION extension in Playwright's bundled Chromium, serves
 * test/fixtures/demo-corpus over HTTP, and drives the real MSG_VALIDATE_URL
 * service-worker flow for every fixture. Reports the verdict the user actually
 * sees, plus the trust lists the worker has loaded, which is where a
 * trusteddit-anchored asset silently loses its green badge.
 *
 *   node probe-trust-corpus.mjs [--dist <dir>] [--corpus <dir>]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}
const DIST = resolve(arg('--dist', join(here, 'chrome')))
const CORPUS = resolve(arg('--corpus', join(here, 'demo-corpus')))

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
console.log('corpus served at', origin, 'from', CORPUS)

const ctx = await chromium.launchPersistentContext(`/tmp/vd-trust-${Date.now()}`, {
  headless: false,
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
  p.on('console', (m) => log.push(`[${p.url()}] ${m.type()}: ${m.text()}`))
  p.on('pageerror', (e) => log.push(`[${p.url()}] PAGEERROR: ${e.message}`))
})

let sw = ctx.serviceWorkers()[0]
if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30000 })
const extId = new URL(sw.url()).host
console.log('extension id :', extId)

const page = await ctx.newPage()
await page.goto(`chrome-extension://${extId}/options.html`)
await page.waitForTimeout(4000)

// What did the worker actually load, and did initialisation report an error?
const trustState = await page.evaluate(async () => {
  const lists = await chrome.runtime.sendMessage({ action: 'MSG_GET_TRUSTLIST_INFOS' }).catch((e) => String(e))
  const local = await chrome.storage.local.get('trustList')
  const session = await chrome.storage.session?.get('trustListsInitError').catch(() => ({}))
  return {
    lists: Array.isArray(lists) ? lists.map((l) => l?.name ?? '(unnamed)') : lists,
    storedCount: Array.isArray(local?.trustList) ? local.trustList.length : 0,
    storedNames: Array.isArray(local?.trustList) ? local.trustList.map((l) => l?.name ?? '(unnamed)') : [],
    initError: session?.trustListsInitError ?? null
  }
})
console.log('\n===== worker trust state =====')
console.log(JSON.stringify(trustState, null, 2))

const files = (await readdir(CORPUS))
  .filter((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase()))
  .sort()

console.log('\n===== per-fixture verdicts =====')
const rows = []
for (const file of files) {
  const url = `${origin}/${encodeURIComponent(file)}`
  const r = await page.evaluate(async (u) => {
    try {
      return await chrome.runtime.sendMessage({ action: 'MSG_VALIDATE_URL', data: u })
    } catch (e) {
      return { __throw: String(e) }
    }
  }, url)

  const active = r?.manifestStore?.manifests?.[r?.manifestStore?.activeManifest]
  const row = {
    file,
    engineError: r?.__throw ?? r?.error ?? r?.message ?? null,
    signer: active?.signatureInfo?.issuer ?? null,
    certChain: r?.certChain?.length ?? 0,
    trusted: r?.trustList != null,
    trustEntity: r?.trustList?.entity?.name ?? null,
    validation: r?.manifestStore?.validationStatus ?? [],
    tsaTrust: r?.tsaTrustList?.entity?.name ?? null,
    tstTokens: Array.isArray(r?.tstTokens) ? r.tstTokens.length : (r?.tstTokens == null ? null : 'present'),
    chain: (r?.certChain ?? []).map((c) => ({ subject: c.subject, issuer: c.issuer, validFrom: c.validFrom, validTo: c.validTo }))
  }
  rows.push(row)
  console.log(
    `\n• ${file}` +
      `\n    engineError: ${row.engineError ?? '(none)'}` +
      `\n    signer     : ${row.signer ?? '(none)'}` +
      `\n    certChain  : ${row.certChain} certs` +
      `\n    trust      : ${row.trusted ? `TRUSTED — ${row.trustEntity}` : 'NOT in trust list'}` +
      `\n    validation : ${row.validation.length > 0 ? JSON.stringify(row.validation) : '(clean)'}` +
      `\n    tsaTrust   : ${row.tsaTrust ?? '(none)'} | tstTokens: ${row.tstTokens ?? '(none)'}` +
      `\n    chain      : ${JSON.stringify(row.chain, null, 6)}`
  )
}

console.log('\n===== extension-context console =====')
for (const line of log) console.log(line)
if (log.length === 0) console.log('(nothing captured)')

console.log('\n===== JSON =====')
console.log(JSON.stringify({ trustState, rows }, null, 2))

await ctx.close()
server.close()
