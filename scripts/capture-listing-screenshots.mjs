/*
 * Capture the Chrome Web Store listing screenshots from the built extension.
 *
 * The listing must show the interface users actually get, so these are taken by
 * driving the real bundle in real Chrome — never mocked, never hand-edited. Run
 * this after any UI change; a listing that pictures a superseded interface is a
 * store-policy accuracy problem, not just a stale asset.
 *
 * CWS requires every screenshot to be exactly 1280x800 (or 640x400). The popup
 * is ~400px wide by design, so those frames are composited onto a 1280x800
 * canvas rather than stretched, which would misrepresent the interface.
 *
 * Capture from the PRODUCTION build (`bun run build`), never `build:e2e`. The
 * demo corpus is signed by a development CA that production deliberately does
 * not trust, so an e2e build would render those fixtures with a green trusted
 * badge that no real installer will ever see. Screenshotting that would put a
 * claim on the store listing that is false for every user.
 *
 * Usage:
 *   bun run build                           # production: fixture CA NOT trusted
 *   bun run serve:fixtures &                # corpus on :3000
 *   node scripts/capture-listing-screenshots.mjs
 *
 * Output: releases/screenshots/*.png
 */

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXT_PATH = path.join(ROOT, 'dist', 'chrome')
const OUT_DIR = path.join(ROOT, 'releases', 'screenshots')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = process.env.FIXTURE ?? '08-trusted-trusteddit-signed'

const SHOT_W = 1280
const SHOT_H = 800

fs.mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Centre a captured PNG on a 1280x800 canvas tinted to match verifieddit.com,
 * so popup frames meet the CWS dimension rule without being distorted.
 */
async function composite (ctx, pngBuffer, outPath, caption) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: SHOT_W, height: SHOT_H })
  const b64 = pngBuffer.toString('base64')
  await page.setContent(`
    <!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;width:${SHOT_W}px;height:${SHOT_H}px;overflow:hidden}
      body{background:#fafaf7;display:flex;align-items:center;justify-content:center;
           font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#3f3f46}
      .wrap{display:flex;align-items:center;gap:56px}
      .shot{max-height:${SHOT_H - 80}px;border:1px solid #e4e4e7;border-radius:10px;
            box-shadow:0 10px 34px rgba(24,24,27,.10);display:block}
      .cap{max-width:440px}
      .cap h2{margin:0 0 12px;font-size:25px;line-height:1.25;font-weight:600;color:#18181b;letter-spacing:-.01em}
      .cap p{margin:0;font-size:16px;color:#52525b}
    </style>
    <div class="wrap">
      <img class="shot" src="data:image/png;base64,${b64}">
      <div class="cap"><h2>${caption.title}</h2><p>${caption.body}</p></div>
    </div>
  `, { waitUntil: 'load' })
  await sleep(400)
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: SHOT_W, height: SHOT_H } })
  await page.close()
  console.log(`  wrote ${path.relative(ROOT, outPath)}`)
}

async function main () {
  if (!fs.existsSync(path.join(EXT_PATH, 'manifest.json'))) {
    throw new Error(`No build at ${EXT_PATH}. Run: bun run build:e2e`)
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-shots-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: SHOT_W, height: SHOT_H },
    deviceScaleFactor: 1,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox'
    ]
  })

  try {
    let [sw] = ctx.serviceWorkers()
    if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30_000 })
    const extensionId = new URL(sw.url()).host
    await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })
    console.log(`extension ${extensionId}`)

    // Popup is a live feed: it must be open before the page is scanned or it
    // has nothing to show.
    const popup = await ctx.newPage()
    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' })
    await sleep(1200)

    const page = await ctx.newPage()
    await page.setViewportSize({ width: SHOT_W, height: SHOT_H })
    await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
    await sleep(9000)

    // The corpus page ends in developer scaffolding ("Corpus manifest:
    // manifest.json"). That is a harness detail, not the product, and it read as
    // an unfinished page in the listing. Remove it so the frame ends on content.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('footer, hr')) el.remove()
    })

    // ---- 1. detection on a live page -------------------------------------
    // Framed on the trusted/untrusted pair rather than the top of the page.
    // The top three fixtures are signed by the development CA the store build
    // does not trust, so a top-of-page shot is a wall of warning badges under
    // headings that read "Green Trust" — accurate, but it reads as broken
    // software. This pairing shows the product telling two assets apart, which
    // is the actual capability.
    console.log('01 detection')
    // The trusted fixture is the LAST card on the page, so aligning its TOP with
    // the frame filled two thirds of the shot with the empty tail of the
    // document. Align its BOTTOM instead: the frame then packs the cards above
    // it and the listing shows a page of badged media, not a page of white.
    await page.evaluate(({ f, h }) => {
      const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
      const card = img?.closest('.corpus-item') ?? img
      const bottom = (card?.getBoundingClientRect().bottom ?? 0) + window.scrollY
      window.scrollTo({ top: Math.max(0, bottom - h + 28), behavior: 'instant' })
    }, { f: FIXTURE, h: SHOT_H })
    await sleep(1500)
    await page.screenshot({ path: path.join(OUT_DIR, '01-detection.png'),
      clip: { x: 0, y: 0, width: SHOT_W, height: SHOT_H } })
    console.log(`  wrote 01-detection.png`)

    // ---- 2. provenance graph in the panel --------------------------------
    console.log('02 provenance graph')
    await page.evaluate((f) => {
      const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
      img?.scrollIntoView({ block: 'center' })
    }, FIXTURE)
    await sleep(2500)
    await page.evaluate((f) => {
      const t = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
      const r = t.getBoundingClientRect()
      const near = [...document.querySelectorAll('div[c2pa-icon]')].find((icon) => {
        const ir = icon.getBoundingClientRect()
        return Math.abs(ir.top - r.top) < 200 && Math.abs(ir.right - r.right) < 200
      })
      near?.click()
    }, FIXTURE)
    await page.waitForFunction(() => {
      const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog')
      return d != null && d.style.visibility === 'visible'
    }, { timeout: 15_000 })
    await sleep(3500)

    const frame = page.frames().find(f => f.url().includes('iframe.html'))
    if (frame == null) throw new Error('overlay iframe never appeared')

    // The graph now renders with the panel rather than behind "View more", so
    // there is nothing to expand first — only settle time for its layout pass.
    await sleep(2500)

    // The graph sits below the signer summary, so it opens below the fold. Bring
    // it into view and expand a node, or the listing shows a header and no graph.
    await frame.evaluate(() => {
      const root = document.querySelector('c2pa-overlay')?.shadowRoot
      const g = root?.querySelector('c2pa-provenance-graph')
      g?.scrollIntoView({ block: 'center', behavior: 'instant' })
      const node = g?.shadowRoot?.querySelector('.node')
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await sleep(2500)

    // The panel is taller than 800px now that the graph is in it, so it cannot
    // fit whole. Align its TOP with the frame: the verdict, signer and trust
    // state are the part a listing has to show, not the footer.
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog')
      if (d == null) return
      const top = d.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 24), behavior: 'instant' })
    })
    await sleep(1500)
    await page.screenshot({ path: path.join(OUT_DIR, '02-provenance-graph.png'),
      clip: { x: 0, y: 0, width: SHOT_W, height: SHOT_H } })
    console.log('  wrote 02-provenance-graph.png')

    // ---- 3. graph full screen --------------------------------------------
    console.log('03 graph full screen')
    const wentFull = await frame.evaluate(() => {
      const g = document.querySelector('c2pa-overlay')?.shadowRoot
        ?.querySelector('c2pa-provenance-graph')
      const btns = [...(g?.shadowRoot?.querySelectorAll('button') ?? [])]
      const fs = btns.find(b => /full/i.test(b.textContent ?? '') || /full/i.test(b.title ?? ''))
      if (fs == null) return false
      fs.click()
      return true
    })
    await sleep(2500)
    // Full screen fits the chain to the frame; on a short chain that leaves a
    // lot of empty canvas. Expand the nodes so the frame carries real detail.
    await frame.evaluate(() => {
      const g = document.querySelector('c2pa-overlay')?.shadowRoot
        ?.querySelector('c2pa-provenance-graph')
      for (const n of g?.shadowRoot?.querySelectorAll('.node') ?? []) {
        n.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      }
    })
    await sleep(2500)
    if (wentFull) {
      await page.screenshot({ path: path.join(OUT_DIR, '03-graph-fullscreen.png'),
        clip: { x: 0, y: 0, width: SHOT_W, height: SHOT_H } })
      console.log('  wrote 03-graph-fullscreen.png')
    } else {
      console.log('  SKIPPED: no Full screen control found')
    }

    // ---- 4/5/6. popup tabs ------------------------------------------------
    // The popup resolves its data with chrome.tabs.query({active: true,
    // currentWindow: true}). Opened as a page it IS the active tab, so it asks
    // itself what media is present, finds none, and sits on "Scanning...".
    // Make the corpus the active tab and reload the popup in the background so
    // the query lands on the page we actually want it to report.
    await page.bringToFront()
    await sleep(1000)
    await popup.reload({ waitUntil: 'domcontentloaded' })
    await sleep(6000)

    console.log('04 popup validation')
    // Expand the row for the SAME fixture the page shots use. Taking the first
    // row instead opened fixture 01, which a production build correctly reports
    // as untrusted (its CA is the development one). Accurate, but a listing
    // image whose headline verdict is "Untrusted" misrepresents the product.
    await popup.evaluate((f) => {
      const row = document.querySelector(`#validationEntries [data-url*="${f}"]`)
      const btn = row?.querySelector('.v-summary') ?? document.querySelector('#validationEntries .v-summary')
      btn?.click()
    }, FIXTURE)
    await sleep(2000)
    // Deliberately NOT scrolled to the expanded detail. Doing so frames a row
    // badged "Trusted" directly above `Errors: signingCredential.untrusted` --
    // our trust list accepts the signer, the underlying c2pa-js status does not
    // know the CA, and both render. Accurate, but it reads as a defect. The list
    // framing shows what this view is for: eight assets sorted into trusted,
    // untrusted, invalid and no-credentials. The graph has shots 02 and 03.
    await composite(ctx, await popup.screenshot({ fullPage: false }),
      path.join(OUT_DIR, '04-popup-validation.png'), {
        title: 'Every image on the page, checked as you browse',
        body: 'The popup lists the media it found and who signed each item, so an untrusted signer or a tampered file is visible before you act on it.'
      })

    const clickTab = async (label) => {
      await popup.evaluate((l) => {
        const tab = [...document.querySelectorAll('.tab')]
          .find(t => (t.textContent ?? '').trim().toLowerCase() === l.toLowerCase())
        tab?.click()
      }, label)
      await sleep(1500)
    }

    console.log('05 popup trust lists')
    await clickTab('Trust Lists')
    await composite(ctx, await popup.screenshot({ fullPage: false }),
      path.join(OUT_DIR, '05-popup-trustlists.png'), {
        title: 'Every official C2PA anchor, out of the box',
        body: 'All 29 anchors from the C2PA Conformance Program and the 21 official timestamp authorities ship built in. Add your own at any time.'
      })

    console.log('06 popup about')
    await clickTab('About')
    await composite(ctx, await popup.screenshot({ fullPage: false }),
      path.join(OUT_DIR, '06-popup-about.png'), {
        title: 'Know exactly what you are running',
        body: 'The About tab names the version you have installed and what changed in it, with a way to check each item yourself.'
      })

    console.log('\ndone')
  } finally {
    await ctx.close()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
