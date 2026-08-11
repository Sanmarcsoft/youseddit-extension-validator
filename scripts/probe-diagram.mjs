/**
 * Live probe for the reports filed against v1.2.0, run in real Chrome against a
 * real third-party asset (OpenAI's published C2PA example, not our own corpus).
 *
 *   A. "Fit does nothing in full screen"  — the fit ratio must be honoured
 *      above zoom 1, so the graph actually fills a full-screen frame.
 *   B. "I can't click and drag objects in the diagram" — a press-drag on a node
 *      must move that node and take its edges with it, and the toggle button
 *      inside the node must still expand it.
 *   C. "the drop down menu has arrows for each section but they can't be
 *      clicked" — each popup row's disclosure must reveal its detail panel.
 *   D. "in the reloading of the extension I see this error" — capture whatever
 *      content.js actually throws when the extension is reloaded under an open
 *      page, rather than guessing at it.
 *
 * Usage: node probe-diagram.mjs <path-to-dist/chrome> <chromium-executable>
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXT_PATH = process.argv[2]
const EXECUTABLE = process.argv[3]

/** Real, third-party, publicly published C2PA asset. */
const SIGNED_URL = 'https://contentauth.github.io/example-assets/images/ChatGPT_Image.png'
const ARTICLE_URL = 'https://www.bbc.com/news/articles/cm2g90vvy62o'
const OUT = path.join(os.tmpdir(), 'vd-diagram')

const results = []
function check (name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail != null ? ` :: ${detail}` : ''}`)
}

async function waitForServiceWorker (ctx) {
  for (let i = 0; i < 80; i++) {
    const sw = ctx.serviceWorkers()[0]
    if (sw != null) return sw
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('extension service worker never registered')
}

/** State of the diagram, read straight out of its shadow root. */
async function diagramState (frame) {
  return await frame.evaluate(() => {
    const host = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph')
    const root = host?.shadowRoot
    if (root == null) return { present: false }
    const frameEl = root.querySelector('.frame')
    const vp = root.querySelector('.viewport')
    const style = vp?.getAttribute('style') ?? ''
    const scale = Number(/scale\(([-\d.]+)\)/.exec(style)?.[1] ?? NaN)
    const fr = frameEl?.getBoundingClientRect()
    const vr = vp?.getBoundingClientRect()
    const nodes = [...root.querySelectorAll('.node')].map((n) => ({
      id: n.getAttribute('data-node-id'),
      left: Number(/left:\s*([-\d.]+)px/.exec(n.getAttribute('style') ?? '')?.[1] ?? NaN),
      top: Number(/top:\s*([-\d.]+)px/.exec(n.getAttribute('style') ?? '')?.[1] ?? NaN)
    }))
    return {
      present: true,
      scale,
      frame: fr != null ? { w: Math.round(fr.width), h: Math.round(fr.height) } : null,
      content: vr != null ? { w: Math.round(vr.width), h: Math.round(vr.height) } : null,
      nodes,
      edges: [...root.querySelectorAll('svg.edges path[d]')].map((p) => p.getAttribute('d')),
      buttons: [...root.querySelectorAll('.controls button')].map((b) => b.getAttribute('title')),
      inFullscreen: document.fullscreenElement != null
    }
  })
}

async function main () {
  fs.mkdirSync(OUT, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-diag-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXECUTABLE,
    viewport: { width: 1500, height: 1000 },
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
    await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })

    // ---- open the overlay on a real signed asset ----------------------
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`) })

    await page.goto(SIGNED_URL, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForSelector('div[c2pa-icon]', { timeout: 60_000 })
    // The badge is painted before validation finishes; clicking it too early is
    // a no-op, so poll the click until the overlay actually opens.
    let opened = false
    for (let i = 0; i < 24 && !opened; i++) {
      await page.waitForTimeout(2_000)
      await page.evaluate(() => { document.querySelector('div[c2pa-icon]')?.click() })
      opened = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find((f) => f.className === 'c2paDialog')
        return d != null && d.style.visibility === 'visible'
      })
    }
    if (!opened) throw new Error('overlay never became visible')
    await page.waitForTimeout(2_500)

    const frame = page.frames().find((f) => f.url().includes('iframe.html'))
    if (frame == null) throw new Error('overlay iframe never appeared')

    // Expand the panel, then the Provenance chain section.
    await frame.evaluate(() => {
      document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('button.more')?.click()
    })
    await page.waitForTimeout(800)
    await frame.evaluate(() => {
      const o = document.querySelector('c2pa-overlay')
      const s = [...(o?.shadowRoot?.querySelectorAll('c2pa-collapsible') ?? [])].find((c) =>
        (c.querySelector('[slot="header"]')?.textContent ?? '').trim() === 'Provenance chain')
      s?.shadowRoot?.querySelector('.collapsible-header')?.click()
    })
    await page.waitForTimeout(1_800)

    const initial = await diagramState(frame)
    check('provenance diagram renders for the OpenAI asset',
      initial.present === true && initial.nodes.length > 0,
      `${initial.nodes.length ?? 0} nodes, ${initial.edges?.length ?? 0} edges, scale=${initial.scale}`)
    if (initial.present !== true || initial.nodes.length === 0) throw new Error('no diagram to test')

    const ui = page.frameLocator('iframe.c2paDialog')

    // ---- B. drag a node -----------------------------------------------
    const nodeLoc = ui.locator('c2pa-provenance-graph .node').first()
    const box = await nodeLoc.boundingBox()
    if (box == null) throw new Error('node has no box')
    // Grab near the top-left of the node body, well clear of the toggle button
    // on its right edge.
    const gx = box.x + 30
    const gy = box.y + 12
    const before = initial.nodes[0]
    await page.mouse.move(gx, gy)
    await page.mouse.down()
    await page.mouse.move(gx + 140, gy + 90, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(600)

    const dragged = await diagramState(frame)
    const after = dragged.nodes.find((n) => n.id === before.id)
    const moved = after != null && (Math.abs(after.left - before.left) > 8 || Math.abs(after.top - before.top) > 8)
    check('dragging a node moves it', moved,
      `${before.id}: (${before.left},${before.top}) -> (${after?.left},${after?.top}) at zoom ${initial.scale}`)
    check('edges follow the dragged node',
      initial.edges.length === 0 || JSON.stringify(dragged.edges) !== JSON.stringify(initial.edges),
      `${initial.edges.length} edges, changed=${JSON.stringify(dragged.edges) !== JSON.stringify(initial.edges)}`)
    check('a Reset layout control appears once a node is hand-placed',
      (dragged.buttons ?? []).includes('Undo hand placement and return every node to the computed layout'),
      JSON.stringify(dragged.buttons))

    // The toggle button inside a node must still expand it: pointer capture on
    // the frame suppresses `click` on captured descendants, which is exactly
    // how the toolbar died in #141.
    const beforeExpand = await frame.evaluate(() =>
      document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph')
        ?.shadowRoot?.querySelectorAll('.node.expanded').length ?? -1)
    const toggle = ui.locator('c2pa-provenance-graph .node .toggle').first()
    await toggle.click({ force: true })
    await page.waitForTimeout(600)
    const afterExpand = await frame.evaluate(() =>
      document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph')
        ?.shadowRoot?.querySelectorAll('.node.expanded').length ?? -1)
    check('the node toggle still expands after the drag change', afterExpand !== beforeExpand,
      `expanded ${beforeExpand} -> ${afterExpand}`)

    // Put the layout back so the full-screen measurements are clean.
    await ui.locator('c2pa-provenance-graph button[aria-label="Reset layout"]').click()
    await page.waitForTimeout(900)
    const reset = await diagramState(frame)
    check('Reset layout restores the computed positions',
      reset.nodes.find((n) => n.id === before.id)?.left === before.left,
      `${before.id} left ${reset.nodes.find((n) => n.id === before.id)?.left} vs ${before.left}`)

    // ---- A. Fit in full screen ----------------------------------------
    await ui.locator('c2pa-provenance-graph button[title="Full screen"]').click()
    await page.waitForTimeout(1_800)
    const fsEntered = await diagramState(frame)
    check('Full screen escapes the 372px overlay iframe',
      fsEntered.inFullscreen === true && fsEntered.frame.w > 900,
      `frame ${fsEntered.frame.w}x${fsEntered.frame.h}, fullscreenElement=${fsEntered.inFullscreen}`)

    // Shrink hard, then Fit: this is the exact gesture that used to do nothing.
    for (let i = 0; i < 3; i++) await ui.locator('c2pa-provenance-graph button[title="Zoom out"]').click()
    await page.waitForTimeout(500)
    const shrunk = await diagramState(frame)
    await ui.locator('c2pa-provenance-graph button[title="Reset view"]').click()
    await page.waitForTimeout(900)
    const fitted = await diagramState(frame)

    const fillW = fitted.content.w / fitted.frame.w
    const fillH = fitted.content.h / fitted.frame.h
    check('Fit changes the view in full screen', fitted.scale !== shrunk.scale,
      `scale ${shrunk.scale} -> ${fitted.scale}`)
    check('Fit actually fills the full-screen frame',
      Math.max(fillW, fillH) > 0.6,
      `content ${fitted.content.w}x${fitted.content.h} in frame ${fitted.frame.w}x${fitted.frame.h} (${(fillW * 100).toFixed(0)}% x ${(fillH * 100).toFixed(0)}%), scale=${fitted.scale}`)
    check('Fit is no longer capped at zoom 1 when the frame is large',
      fitted.scale > 1.0,
      `scale=${fitted.scale} (old build pinned this to exactly 1)`)
    await page.screenshot({ path: path.join(OUT, 'fullscreen-fit.png') })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)

    // ---- C. popup disclosure arrows ------------------------------------
    const popup = await ctx.newPage()
    const popupErrors = []
    popup.on('pageerror', (e) => popupErrors.push(`pageerror: ${e.message}`))
    popup.on('console', (m) => { if (m.type() === 'error') popupErrors.push(`console: ${m.text()}`) })
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' })
    await popup.waitForTimeout(2_000)

    // Feed it the real payloads this page produced.
    const entries = await sw.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({})
      const tab = tabs.find((t) => t.url === u)
      if (tab == null) return null
      globalThis.__e = []
      chrome.runtime.onMessage.addListener((m) => {
        if (m?.action === 'MSG_RESPONSE_C2PA_ENTRIES') globalThis.__e.push(m.data)
      })
      await chrome.tabs.sendMessage(tab.id, { action: 'MSG_REQUEST_C2PA_ENTRIES', data: null })
      await new Promise((r) => setTimeout(r, 15000))
      return globalThis.__e
    }, SIGNED_URL)
    for (const e of entries ?? []) {
      await sw.evaluate(async (d) => {
        await chrome.runtime.sendMessage({ action: 'MSG_RESPONSE_C2PA_ENTRIES', data: d }).catch(() => {})
      }, e)
    }
    await popup.waitForTimeout(1_500)

    const rows = await popup.locator('.v-row').count()
    check('popup lists the asset', rows > 0, `${rows} rows`)
    if (rows > 0) {
      const summary = popup.locator('.v-summary').first()
      const openState = async () => await popup.evaluate(() => {
        const b = document.querySelector('.v-summary')
        const d = document.querySelector('.v-details')
        return {
          aria: b?.getAttribute('aria-expanded'),
          isOpen: b?.classList.contains('is-open'),
          hidden: d?.hasAttribute('hidden'),
          height: d?.getBoundingClientRect().height ?? -1,
          display: d != null ? getComputedStyle(d).display : null,
          text: (d?.textContent ?? '').trim().slice(0, 60)
        }
      })
      const preClick = await openState()
      await summary.click()
      await popup.waitForTimeout(600)
      const postClick = await openState()
      check('clicking a row disclosure reveals its details',
        postClick.hidden === false && postClick.height > 0,
        `before=${JSON.stringify(preClick)} after=${JSON.stringify(postClick)}`)
      await popup.screenshot({ path: path.join(OUT, 'popup-expanded.png'), fullPage: true })
      check('popup logs no errors', popupErrors.length === 0, popupErrors.slice(0, 4).join(' | '))
    }

    // ---- D. what the extension reload actually throws -------------------
    const article = await ctx.newPage()
    const articleErrors = []
    article.on('pageerror', (e) => articleErrors.push(`pageerror: ${e.message}`))
    article.on('console', (m) => { if (m.type() === 'error') articleErrors.push(`console: ${m.text()}`) })
    await article.goto(ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await article.waitForTimeout(6_000)
    const beforeReload = articleErrors.length
    await sw.evaluate(() => { chrome.runtime.reload() }).catch(() => {})
    await article.waitForTimeout(6_000)
    // Poke the page so any dead runtime handle is actually exercised.
    await article.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      const i = document.querySelector('img')
      i?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      i?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    }).catch(() => {})
    await article.waitForTimeout(4_000)
    const newErrors = articleErrors.slice(beforeReload)
    console.log(`RELOAD ERRORS, ALL SOURCES (${newErrors.length}):`)
    for (const e of newErrors.slice(0, 12)) console.log(`   ${e}`)
    // A news page throws its own errors all day (ad tags, telemetry); only the
    // ones traceable to this extension are ours to answer for.
    const ours = newErrors.filter((e) =>
      /chrome-extension|extension context|c2pa|verifieddit/i.test(e))
    check('extension reload leaves no extension-attributable error in an open page',
      ours.length === 0, ours.slice(0, 3).join(' | ') || 'none')
  } finally {
    await ctx.close().catch(() => {})
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  console.log(`artifacts: ${OUT}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => { console.error('PROBE ERROR', err); process.exit(2) })
