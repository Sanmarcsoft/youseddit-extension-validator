import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Does the diagram's "Full screen" control actually reach full screen?
 *
 * The control used to be CSS-only (`position: fixed; height: 100vh`), which
 * inside a 372px extension iframe resolves against the IFRAME's viewport — it
 * "worked" and was invisible. This spec measures the thing that matters: after
 * the click, is the diagram frame larger than the iframe that contains it.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = '07-edge-realworld-cbc-signed'
const HEADED = process.env.HEADED === '1'

async function launch (): Promise<{ ctx: BrowserContext, page: Page }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-fs-'))
  const args = [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ]
  if (!HEADED) args.unshift('--headless=new')
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 1000 },
    args
  })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  return { ctx, page }
}

test.describe('diagram full screen (#141)', () => {
  test('Full screen escapes the overlay iframe', async () => {
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

      // Does the host page actually delegate the permission to our iframe?
      const iframeAttrs = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog') as HTMLIFrameElement | undefined
        return {
          allow: d?.getAttribute('allow') ?? null,
          allowFullscreenAttr: d?.hasAttribute('allowfullscreen') ?? false,
          width: Math.round(d?.getBoundingClientRect().width ?? -1),
          height: Math.round(d?.getBoundingClientRect().height ?? -1)
        }
      })

      const frame = page.frames().find(f => f.url().includes('iframe.html'))
      expect(frame, 'overlay iframe must be present').toBeTruthy()

      // Open View more + the Provenance chain section.
      await frame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        ;(overlay?.shadowRoot?.querySelector('button.more') as HTMLButtonElement | null)?.click()
      })
      await page.waitForTimeout(700)
      await frame!.evaluate(() => {
        const overlay = document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null }
        const section = [...(overlay?.shadowRoot?.querySelectorAll('c2pa-collapsible') ?? [])].find((c) => {
          const h = c.querySelector('[slot="header"]')
          return (h?.textContent ?? '').trim() === 'Provenance chain'
        }) as (HTMLElement & { shadowRoot: ShadowRoot | null }) | undefined
        ;(section?.shadowRoot?.querySelector('.collapsible-header') as HTMLElement | null)?.click()
      })
      await page.waitForTimeout(1_200)

      const before = await frame!.evaluate(() => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const fr = d?.shadowRoot?.querySelector('.frame') as HTMLElement | null
        const r = fr?.getBoundingClientRect()
        return { w: Math.round(r?.width ?? -1), h: Math.round(r?.height ?? -1), fsElement: document.fullscreenElement != null }
      })

      // Click Full screen the way a user does — a real trusted-ish gesture via
      // Playwright's input, not el.click(), because requestFullscreen requires
      // transient user activation.
      // Ground truth on what controls exist, and what the API says when asked.
      const probe = await frame!.evaluate(async () => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const buttons = [...(d?.shadowRoot?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
        const fr = d?.shadowRoot?.querySelector('.frame') as HTMLElement | null
        let rejection: string | null = null
        try {
          await fr?.requestFullscreen()
        } catch (e) {
          rejection = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        }
        return {
          buttonLabels: buttons.map(b => (b.textContent ?? '').trim()),
          buttonTitles: buttons.map(b => b.getAttribute('title')),
          directRequestRejection: rejection,
          fsAfterDirect: document.fullscreenElement != null
        }
      })
      // eslint-disable-next-line no-console
      console.log('CONTROL PROBE: ' + JSON.stringify(probe, null, 2))

      // Leave the fullscreen the probe entered, so the button click is measured
      // from a clean state.
      await frame!.evaluate(async () => { if (document.fullscreenElement != null) await document.exitFullscreen() })
      await page.waitForTimeout(800)

      // Playwright's >>> does not pierce overlay-shadow -> slotted light DOM ->
      // diagram-shadow, so locate the button geometrically and click it with
      // real mouse input. requestFullscreen needs transient user activation,
      // which only a genuine input event provides — el.click() would not prove
      // the user's path works.
      const box = await frame!.evaluate(() => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const b = [...(d?.shadowRoot?.querySelectorAll('button') ?? [])]
          .find((x) => (x.getAttribute('title') ?? '').includes('Full screen')) as HTMLElement | undefined
        if (b == null) return null
        b.scrollIntoView({ block: 'center' })
        const r = b.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      const iframeBox = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog') as HTMLIFrameElement | undefined
        const r = d?.getBoundingClientRect()
        return r == null ? null : { x: r.x, y: r.y }
      })
      // Instrument: did the click land on the button at all, and if the handler
      // ran, what did requestFullscreen say?
      await frame!.evaluate(() => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const b = [...(d?.shadowRoot?.querySelectorAll('button') ?? [])]
          .find((x) => (x.getAttribute('title') ?? '').includes('Full screen')) as HTMLElement | undefined
        const w = window as unknown as { __fsProbe: Record<string, unknown> }
        w.__fsProbe = { landed: false, isTrusted: null, err: null }
        b?.addEventListener('click', (ev) => {
          w.__fsProbe.landed = true
          w.__fsProbe.isTrusted = ev.isTrusted
          const fr = d?.shadowRoot?.querySelector('.frame') as HTMLElement | null
          try {
            const p = fr?.requestFullscreen()
            if (p != null) p.then(() => { w.__fsProbe.err = 'resolved' }).catch((e: Error) => { w.__fsProbe.err = `${e.name}: ${e.message}` })
          } catch (e) {
            w.__fsProbe.err = e instanceof Error ? `sync ${e.name}: ${e.message}` : String(e)
          }
        }, { capture: true })
      })

      const geo = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find(f => f.className === 'c2paDialog') as HTMLIFrameElement | undefined
        const r = d?.getBoundingClientRect()
        return r == null ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight }
      })
      const hit = (box != null && iframeBox != null)
        ? await page.evaluate(({ px, py }) => {
            const el = document.elementFromPoint(px, py)
            return { tag: el?.tagName ?? null, cls: (el as HTMLElement | null)?.className?.toString().slice(0, 60) ?? null }
          }, { px: iframeBox.x + box.x, py: iframeBox.y + box.y })
        : null
      // eslint-disable-next-line no-console
      console.log('GEOMETRY: ' + JSON.stringify({ buttonInIframe: box, iframeBox, iframeRect: geo, pointHits: hit }))

      const inside = await frame!.evaluate(({ bx, by }) => {
        const top = document.elementFromPoint(bx, by)
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const b = [...(d?.shadowRoot?.querySelectorAll('button') ?? [])]
          .find((x) => (x.getAttribute('title') ?? '').includes('Full screen')) as HTMLElement | undefined
        const br = b?.getBoundingClientRect()
        // What is clipping it? Walk up from the diagram host.
        const clippers: string[] = []
        let n: HTMLElement | null = d as HTMLElement | null
        while (n != null) {
          const cs = getComputedStyle(n)
          if (cs.overflow !== 'visible' || cs.maxHeight !== 'none') {
            clippers.push(`${n.tagName.toLowerCase()}.${n.className.toString().slice(0,28)} overflow=${cs.overflow} maxH=${cs.maxHeight} h=${Math.round(n.getBoundingClientRect().height)}`)
          }
          n = (n.parentElement ?? (n.getRootNode() as ShadowRoot).host as HTMLElement | undefined) ?? null
          if (n?.tagName === 'BODY') break
        }
        return {
          topAtPoint: top == null ? null : `${top.tagName.toLowerCase()}.${(top as HTMLElement).className?.toString().slice(0,40)}`,
          buttonRect: br == null ? null : { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) },
          iframeViewport: { w: window.innerWidth, h: window.innerHeight },
          clippers
        }
      }, { bx: box?.x ?? 0, by: box?.y ?? 0 })
      // eslint-disable-next-line no-console
      console.log('INSIDE IFRAME: ' + JSON.stringify(inside, null, 2))

      // Playwright's CSS engine pierces open shadow roots natively, and
      // frameLocator handles the iframe hop. This is a real trusted click,
      // which requestFullscreen requires.
      const fsBtn = page.frameLocator('iframe.c2paDialog').locator('button[title="Full screen"]')
      const btnCount = await fsBtn.count()
      if (btnCount > 0) {
        await fsBtn.first().scrollIntoViewIfNeeded().catch(() => {})
        await fsBtn.first().click()
      }
      await page.waitForTimeout(1_800)

      const clickProbe = await frame!.evaluate(() => (window as unknown as { __fsProbe: unknown }).__fsProbe)
      // eslint-disable-next-line no-console
      console.log('CLICK PROBE: ' + JSON.stringify(clickProbe))

      const after = await frame!.evaluate(() => {
        const d = document.querySelector('c2pa-overlay')?.shadowRoot?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
        const fr = d?.shadowRoot?.querySelector('.frame') as HTMLElement | null
        const r = fr?.getBoundingClientRect()
        return {
          w: Math.round(r?.width ?? -1),
          h: Math.round(r?.height ?? -1),
          fsElement: document.fullscreenElement != null,
          fsEnabled: document.fullscreenEnabled,
          hasClass: fr?.classList.contains('fullscreen') ?? false
        }
      })

      // eslint-disable-next-line no-console
      console.log('FULLSCREEN AUDIT: ' + JSON.stringify({ iframeAttrs, buttons: btnCount, before, after }, null, 2))

      await page.screenshot({ path: 'test/e2e/results/fullscreen.png' })

      expect(iframeAttrs.allow, 'iframe must delegate the fullscreen permission').toContain('fullscreen')
      expect(btnCount, 'a Full screen button must exist to click').toBeGreaterThanOrEqual(1)
      expect(after.fsEnabled, 'document.fullscreenEnabled must be true inside the overlay iframe').toBe(true)
      expect(after.fsElement, 'clicking Full screen must put the document into fullscreen').toBe(true)
      expect(after.w, `frame must grow past the ${iframeAttrs.width}px iframe; was ${before.w} -> ${after.w}`).toBeGreaterThan(iframeAttrs.width)
    } finally {
      await ctx.close()
    }
  })
})
