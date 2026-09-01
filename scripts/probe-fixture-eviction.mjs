/*
 * Verifies that a profile which once ran a dev/E2E build does not keep trusting
 * the demo-corpus fixture CA after upgrading to a production build.
 *
 * The fixture CA's private key is public in this repo, so a profile that
 * retains it treats anyone holding that key as a trusted signer. The build flag
 * TRUST_DEV_FIXTURES stops a production build from LOADING it, but storage
 * outlives the flag, so init() must also evict it.
 *
 * ONE BUILD, TWO LAUNCHES. Until 2026-09-01 this probe loaded --e2e-dist and
 * then --prod-dist into a single profile, and it PASSED unconditionally: an
 * unpacked extension's ID is derived from its load path, and chrome.storage.local
 * is namespaced by extension ID, so those are two different extensions with two
 * separate storage areas. Its "upgraded" step was reading a brand-new profile
 * that had never held the fixture CA. Staging both builds through one path does
 * not work either, because Chrome keeps serving the script it cached at first
 * install (a boot marker prepended to the second build never executed). See
 * issue #159. The legacy profile is now simulated the way
 * probe-upgrade-regression.mjs does it: write the old state into storage, then
 * restart the worker on the SAME build.
 *
 *   node probe-fixture-eviction.mjs --dist <dir> --e2e-dist <dir> --corpus <dir>
 *
 * --e2e-dist is read once, in its own profile, only to harvest the real fixture
 * trust-list record to seed with. It is never the build under test.
 *
 * This probe is known to FAIL on a build whose eviction branch is disabled;
 * that RED is what makes its PASS mean something.
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
const E2E_DIST = resolve(arg('--e2e-dist', join(here, 'chrome-e2e')))
const CORPUS = resolve(arg('--corpus', join(here, 'demo-corpus')))
const FIXTURE_LIST = 'Verifieddit Dev Fixtures'
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

const stamp = Date.now()
const profile = `/tmp/vd-evict-${stamp}`

async function open (dist, dir) {
  const ctx = await chromium.launchPersistentContext(dir, {
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
  await page.waitForTimeout(5000)
  return { ctx, page }
}

const storedNames = (page) => page.evaluate(async () =>
  ((await chrome.storage.local.get('trustList'))?.trustList ?? []).map((l) => l?.name ?? '(unnamed)'))

// Driving the C2PA engine can sit for a long time. Bound it so a slow
// validation degrades the reporting instead of hanging the probe; the pass/fail
// decision below tolerates an unknown verdict but never treats it as trusted.
const VERDICT_TIMEOUT_MS = 90_000
async function fixtureTrusted (page) {
  const call = page.evaluate(
    async (u) => {
      const r = await chrome.runtime.sendMessage({ action: 'MSG_VALIDATE_URL', data: u })
      return r?.trustList?.entity?.name ?? null
    },
    `${origin}/${FIXTURE}`
  ).catch(() => 'unknown')
  return await Promise.race([call, new Promise((r) => setTimeout(() => r('unknown'), VERDICT_TIMEOUT_MS))])
}

const fail = async (msg) => { console.log(`\nFAIL: ${msg}`); server.close(); process.exit(1) }

// -- STEP 0: harvest the real fixture record from an E2E build ---------------
const fixtureRecord = await (async () => {
  const { ctx, page } = await open(E2E_DIST, `/tmp/vd-evict-harvest-${stamp}`)
  const rec = await page.evaluate(async (name) => {
    const list = (await chrome.storage.local.get('trustList'))?.trustList ?? []
    return list.find((l) => l?.name === name) ?? null
  }, FIXTURE_LIST)
  await ctx.close()
  return rec
})()
console.log('\n===== STEP 0 - harvest the fixture record from an E2E build =====')
if (fixtureRecord == null) await fail(`precondition - the E2E build did not store "${FIXTURE_LIST}".`)
console.log(`harvested            : ${FIXTURE_LIST} (${(fixtureRecord.entities ?? []).length} entities)`)

// -- STEP 1 + 2: production build, fresh, then storage rewritten as legacy ---
let seededTrust
{
  const { ctx, page } = await open(DIST, profile)
  const fresh = await storedNames(page)
  console.log('\n===== STEP 1 - build under test, fresh profile =====')
  console.log(`stored trust lists   : ${JSON.stringify(fresh)}`)
  if (fresh.includes(FIXTURE_LIST)) {
    await ctx.close()
    await fail(`precondition - a production build must not bundle "${FIXTURE_LIST}".`)
  }

  await page.evaluate(async (fixture) => {
    const list = (await chrome.storage.local.get('trustList'))?.trustList ?? []
    list.push(fixture)
    await chrome.storage.local.set({ trustList: list })
  }, fixtureRecord)
  const seeded = await storedNames(page)
  seededTrust = await fixtureTrusted(page)
  console.log('\n===== STEP 2 - storage rewritten as a profile that ran a dev build =====')
  console.log(`stored trust lists   : ${JSON.stringify(seeded)}`)
  console.log(`${FIXTURE} trusted : ${seededTrust ?? 'no'}`)
  if (!seeded.includes(FIXTURE_LIST)) {
    await ctx.close()
    await fail('precondition - could not seed the fixture CA into storage.')
  }
  await ctx.close()
}

// -- STEP 3: same build, restarted worker - the upgrade path ----------------
const after = await (async () => {
  const { ctx, page } = await open(DIST, profile)
  const stored = await storedNames(page)
  const trusted = await fixtureTrusted(page)
  await ctx.close()
  return { stored, trusted }
})()
server.close()

console.log('\n===== STEP 3 - same build, restarted worker =====')
console.log(`stored trust lists   : ${JSON.stringify(after.stored)}`)
console.log(`${FIXTURE} trusted : ${after.trusted ?? 'no'}`)

const evicted = !after.stored.includes(FIXTURE_LIST)
const untrusted = after.trusted == null || after.trusted === 'unknown'

console.log('\n===== RESULT =====')
if (evicted && untrusted) {
  console.log('PASS: the production build evicted the fixture CA from an existing profile.')
  console.log('The public demo key is no longer a trusted signer for that user.')
  if (after.trusted === 'unknown') {
    console.log('NOTE: the rendered verdict timed out; the PASS rests on storage eviction alone.')
  }
  process.exit(0)
}
console.log(`FAIL: evicted=${evicted} stillTrustedAs=${after.trusted ?? 'no'}`)
console.log('  A profile that once ran a dev build still trusts the fixture CA, whose')
console.log('  private key is public in this repo.')
process.exit(1)
