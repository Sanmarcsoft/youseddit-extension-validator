import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/** Capture the popup so the restyled tab bar + in-popup diagram are reviewable. */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'

test.describe('popup visual capture', () => {
  test('validation tab shows the provenance diagram', async () => {
    test.setTimeout(150_000)

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-popup-'))
    const ctx: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chromium',
      viewport: { width: 1400, height: 1000 },
      args: ['--headless=new', `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--no-sandbox']
    })
    try {
      await new Promise((r) => setTimeout(r, 2000))
      let [sw] = ctx.serviceWorkers()
      if (sw == null) sw = await ctx.waitForEvent('serviceworker')
      const extensionId = new URL(sw.url()).host
      await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })

      // Popup is a live feed, so it must be open BEFORE the page is scanned.
      const popup = await ctx.newPage()
      await popup.setViewportSize({ width: 400, height: 900 })
      await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' })
      await popup.waitForTimeout(1000)

      const page = await ctx.newPage()
      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(10_000)

      await popup.bringToFront()
      await popup.waitForTimeout(1500)

      const audit = await popup.evaluate(() => {
        const rows = document.querySelectorAll('#validationEntries > *')
        const diagrams = document.querySelectorAll('c2pa-provenance-graph')
        const painted = [...diagrams].map((d) => (d as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot?.querySelectorAll('.node').length ?? -1)
        const firstTab = document.querySelector('.tab') as HTMLElement | null
        const bar = document.querySelector('.tab-bar') as HTMLElement | null
        const cs = firstTab != null ? getComputedStyle(firstTab) : null
        return {
          rowCount: rows.length,
          diagramCount: diagrams.length,
          paintedNodes: painted,
          tabBarPresent: bar != null,
          tabBg: cs?.backgroundColor ?? null,
          tabColor: cs?.color ?? null
        }
      })
      // eslint-disable-next-line no-console
      console.log('POPUP AUDIT: ' + JSON.stringify(audit, null, 2))

      // Expand the first row so the diagram is on screen for the capture.
      await popup.evaluate(() => {
        const btn = document.querySelector('#validationEntries .v-summary') as HTMLButtonElement | null
        btn?.click()
      })
      await popup.waitForTimeout(1500)
      await popup.screenshot({ path: 'test/e2e/results/popup.png', fullPage: true })

      // The popup resolves its data with chrome.tabs.query({active:true,
      // currentWindow:true}). Opened as a page it IS the active tab, so it asks
      // itself for entries and gets none — the live-feed limitation tracked in
      // #50, not a defect in this wiring. What IS verifiable here, and what the
      // tree-shaking bug (#140) would have broken silently, is whether the
      // component is registered in the POPUP bundle and paints when given a
      // graph. Feed it one directly.
      const synthetic = await popup.evaluate(async () => {
        const slot = document.createElement('div')
        slot.className = 'popup-provenance'
        document.getElementById('validationEntries')?.appendChild(slot)
        const el = document.createElement('c2pa-provenance-graph') as HTMLElement & { graph?: unknown, shadowRoot: ShadowRoot | null }
        el.graph = {
          nodes: [
            { id: 'a', kind: 'origin', label: 'Origin capture', validationState: 'valid', isActive: false },
            { id: 'b', kind: 'current', label: 'This asset', validationState: 'current', isActive: true }
          ],
          edges: [{ id: 'e', source: 'a', target: 'b' }]
        }
        slot.appendChild(el)
        await new Promise((r) => setTimeout(r, 900))
        const upgraded = el.shadowRoot != null
        const r = el.getBoundingClientRect()
        return {
          upgraded,
          painted: el.shadowRoot?.querySelectorAll('.node').length ?? -1,
          hasViewport: el.shadowRoot?.querySelector('.viewport') != null,
          width: Math.round(r.width),
          height: Math.round(r.height)
        }
      })
      // eslint-disable-next-line no-console
      console.log('POPUP COMPONENT: ' + JSON.stringify(synthetic))
      await popup.screenshot({ path: 'test/e2e/results/popup.png', fullPage: true })

      expect(audit.tabBarPresent, '.tab-bar container must exist').toBe(true)
      expect(synthetic.upgraded, '<c2pa-provenance-graph> must be REGISTERED in the popup bundle (shadowRoot present)').toBe(true)
      expect(synthetic.painted, 'diagram must paint one card per graph node in the popup').toBe(2)
      expect(synthetic.hasViewport, 'diagram must render its pan/zoom viewport in the popup').toBe(true)
      expect(synthetic.height, 'diagram must occupy real height in the popup').toBeGreaterThan(100)
    } finally {
      await ctx.close()
    }
  })
})
