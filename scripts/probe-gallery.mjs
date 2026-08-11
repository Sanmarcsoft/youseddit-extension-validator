/**
 * Live probe for the v1.2.0 popup gallery, run against real third-party sites.
 *
 * Verifies, in one headless Chrome session with the packaged extension loaded:
 *
 *   1. the entries path answers on a page whose images carry no credentials
 *      (a real news article), producing one 'no-credentials' row per image
 *      rather than the silence that left the popup on "Scanning…" forever;
 *   2. the same path reads a genuinely signed third-party asset and produces a
 *      'credentials' row;
 *   3. the right-click relay reaches the page and paints a badge;
 *   4. the popup renders those exact payloads, with the No Creds pill and its
 *      reduced opacity.
 *
 * Usage: node probe-gallery.mjs <path-to-dist/chrome> <chromium-executable>
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXT_PATH = process.argv[2]
const EXECUTABLE = process.argv[3]

const ARTICLE_URL = 'https://www.bbc.com/news/articles/cm2g90vvy62o'
const SIGNED_URL = 'https://raw.githubusercontent.com/contentauth/c2pa-rs/main/sdk/tests/fixtures/C.jpg'

const results = []
function check (name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail != null ? ` :: ${detail}` : ''}`)
}

async function waitForServiceWorker (ctx) {
  for (let i = 0; i < 60; i++) {
    const sw = ctx.serviceWorkers()[0]
    if (sw != null) return sw
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('extension service worker never registered')
}

async function collectEntries (sw, url, timeoutMs) {
  await sw.evaluate(() => {
    globalThis.__probe = { entries: [], summaries: [] }
    if (globalThis.__probeWired !== true) {
      globalThis.__probeWired = true
      chrome.runtime.onMessage.addListener((msg) => {
        if (globalThis.__probe == null) return
        if (msg?.action === 'MSG_RESPONSE_C2PA_ENTRIES') globalThis.__probe.entries.push(msg.data)
        if (msg?.action === 'MSG_RESPONSE_C2PA_SUMMARY') globalThis.__probe.summaries.push(msg.data)
      })
    }
  })

  const tabId = await sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((t) => t.url === u) ?? tabs.find((t) => t.url?.startsWith(u.slice(0, 40)))
    if (tab == null) throw new Error(`no tab for ${u}`)
    await chrome.tabs.sendMessage(tab.id, { action: 'MSG_REQUEST_C2PA_ENTRIES', data: null })
    return tab.id
  }, url)

  const deadline = Date.now() + timeoutMs
  let state = { entries: [], summaries: [] }
  while (Date.now() < deadline) {
    state = await sw.evaluate(() => globalThis.__probe ?? { entries: [], summaries: [] })
    if (state.summaries.some((s) => s.complete === true)) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { tabId, ...state }
}

async function main () {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-probe-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXECUTABLE,
    viewport: { width: 1400, height: 900 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })

  try {
    const sw = await waitForServiceWorker(ctx)
    const extensionId = new URL(sw.url()).host
    console.log(`extension id: ${extensionId}`)

    // Auto-scan ON, matching the reporting user's install.
    await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })

    // ---- 1. Real news article, images without credentials --------------
    const article = await ctx.newPage()
    await article.goto(ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await article.waitForTimeout(5_000)
    const imgCount = await article.evaluate(() => document.querySelectorAll('img').length)
    console.log(`article images in DOM: ${imgCount}`)

    const articleRun = await collectEntries(sw, ARTICLE_URL, 180_000)
    const noCreds = articleRun.entries.filter((e) => e.kind === 'no-credentials')
    check('article: entries reach the popup channel', articleRun.entries.length > 0,
      `${articleRun.entries.length} entries, ${articleRun.summaries.length} summaries`)
    check('article: unsigned images reported as no-credentials', noCreds.length > 0,
      `${noCreds.length} no-credentials rows, sample: ${noCreds[0]?.name ?? 'n/a'}`)
    check('article: scan reports a terminal summary', articleRun.summaries.some((s) => s.complete === true),
      JSON.stringify(articleRun.summaries.at(-1) ?? null))
    check('article: no entry claims credentials it does not have',
      articleRun.entries.every((e) => (e.kind === 'credentials') === (e.credentials != null)))

    // ---- 2. Right-click relay on the same real page --------------------
    const relay = await article.evaluate(async () => {
      const img = Array.from(document.querySelectorAll('img'))
        .find((i) => i.currentSrc !== '' && i.getBoundingClientRect().width > 100)
      if (img == null) return { ok: false, reason: 'no suitable image' }
      img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      return { ok: true, url: img.currentSrc }
    })
    if (relay.ok) {
      await sw.evaluate(async ({ tabId, url }) => {
        // Mirrors src/background.ts's contextMenus.onClicked handler exactly.
        const mod = await import(chrome.runtime.getURL('c2pa.js')).catch(() => null)
        void mod
        await chrome.tabs.sendMessage(tabId, {
          action: 'MSG_C2PA_RESULT_FROM_CONTEXT',
          data: { url, frame: 0, c2paResult: { __c2paError: true, name: 'No Manifest', message: 'No manifest found', url } }
        })
      }, { tabId: articleRun.tabId, url: relay.url })
      await article.waitForTimeout(2_000)
      const badge = await article.evaluate(() => document.querySelectorAll('div[c2pa-icon]').length)
      check('right-click relay paints a badge on the page', badge > 0, `${badge} badges`)
    } else {
      check('right-click relay paints a badge on the page', false, relay.reason)
    }

    // ---- 3. Genuinely signed third-party asset -------------------------
    const signed = await ctx.newPage()
    await signed.goto(SIGNED_URL, { waitUntil: 'load', timeout: 90_000 })
    await signed.waitForTimeout(3_000)
    const signedRun = await collectEntries(sw, SIGNED_URL, 120_000)
    const creds = signedRun.entries.filter((e) => e.kind === 'credentials')
    check('signed third-party asset yields a credentials row', creds.length > 0,
      creds[0] != null ? `${creds[0].name} · ${creds[0].status} · ${creds[0].credentials.signer}` : 'none')

    // ---- 4. Popup rendering with the real payloads ---------------------
    const payloads = [...creds.slice(0, 1), ...noCreds.slice(0, 4)]
    const popup = await ctx.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' })
    await popup.waitForTimeout(1_500)
    await popup.evaluate(() => {
      const tab = document.querySelector('[data-tab="validation"], #tab-validation, .tab-validation')
      if (tab instanceof HTMLElement) tab.click()
    })
    for (const entry of payloads) {
      await sw.evaluate(async (data) => {
        await chrome.runtime.sendMessage({ action: 'MSG_RESPONSE_C2PA_ENTRIES', data }).catch(() => {})
      }, entry)
    }
    await popup.waitForTimeout(1_500)

    const dom = await popup.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.v-row'))
      const nc = document.querySelector('.v-row-no-credentials')
      const empty = document.getElementById('validationEmpty')
      return {
        rowCount: rows.length,
        noCredsCount: document.querySelectorAll('.v-row-no-credentials').length,
        pills: Array.from(document.querySelectorAll('.v-pill')).map((p) => p.textContent?.trim()),
        noCredsOpacity: nc != null ? getComputedStyle(nc).opacity : null,
        emptyVisible: empty != null && empty.style.display !== 'none',
        emptyText: empty?.textContent?.trim() ?? null
      }
    })
    check('popup lists every analysed file', dom.rowCount === payloads.length,
      `${dom.rowCount} rows for ${payloads.length} payloads`)
    check('popup shows a No Creds pill', dom.pills.includes('No Creds'), JSON.stringify(dom.pills))
    check('No Creds rows are rendered at reduced opacity',
      dom.noCredsOpacity != null && Number(dom.noCredsOpacity) > 0 && Number(dom.noCredsOpacity) < 1,
      `opacity=${dom.noCredsOpacity} on ${dom.noCredsCount} rows`)
    check('placeholder clears once entries arrive', dom.emptyVisible === false, dom.emptyText)

    await popup.screenshot({ path: path.join(os.tmpdir(), 'vd-popup.png'), fullPage: true })
    console.log(`popup screenshot: ${path.join(os.tmpdir(), 'vd-popup.png')}`)

    // ---- 5. The real popup flow: it must find the ARTICLE tab -----------
    // The popup asks chrome.tabs.query({active:true,currentWindow:true}) and
    // messages whatever that returns. Hosting it in a tab of its own makes it
    // query itself, so bring the article to the front and reload the popup in
    // the background: DOMContentLoaded then fires with the article active,
    // which is exactly the state a toolbar popup sees.
    // chrome.tabs.query hides the URL of the extension's own pages without the
    // "tabs" permission, so ask the popup which tab it is sitting in.
    const popupTabId = await popup.evaluate(async () => await new Promise((resolve) => {
      chrome.tabs.getCurrent((t) => { resolve(t?.id ?? null) })
    }))
    if (popupTabId == null) throw new Error('popup could not identify its own tab')
    await article.bringToFront()
    await sw.evaluate(async (id) => { await chrome.tabs.reload(id) }, popupTabId)
    await popup.waitForTimeout(20_000)
    const live = await popup.evaluate(() => {
      const empty = document.getElementById('validationEmpty')
      return {
        rowCount: document.querySelectorAll('.v-row').length,
        noCredsCount: document.querySelectorAll('.v-row-no-credentials').length,
        emptyVisible: empty != null && empty.style.display !== 'none',
        emptyText: empty?.textContent?.trim() ?? null
      }
    })
    check('popup opened over a real page lists that page\'s media end to end',
      live.rowCount > 0, `${live.rowCount} rows (${live.noCredsCount} no-creds), placeholder="${live.emptyText}" visible=${live.emptyVisible}`)
    await popup.screenshot({ path: path.join(os.tmpdir(), 'vd-popup-live.png'), fullPage: true })
  } finally {
    await ctx.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => { console.error('PROBE ERROR', err); process.exit(2) })
