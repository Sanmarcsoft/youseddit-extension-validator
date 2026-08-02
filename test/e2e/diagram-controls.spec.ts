import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Every control in the diagram toolbar must actually respond to a click.
 *
 * All four were dead (#141). `@pointerdown` on `.frame` calls
 * setPointerCapture, which redirects the rest of the gesture to the frame — so
 * pointerup landed on the frame rather than the pressed button and the browser
 * fired no `click` at all. The guard excluded `.node` but not `.controls`.
 * Dragging and wheel-zoom kept working, which is why it read as "the Full
 * screen button is broken" rather than "the toolbar receives no clicks".
 *
 * This asserts observable state changes, not handler invocation, so it stays
 * honest if the wiring is refactored.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = '07-edge-realworld-cbc-signed'

async function launch (): Promise<{ ctx: BrowserContext, page: Page }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-ctl-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 1000 },
    args: ['--headless=new', `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--no-sandbox']
  })
  return { ctx, page: ctx.pages()[0] ?? await ctx.newPage() }
}

/** Current transform on the diagram's pan/zoom viewport. */
async function transformOf (frame: import('@playwright/test').Frame): Promise<string> {
  return await frame.evaluate(() => {
    const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
    const vp = d?.shadowRoot?.querySelector('.viewport') as HTMLElement | null
    return vp?.getAttribute('style') ?? ''
  })
}

test.describe('diagram toolbar controls (#141)', () => {
  test('zoom out, Fit, zoom in and Full screen all respond to a click', async () => {
    test.setTimeout(180_000)

    const { ctx, page } = await launch()
    try {
      await page.waitForTimeout(2_000)
      const sw = ctx.serviceWorkers()[0]
      if (sw != null) await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })

      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(6_000)
      await page.evaluate((f) => {
        const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
        img?.scrollIntoView({ block: 'center' })
      }, FIXTURE)
      await page.waitForTimeout(3_000)
      await page.evaluate((f) => {
        const t = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
        const r = t!.getBoundingClientRect()
        const near = [...document.querySelectorAll('div[c2pa-icon]')].find((icon) => {
          const ir = icon.getBoundingClientRect()
          return Math.abs(ir.top - r.top) < 200 && Math.abs(ir.right - r.right) < 200
        })
        ;(near as HTMLElement).click()
      }, FIXTURE)
      await page.waitForFunction(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog')
        return d != null && d.style.visibility === 'visible'
      }, { timeout: 10_000 })
      await page.waitForTimeout(2_000)

      const frame = page.frames().find(f => f.url().includes('iframe.html'))
      expect(frame, 'overlay iframe must be present').toBeTruthy()

      await frame!.evaluate(() => {
        const o = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        ;(o?.shadowRoot?.querySelector('button.more') as HTMLButtonElement | null)?.click()
      })
      await page.waitForTimeout(700)
      await frame!.evaluate(() => {
        const o = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const s = [...(o?.shadowRoot?.querySelectorAll('c2pa-collapsible') ?? [])].find((c) => {
          return (c.querySelector('[slot="header"]')?.textContent ?? '').trim() === 'Provenance chain'
        }) as (HTMLElement & { shadowRoot: ShadowRoot | null }) | undefined
        ;(s?.shadowRoot?.querySelector('.collapsible-header') as HTMLElement | null)?.click()
      })
      await page.waitForTimeout(1_500)

      const ui = page.frameLocator('iframe.c2paDialog')
      const results: Record<string, boolean> = {}

      const atStart = await transformOf(frame!)
      await ui.locator('button[title="Zoom in"]').click()
      await page.waitForTimeout(500)
      const afterIn = await transformOf(frame!)
      results.zoomIn = afterIn !== atStart

      await ui.locator('button[title="Zoom out"]').click()
      await page.waitForTimeout(500)
      const afterOut = await transformOf(frame!)
      results.zoomOut = afterOut !== afterIn

      // Push the view somewhere Fit must visibly correct.
      await ui.locator('button[title="Zoom in"]').click()
      await ui.locator('button[title="Zoom in"]').click()
      await page.waitForTimeout(500)
      const beforeFit = await transformOf(frame!)
      await ui.locator('button[title="Reset view"]').click()
      await page.waitForTimeout(700)
      const afterFit = await transformOf(frame!)
      results.fit = afterFit !== beforeFit

      await ui.locator('button[title="Full screen"]').click()
      await page.waitForTimeout(1_500)
      const fs = await frame!.evaluate(() => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const fr = d?.shadowRoot?.querySelector('.frame') as HTMLElement | null
        return { w: Math.round(fr?.getBoundingClientRect().width ?? -1), inFs: document.fullscreenElement != null }
      })
      results.fullScreen = fs.inFs && fs.w > 372

      // --- and again INSIDE full screen, which is a different hit-testing
      // context: the frame is promoted to the browser's top layer. ---
      const fsAutoFit = await transformOf(frame!)
      results.autoFitOnEnter = fsAutoFit !== afterFit

      const fsIn = await transformOf(frame!)
      await ui.locator('button[title="Zoom in"]').click()
      await page.waitForTimeout(500)
      results.fsZoomIn = (await transformOf(frame!)) !== fsIn

      const fsOut = await transformOf(frame!)
      await ui.locator('button[title="Zoom out"]').click()
      await page.waitForTimeout(500)
      results.fsZoomOut = (await transformOf(frame!)) !== fsOut

      await ui.locator('button[title="Zoom in"]').click()
      await ui.locator('button[title="Zoom in"]').click()
      await page.waitForTimeout(500)
      const fsBeforeFit = await transformOf(frame!)
      await ui.locator('button[title="Reset view"]').click()
      await page.waitForTimeout(700)
      results.fsFit = (await transformOf(frame!)) !== fsBeforeFit

      // eslint-disable-next-line no-console
      console.log('CONTROL RESULTS: ' + JSON.stringify({ ...results, fsWidth: fs.w }))
      await page.screenshot({ path: 'test/e2e/results/diagram-controls.png' })

      expect(results.zoomIn, 'Zoom in must change the viewport transform').toBe(true)
      expect(results.zoomOut, 'Zoom out must change the viewport transform').toBe(true)
      expect(results.fit, 'Fit must change the viewport transform').toBe(true)
      expect(results.fullScreen, `Full screen must escape the 372px iframe; frame was ${fs.w}px`).toBe(true)
    } finally {
      await ctx.close()
    }
  })
})
