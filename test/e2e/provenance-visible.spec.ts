import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Pixel-level gate for the provenance graph.
 *
 * provenance-graph.spec.ts proves the component exists, holds a graph and
 * paints .node cards. That is necessary and not sufficient: the diagram sits
 * inside `.collapsible-content { overflow: hidden; max-height: 0 }` and its
 * node cards are absolutely positioned, so every one of those assertions can
 * pass while the user sees an empty panel. This spec opens the section the way
 * a person does and measures rendered geometry.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = process.env.GRAPH_FIXTURE ?? '07-edge-realworld-cbc-signed'

async function launchWithExtension (): Promise<{ ctx: BrowserContext, page: Page }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-vis-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 1200 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  return { ctx, page }
}

test.describe('Provenance graph is actually VISIBLE (#140)', () => {
  test('opening the Provenance chain section shows a diagram with non-zero pixels', async () => {
    test.setTimeout(150_000)

    const { ctx, page } = await launchWithExtension()
    try {
      await page.waitForTimeout(2_000)
      const extSw = ctx.serviceWorkers()[0]
      if (extSw != null) {
        await extSw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })
      }

      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(6_000)

      await page.evaluate((f) => {
        const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
        img?.scrollIntoView({ block: 'center' })
      }, FIXTURE)
      await page.waitForTimeout(4_000)

      await page.evaluate((f) => {
        const target = [...document.querySelectorAll('img')].find(i => (i.currentSrc ?? i.src).includes(f))
        const imgR = target!.getBoundingClientRect()
        const near = [...document.querySelectorAll('div[c2pa-icon]')].find((icon) => {
          const ir = icon.getBoundingClientRect()
          return Math.abs(ir.top - imgR.top) < 200 && Math.abs(ir.right - imgR.right) < 200
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

      // Drive the UI the way a person does: View more, then click the
      // "Provenance chain" header. The collapsible is max-height:0 until then.
      await frame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const more = overlay?.shadowRoot?.querySelector('button.more') as HTMLButtonElement | null
        more?.click()
      })
      await page.waitForTimeout(800)

      const opened = await frame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const root = overlay?.shadowRoot
        const section = [...(root?.querySelectorAll('c2pa-collapsible') ?? [])].find((c) => {
          const h = c.querySelector('[slot="header"]')
          return (h?.textContent ?? '').trim() === 'Provenance chain'
        }) as (HTMLElement & { shadowRoot: ShadowRoot | null }) | undefined
        if (section == null) return false
        const header = section.shadowRoot?.querySelector('.collapsible-header') as HTMLElement | null
        header?.click()
        return true
      })
      expect(opened, 'a "Provenance chain" collapsible must exist to click').toBe(true)

      // Let the max-height transition (300ms) and any fit() settle.
      await page.waitForTimeout(1_500)

      const geom = await frame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const root = overlay?.shadowRoot
        const diagram = root?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const dRoot = diagram?.shadowRoot ?? null
        const frameEl = dRoot?.querySelector('.frame') as HTMLElement | null
        const nodes = [...(dRoot?.querySelectorAll('.node') ?? [])] as HTMLElement[]
        const content = root?.querySelector('c2pa-collapsible[open] , c2pa-collapsible') as HTMLElement | null
        const r = (el: HTMLElement | null): { w: number, h: number } =>
          el == null ? { w: -1, h: -1 } : { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }
        return {
          host: r(diagram),
          frame: r(frameEl),
          collapsible: r(content),
          nodeCount: nodes.length,
          nodeRects: nodes.map(n => r(n)),
          nodesWithZeroArea: nodes.filter(n => {
            const b = n.getBoundingClientRect()
            return b.width === 0 || b.height === 0
          }).length
        }
      })

      // eslint-disable-next-line no-console
      console.log('VISIBILITY GEOMETRY: ' + JSON.stringify(geom, null, 2))

      await page.screenshot({ path: 'test/e2e/results/provenance-visible.png' })

      expect(geom.host.h, `<c2pa-provenance-graph> host must have non-zero height; got ${geom.host.h}`).toBeGreaterThan(0)
      expect(geom.frame.h, `.frame must render at its 360px canvas height; got ${geom.frame.h}`).toBeGreaterThan(100)
      expect(geom.nodeCount, 'at least one node card must be laid out').toBeGreaterThanOrEqual(1)
      expect(geom.nodesWithZeroArea, `every node card must occupy real pixels; ${geom.nodesWithZeroArea} had zero area`).toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
