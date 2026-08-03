import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * The extension's only route from "I verify other people's content" to "I could
 * sign my own".
 *
 * Before this, trusteddit.com appeared six times in source and zero times in
 * the interface. This asserts the call to action is actually rendered, points
 * at the right host, and carries the surface tag the receiving privacy policies
 * disclose — verifieddit.com section 2.8, trusteddit.com section 2.5.
 *
 * It also pins the privacy boundary: the tag names a SURFACE, never a user, a
 * device, an asset or a session. If someone later widens it, this fails.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = '07-edge-realworld-cbc-signed'

async function launch (): Promise<{ ctx: BrowserContext, page: Page, extensionId: string }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-cta-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 1000 },
    args: ['--headless=new', `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--no-sandbox']
  })
  let [sw] = ctx.serviceWorkers()
  if (sw == null) sw = await ctx.waitForEvent('serviceworker', { timeout: 30_000 })
  return { ctx, page: ctx.pages()[0] ?? await ctx.newPage(), extensionId: new URL(sw.url()).host }
}

/** Only a surface name may appear in the tag. */
const ALLOWED_SOURCES = new Set([
  'extension-panel',
  'extension-popup',
  'extension-options',
  'extension-context-menu',
  'extension-release-notes'
])

test.describe('Trusteddit call to action and click-through tagging', () => {
  test('the overlay panel offers a tagged Trusteddit link', async () => {
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

      const cta = await frame!.evaluate(() => {
        const root = (document.querySelector('c2pa-overlay') as HTMLElement & { shadowRoot: ShadowRoot | null })?.shadowRoot
        const a = root?.querySelector('a.sign-cta') as HTMLAnchorElement | null
        if (a == null) return null
        const r = a.getBoundingClientRect()
        return {
          href: a.href,
          text: (a.textContent ?? '').trim(),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
          visible: r.width > 0 && r.height > 0
        }
      })

      // eslint-disable-next-line no-console
      console.log('OVERLAY CTA: ' + JSON.stringify(cta))

      expect(cta, 'overlay must render a Trusteddit call to action').not.toBeNull()
      const url = new URL(cta!.href)
      expect(url.hostname, 'CTA must point at trusteddit.com').toBe('www.trusteddit.com')
      expect(url.protocol, 'CTA must be https').toBe('https:')
      expect(url.searchParams.get('src'), 'CTA must carry the panel surface tag').toBe('extension-panel')
      expect(cta!.rel, 'external link must set noopener').toContain('noopener')
      expect(cta!.visible, 'CTA must occupy real pixels').toBe(true)

      // Privacy boundary: nothing but a surface name may ride along.
      const params = [...url.searchParams.keys()]
      expect(params, 'the only query parameter may be src').toEqual(['src'])
      expect(ALLOWED_SOURCES.has(url.searchParams.get('src') ?? ''), 'src must be a known surface name').toBe(true)
    } finally {
      await ctx.close()
    }
  })

  test('the popup Options tab offers a tagged Trusteddit link', async () => {
    test.setTimeout(120_000)

    const { ctx, extensionId } = await launch()
    try {
      const popup = await ctx.newPage()
      await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' })
      await popup.waitForTimeout(1_200)

      const link = await popup.evaluate(() => {
        const a = document.getElementById('trusteddit-link') as HTMLAnchorElement | null
        return a == null ? null : { href: a.href, text: (a.textContent ?? '').trim(), rel: a.getAttribute('rel') }
      })
      // eslint-disable-next-line no-console
      console.log('POPUP CTA: ' + JSON.stringify(link))

      expect(link, 'popup must render a Trusteddit call to action').not.toBeNull()
      const url = new URL(link!.href)
      expect(url.hostname).toBe('www.trusteddit.com')
      expect(url.searchParams.get('src'), 'popup CTA must carry the options surface tag').toBe('extension-options')
      expect([...url.searchParams.keys()], 'the only query parameter may be src').toEqual(['src'])
      expect(link!.rel).toContain('noopener')
    } finally {
      await ctx.close()
    }
  })
})
