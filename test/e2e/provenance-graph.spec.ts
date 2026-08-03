import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * End-to-end gate for the interactive provenance graph (#140).
 *
 * cr-click.spec.ts still asserts the DELETED ingredient diagram inside a
 * section called "Ingredients". That section is now "Provenance chain" and the
 * flat SVG was replaced by <c2pa-provenance-graph>, so nothing in the suite
 * ever rendered the new component in a browser. This spec closes that hole:
 * it drives the real click path — CR icon → overlay → View more → Provenance
 * chain — and asserts the component both received a graph and painted nodes.
 *
 * The distinction matters because webComponents.ts falls back to the old
 * ingredient grid whenever `provenanceGraph` is null or empty. A silent
 * fallback looks like a working panel with a missing feature, which is exactly
 * the failure the user reported ("no provenance chain appears").
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = process.env.GRAPH_FIXTURE ?? '07-edge-realworld-cbc-signed'

async function launchWithExtension (): Promise<{ ctx: BrowserContext, page: Page, consoleLogs: string[] }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-graph-'))
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

test.describe('Provenance graph renders in the overlay (#140)', () => {
  test('CR icon → overlay → Provenance chain shows <c2pa-provenance-graph> with painted nodes', async () => {
    test.setTimeout(150_000)

    expect(fs.existsSync(path.join(EXT_PATH, 'manifest.json')), `built extension must exist at ${EXT_PATH}`).toBe(true)

    const { ctx, page, consoleLogs } = await launchWithExtension()
    try {
      await page.waitForTimeout(2_000)

      const extSw = ctx.serviceWorkers()[0]
      if (extSw != null) {
        await extSw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) })
      }

      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(6_000)

      await page.evaluate((fragment) => {
        const img = [...document.querySelectorAll('img')]
          .find(i => (i.currentSrc ?? i.src).includes(fragment))
        img?.scrollIntoView({ block: 'center' })
      }, FIXTURE)
      await page.waitForTimeout(4_000)

      // The CR icon must exist before any diagram question is meaningful.
      const iconFound = await page.evaluate((fragment) => {
        const target = [...document.querySelectorAll('img')]
          .find(i => (i.currentSrc ?? i.src).includes(fragment))
        if (target == null) return { found: false, iconCount: 0 }
        const imgR = target.getBoundingClientRect()
        const icons = [...document.querySelectorAll('div[c2pa-icon]')]
        const near = icons.find((icon) => {
          const ir = icon.getBoundingClientRect()
          return Math.abs(ir.top - imgR.top) < 200 && Math.abs(ir.right - imgR.right) < 200
        })
        return { found: near != null, iconCount: icons.length }
      }, FIXTURE)

      expect(iconFound.found, `CR icon must exist near ${FIXTURE}; total icons on page = ${iconFound.iconCount}`).toBe(true)

      await page.evaluate((fragment) => {
        const target = [...document.querySelectorAll('img')]
          .find(i => (i.currentSrc ?? i.src).includes(fragment))
        const imgR = target!.getBoundingClientRect()
        const icons = [...document.querySelectorAll('div[c2pa-icon]')]
        const near = icons.find((icon) => {
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

      const iframeFrame = page.frames().find(f => f.url().includes('iframe.html'))
      expect(iframeFrame, 'overlay iframe must be present in page frames').toBeTruthy()

      // Expand the additional-info block so the section is on screen for the
      // screenshot. The component tree exists either way — the collapse is
      // presentational — so the assertions below do not depend on it.
      await iframeFrame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const more = overlay?.shadowRoot?.querySelector('button.more') as HTMLButtonElement | null
        more?.click()
      })
      await page.waitForTimeout(1_500)

      const audit = await iframeFrame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const root = overlay?.shadowRoot ?? null

        const headers = [...(root?.querySelectorAll('c2pa-collapsible') ?? [])].map((c) => {
          const header = c.querySelector('[slot="header"]')
          return (header?.textContent ?? '').trim()
        })

        const diagram = root?.querySelector('c2pa-provenance-graph') as (HTMLElement & {
          graph?: { nodes?: unknown[], edges?: unknown[] }
          shadowRoot: ShadowRoot | null
        }) | null

        // The documented fallback: grid instead of diagram means the graph was
        // null or empty upstream in c2pa.ts.
        const fellBackToGrid = root?.querySelector('c2pa-grid-display') != null && diagram == null

        const dRoot = diagram?.shadowRoot ?? null
        return {
          sectionHeaders: headers,
          hasProvenanceSection: headers.includes('Provenance chain'),
          hasDiagramElement: diagram != null,
          graphNodeCount: diagram?.graph?.nodes?.length ?? -1,
          graphEdgeCount: diagram?.graph?.edges?.length ?? -1,
          paintedNodeCount: dRoot?.querySelectorAll('.node').length ?? -1,
          paintedEdgeCount: dRoot?.querySelectorAll('svg path, svg line').length ?? -1,
          hasViewport: dRoot?.querySelector('.viewport') != null,
          fellBackToGrid
        }
      })

      // eslint-disable-next-line no-console
      console.log('PROVENANCE AUDIT: ' + JSON.stringify(audit, null, 2))

      await page.screenshot({ path: 'test/e2e/results/provenance-graph.png', fullPage: false })

      expect(audit.hasProvenanceSection,
        `overlay must carry a "Provenance chain" section; found sections: ${JSON.stringify(audit.sectionHeaders)}`).toBe(true)
      expect(audit.fellBackToGrid,
        'overlay must NOT fall back to the flat ingredient grid — that means provenanceGraph was null or empty in c2pa.ts').toBe(false)
      expect(audit.hasDiagramElement,
        '<c2pa-provenance-graph> must be present in the overlay shadow DOM').toBe(true)
      expect(audit.graphNodeCount,
        'the component must have received a graph with at least one node').toBeGreaterThanOrEqual(1)
      expect(audit.hasViewport,
        'the diagram must render its pan/zoom .viewport container').toBe(true)
      expect(audit.paintedNodeCount,
        `the diagram must paint at least one .node card; graph carried ${audit.graphNodeCount} nodes`).toBeGreaterThanOrEqual(1)
      expect(audit.paintedNodeCount,
        'every graph node must paint a card').toBe(audit.graphNodeCount)
    } finally {
      // eslint-disable-next-line no-console
      console.log('CONSOLE TAIL:\n' + consoleLogs.slice(-40).join('\n'))
      await ctx.close()
    }
  })
})
