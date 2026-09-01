/*
 * Verifies that ONE malformed record in chrome.storage.local cannot abort the
 * trust-list reconciliation.
 *
 * mergeDefaultTrustLists() builds a Set of the keys it already has before it
 * merges anything. That build used to be an unguarded
 * `globalTrustLists.map(trustListKey)`, and trustListKey dereferenced
 * `tl.entities.flatMap(...)` with no guard. A single stored record without a
 * well-formed `entities` array therefore threw on the FIRST statement that
 * touches stored data - before the merge loop and before the fixture eviction.
 * init() caught it, recorded trustListsInitError, and carried on, so BOTH
 * halves of the #155 fix silently did not run.
 *
 * That is a fail-OPEN: the profile keeps the demo-corpus fixture CA (whose
 * private key is public in this repo) as a trusted signer, and never receives
 * newly bundled anchors. A trust store that cannot read itself must not end up
 * more trusting than intended.
 *
 * ONE BUILD, TWO LAUNCHES. Do not be tempted to load an e2e build and then a
 * production build to simulate the upgrade. An unpacked extension's ID is
 * derived from its load path, so two paths give two separate storage areas;
 * and staging both builds through a single path does NOT work either, because
 * Chrome keeps serving the script it cached at first install (verified: a boot
 * marker prepended to the second build never executed, and the probe silently
 * measured the FIRST build twice). The legacy profile is therefore simulated
 * the way probe-upgrade-regression.mjs does it: write the old state into
 * storage, then restart the worker on the same build.
 *
 *   node probe-malformed-store.mjs --dist <dir> --e2e-dist <dir>
 *
 * --e2e-dist is read once, in its own profile, only to harvest the real
 * fixture trust-list record to seed with. It is never the build under test.
 */
import { chromium } from 'playwright'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}
const DIST = resolve(arg('--dist', join(here, 'chrome')))
const E2E_DIST = resolve(arg('--e2e-dist', join(here, 'chrome-e2e')))

const FIXTURE_LIST = 'Verifieddit Dev Fixtures'
const MERGED_LIST = 'Trusteddit Trust List'


const stamp = Date.now()

async function open (dist, profile) {
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
  await page.waitForTimeout(5000)
  return { ctx, page }
}

const storedNames = (page) => page.evaluate(async () =>
  ((await chrome.storage.local.get('trustList'))?.trustList ?? []).map((l) => l?.name ?? '(unnamed)'))

// Reads only chrome.storage.local, which is what the fix is about and what
// the pass/fail decision uses. Rendered per-asset verdicts are deliberately
// NOT probed here: driving the C2PA WASM engine from the options page in this
// harness proved unreliable (it either sat for minutes or the message channel
// closed before responding), and a probe that prints an unreliable trust
// verdict is worse than one that prints none. Asset verdicts are covered by
// probe-trust-corpus.mjs and probe-upgrade-regression.mjs.
async function inspect (page) {
  return {
    stored: await storedNames(page),
    initError: await page.evaluate(async () =>
      (await chrome.storage.session?.get('trustListsInitError'))?.trustListsInitError ?? null)
  }
}

const fail = async (msg) => { console.log(`\nFAIL: ${msg}`); process.exit(1) }

// -- STEP 0: harvest the real fixture record from an E2E build, own profile ---
const fixtureRecord = await (async () => {
  const { ctx, page } = await open(E2E_DIST, `/tmp/vd-malformed-harvest-${stamp}`)
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

// -- STEP 1: the build under test, fresh profile --------------------------
const profile = `/tmp/vd-malformed-${stamp}`
{
  const { ctx, page } = await open(DIST, profile)
  const names = await storedNames(page)
  console.log('\n===== STEP 1 - build under test, fresh profile =====')
  console.log(`stored trust lists   : ${JSON.stringify(names)}`)
  if (names.includes(FIXTURE_LIST)) {
    await ctx.close()
    await fail(`precondition - a production build must not bundle "${FIXTURE_LIST}".`)
  }

  // -- STEP 2: rewrite storage as a legacy profile: the fixture CA present
  // (this profile once ran a dev build), the newer anchors absent (that build
  // never knew them), and one malformed record. Only the malformed record is
  // the variable under test; the other two are what makes the two halves of
  // the #155 fix observable.
  const seeded = await page.evaluate(async ({ fixture, drop }) => {
    const list = ((await chrome.storage.local.get('trustList'))?.trustList ?? [])
      .filter((l) => !drop.includes(l?.name))
    // No `entities` key at all. This is what the old unguarded
    // `tl.entities.flatMap(...)` threw on.
    list.unshift({ name: 'Corrupted Legacy List', description: 'malformed record' })
    list.push(fixture)
    await chrome.storage.local.set({ trustList: list })
    return ((await chrome.storage.local.get('trustList'))?.trustList ?? []).map((l) => l?.name ?? '(unnamed)')
  }, { fixture: fixtureRecord, drop: [MERGED_LIST] })
  console.log('\n===== STEP 2 - storage rewritten as a corrupted legacy profile =====')
  console.log(`stored trust lists   : ${JSON.stringify(seeded)}`)
  await ctx.close()
}

// -- STEP 3: same build, restarted worker - the upgrade path ---------------
const after = await (async () => {
  const { ctx, page } = await open(DIST, profile)
  const s = await inspect(page)
  await ctx.close()
  return s
})()
console.log('\n===== STEP 3 - same build, restarted worker =====')
console.log(`stored trust lists   : ${JSON.stringify(after.stored)}`)
console.log(`init error           : ${after.initError ?? '(none)'}`)

const evicted = !after.stored.includes(FIXTURE_LIST)
const merged = after.stored.includes(MERGED_LIST)

console.log('\n===== RESULT =====')
if (evicted && merged) {
  console.log('PASS: a malformed stored record did not abort reconciliation.')
  console.log(`  - "${FIXTURE_LIST}" evicted (the public demo key is not a trusted signer)`)
  console.log(`  - "${MERGED_LIST}" merged back in`)
  process.exit(0)
}
console.log(`FAIL: evicted=${evicted} merged=${merged}`)
console.log('  A single bad record aborted reconciliation, leaving the profile more')
console.log('  trusting than intended. This is the fail-open path.')
process.exit(1)
