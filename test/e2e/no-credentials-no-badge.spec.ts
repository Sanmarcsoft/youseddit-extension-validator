import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Auto-scan must leave unsigned media alone.
 *
 * With auto-scan on, every image larger than 5x5 px got a badge: a neutral
 * camera while the check ran, upgraded to a grey camera with a red slash when
 * the file carried no C2PA manifest. On an ordinary page that is nearly every
 * image, so the extension looked like it was flagging the whole web. The
 * "checked, nothing found" badge exists for the right-click path, where the
 * user asked for the check and deserves an answer; auto-scan is not a request.
 *
 * This spec loads the built dist/chrome, turns auto-scan on, opens the demo
 * corpus and asserts:
 *  - the plain JPEG (fixture 06, no manifest) ends up with NO badge
 *  - the signed JPEG (fixture 01) still gets one, so the negative assertion
 *    is not passing because scanning never ran
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'https://www.verifieddit.com/demo'
const UNSIGNED_FRAGMENT = '06-no-c2pa-plain-jpeg'
// The real-world CBC fixture, the same control cr-click.spec.ts relies on.
// Fixtures 01 to 03 (signed by the public dev CA) showed no badge at all on
// the live demo during the 2026-09-03 run even while on screen; that is a
// separate observation recorded on #169 and not what this spec guards.
const SIGNED_FRAGMENT = '07-edge-realworld-cbc-signed'

async function launchWithExtension (): Promise<{ ctx: BrowserContext, page: Page }> {
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
  const page = ctx.pages()[0] ?? await ctx.newPage()
  return { ctx, page }
}

interface BadgeProbe {
  found: boolean
  status: string | null
  iconCount: number
}

async function badgeNear (page: Page, fragment: string): Promise<BadgeProbe> {
  return await page.evaluate((frag) => {
    const imgs = [...document.querySelectorAll('img')]
    const img = imgs.find(i => (i.currentSrc || i.src).includes(frag))
    if (img == null) return { found: false, status: 'image-missing', iconCount: -1 }
    const r = img.getBoundingClientRect()
    const icons = [...document.querySelectorAll('div[c2pa-icon]')]
    const near = icons.find((icon) => {
      const ir = icon.getBoundingClientRect()
      return Math.abs(ir.top - r.top) < 200 && Math.abs(ir.right - r.right) < 200
    })
    return {
      found: near != null,
      status: near != null ? (near as HTMLElement).title : null,
      iconCount: icons.length
    }
  }, fragment)
}

test.describe('auto-scan and unsigned media', () => {
  test('an image with no Content Credentials gets no badge; a signed one still does', async () => {
    test.setTimeout(120_000)
    expect(fs.existsSync(path.join(EXT_PATH, 'manifest.json')), `dist/chrome must exist at ${EXT_PATH}`).toBe(true)

    const { ctx, page } = await launchWithExtension()
    try {
      await page.waitForTimeout(2_000)
      const extSw = ctx.serviceWorkers()[0]
      expect(extSw, 'extension service worker must register').toBeTruthy()
      await extSw!.evaluate(() => chrome.storage.local.set({ autoScan: true }))

      await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(3_000)

      // Badges are torn down when media leaves the viewport (#162), so each
      // fixture is probed while it is the one on screen.
      const probe = async (frag: string): Promise<BadgeProbe> => {
        await page.evaluate((f) => {
          const img = [...document.querySelectorAll('img')].find(i => (i.currentSrc || i.src).includes(f))
          img?.scrollIntoView({ block: 'center' })
        }, frag)
        await page.waitForTimeout(6_000)
        return await badgeNear(page, frag)
      }

      const signed = await probe(SIGNED_FRAGMENT)
      const unsigned = await probe(UNSIGNED_FRAGMENT)

      expect(signed.found, `signed fixture must carry a badge (icons on page: ${signed.iconCount})`).toBe(true)
      expect(unsigned.found, `unsigned fixture must carry no badge, got title ${String(unsigned.status)}`).toBe(false)
    } finally {
      await ctx.close()
    }
  })
})
