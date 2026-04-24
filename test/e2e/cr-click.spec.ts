import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Regression gate for the CR-overlay click path (issue #65).
 *
 * The bug sequence this spec protects against:
 *  1. CrIcon.onClick used addEventListener — content-script-isolated-world
 *     listeners sometimes fail to fire on user click (verified rc9 & rc10,
 *     see CDP DOMDebugger.getEventListeners → []).
 *  2. Click handler routed MSG_OPEN_OVERLAY through MSG_FORWARD_TO_CONTENT,
 *     which is relayed via chrome.tabs.sendMessage (content scripts only);
 *     the overlay iframe is an extension-page, not a content script, so it
 *     never heard the message.
 *  3. public/iframe.html no longer contained <c2pa-overlay></c2pa-overlay>
 *     after the May-2025 rename commit, so overlayFrame's querySelector
 *     returned null and the overlay could not be populated.
 *
 * This spec loads the built dist/chrome directory (NOT the stale repo copy),
 * navigates to the deployed demo (or a local equivalent), clicks the CR icon
 * on the real-world CBC fixture, and asserts:
 *  - the icon's `onclick` property is a function (IDL handler attached)
 *  - clicking the icon emits the `CrIcon onclick fired` debug log
 *  - the c2paDialog iframe visibility transitions to `visible` within 2 s
 *  - the <c2pa-overlay> shadow DOM contains the expected signer text
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'https://www.verifieddit.com/demo'
const CBC_FIXTURE_URL_FRAGMENT = '07-edge-realworld-cbc-signed'

async function launchWithExtension (): Promise<{ ctx: BrowserContext, page: Page, consoleLogs: string[] }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-e2e-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 900 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })
  const consoleLogs: string[] = []
  const page = ctx.pages()[0] ?? await ctx.newPage()
  page.on('console', (msg) => { consoleLogs.push(msg.text()) })
  for (const sw of ctx.serviceWorkers()) sw.on('console', (msg) => { consoleLogs.push(`[SW] ${msg.text()}`) })
  ctx.on('serviceworker', (sw) => sw.on('console', (msg) => { consoleLogs.push(`[SW] ${msg.text()}`) }))
  return { ctx, page, consoleLogs }
}

test.describe('CR overlay click (issue #65)', () => {
  test('clicking the CR icon on the CBC fixture opens the overlay panel', async () => {
    test.setTimeout(120_000)
    expect(fs.existsSync(EXT_PATH), `dist/chrome must exist at ${EXT_PATH}`).toBe(true)
    expect(fs.existsSync(path.join(EXT_PATH, 'manifest.json'))).toBe(true)

    const { ctx, page, consoleLogs } = await launchWithExtension()
    try {
      // Give the SW a moment to register before we navigate
      await page.waitForTimeout(2_000)
      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })

      // Let inject.ts scan the page and for the SW to validate each image
      await page.waitForTimeout(6_000)

      // Scroll the CBC fixture into view
      await page.evaluate((fragment) => {
        const img = [...document.querySelectorAll('img')]
          .find(i => (i.currentSrc || i.src).includes(fragment))
        img?.scrollIntoView({ block: 'center' })
      }, CBC_FIXTURE_URL_FRAGMENT)
      await page.waitForTimeout(4_000)

      // Assert the CR icon exists, is near the image, and has an IDL onclick
      const pre = await page.evaluate((fragment) => {
        const imgs = [...document.querySelectorAll('img')]
        const cbc = imgs.find(i => (i.currentSrc || i.src).includes(fragment))
        if (cbc == null) return { found: false }
        const imgR = cbc.getBoundingClientRect()
        const icons = [...document.querySelectorAll('div[c2pa-icon]')]
        const near = icons.find((icon) => {
          const ir = icon.getBoundingClientRect()
          return Math.abs(ir.top - imgR.top) < 200 && Math.abs(ir.right - imgR.right) < 200
        })
        return {
          found: near != null,
          iconCount: icons.length,
          onclickType: near != null ? typeof (near as HTMLElement & { onclick: unknown }).onclick : 'none',
          iconTitle: near != null ? (near as HTMLElement).title : null
        }
      }, CBC_FIXTURE_URL_FRAGMENT)

      expect(pre.found, 'CR icon must exist near CBC fixture').toBe(true)
      // Cross-world view of el.onclick can come back as either 'function' or
      // 'object' depending on how Playwright bridges the content-script
      // isolated world back to the page world. Both are acceptable; we just
      // need it to be *not* the absent values ('none' / 'null' / 'undefined').
      expect(
        ['function', 'object'].includes(pre.onclickType ?? 'none'),
        `icon.onclick must be set (IDL handler, not addEventListener); got ${String(pre.onclickType)}`
      ).toBe(true)
      expect(pre.iconTitle).toContain(CBC_FIXTURE_URL_FRAGMENT)

      // Click via IDL — click() — exercises the onclick property directly
      await page.evaluate((fragment) => {
        const imgs = [...document.querySelectorAll('img')]
        const cbc = imgs.find(i => (i.currentSrc || i.src).includes(fragment))
        const imgR = cbc!.getBoundingClientRect()
        const icons = [...document.querySelectorAll('div[c2pa-icon]')]
        const near = icons.find((icon) => {
          const ir = icon.getBoundingClientRect()
          return Math.abs(ir.top - imgR.top) < 200 && Math.abs(ir.right - imgR.right) < 200
        })
          ; (near as HTMLElement).click()
      }, CBC_FIXTURE_URL_FRAGMENT)

      // Wait for overlay iframe to become visible (ResizeObserver + MSG_DISPLAY_C2PA_OVERLAY roundtrip)
      await page.waitForFunction(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog')
        return d != null && d.style.visibility === 'visible'
      }, { timeout: 5_000 })

      // Give the iframe a moment to populate via MSG_DISPLAY_C2PA_OVERLAY
      await page.waitForTimeout(2_000)

      // rc11.2 / #70 — the iframe must actually be visually visible, not a
      // 302×2 transparent slit hidden behind the page content. Assert:
      //   1. elementsFromPoint(centre) returns the iframe as top-of-stack.
      //   2. the iframe has non-trivial width AND height (≥ 180×120 px).
      //   3. the iframe rect overlaps the current viewport.
      const stacking = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog')
        if (d == null) return null
        const r = d.getBoundingClientRect()
        const cx = r.x + r.width / 2
        const cy = r.y + r.height / 2
        const top = document.elementsFromPoint(cx, cy)[0]
        return {
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          topIsIframe: top === d,
          topTag: top?.tagName,
          topCls: (top as HTMLElement | null)?.className?.toString().slice(0, 80),
          inViewport: r.width > 0 && r.height > 0 &&
            r.right > 0 && r.bottom > 0 &&
            r.left < window.innerWidth && r.top < window.innerHeight
        }
      })
      expect(stacking, 'overlay iframe must exist for stacking check').not.toBeNull()
      expect(stacking!.inViewport, `overlay iframe must land inside the viewport; got rect ${JSON.stringify(stacking!.rect)}`).toBe(true)
      expect(stacking!.rect.w, 'overlay width must be ≥ 180 px').toBeGreaterThanOrEqual(180)
      expect(stacking!.rect.h, `overlay height must be ≥ 120 px; got ${stacking!.rect.h} — probably <c2pa-overlay> host had display:inline or iframe had no min-height`).toBeGreaterThanOrEqual(120)
      expect(stacking!.topIsIframe, `overlay iframe must be topmost at its centre; got ${stacking!.topTag}.${stacking!.topCls} — probably a page element has a higher z-index or the overlay is transparent`).toBe(true)

      // Diagnostic logs we expect to have emitted
      expect(consoleLogs.some(l => l.includes('CrIcon onclick fired')), 'CrIcon click handler must fire').toBe(true)
      expect(consoleLogs.some(l => l.includes('overlayFrame: MSG_OPEN_OVERLAY received')), 'overlayFrame must hear MSG_OPEN_OVERLAY').toBe(true)

      // Read the overlay iframe's shadow DOM content (same-world via Playwright's frame access)
      const iframeFrame = page.frames().find(f => f.url().includes('iframe.html'))
      expect(iframeFrame, 'overlay iframe must be present in page frames').toBeTruthy()

      const panel = await iframeFrame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as unknown as { shadowRoot: ShadowRoot | null, c2paResult?: unknown, signer?: string, trustList?: string }
        return {
          hasOverlay: overlay != null,
          hasShadow: overlay?.shadowRoot != null,
          shadowText: (overlay?.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          signer: overlay?.signer ?? null,
          trustList: overlay?.trustList ?? null
        }
      })

      expect(panel.hasOverlay, '<c2pa-overlay> must exist in iframe body').toBe(true)
      expect(panel.hasShadow, '<c2pa-overlay>.shadowRoot must be populated').toBe(true)
      expect(panel.signer, 'signer must be parsed from the CBC manifest').toBe('CBC/Radio-Canada')
      expect(panel.trustList, 'trust list must read "unknown" for the CBC fixture').toBe('unknown')
      expect(panel.shadowText, 'overlay must show the signer').toContain('CBC/Radio-Canada')
      expect(panel.shadowText, 'overlay must indicate signer is unknown to current trust list').toMatch(/unknown/i)
    } finally {
      await ctx.close()
    }
  })
})
