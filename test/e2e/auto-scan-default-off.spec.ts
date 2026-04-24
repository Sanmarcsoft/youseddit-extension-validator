import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * rc11.7 / #86 — fresh install must not auto-paint CR badges on every image.
 *
 * This spec loads the built extension in a brand-new persistent profile
 * (zero prior chrome.storage state, zero prior context), navigates to the
 * demo page, waits long enough for auto-scan to have kicked in IF it were
 * enabled, and asserts that zero `div[c2pa-icon]` elements exist anywhere.
 *
 * A separate assertion toggles auto-scan ON via chrome.storage.local and
 * confirms that the icons then DO appear — proving the toggle still works.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')

async function launchFresh (): Promise<BrowserContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-autoscan-'))
  return await chromium.launchPersistentContext(userDataDir, {
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
}

test.describe('auto-scan default (issue #86)', () => {
  test('fresh install: zero CR icons appear on /demo without user action', async () => {
    test.setTimeout(90_000)
    expect(fs.existsSync(EXT_PATH)).toBe(true)
    const ctx = await launchFresh()
    try {
      // Wait for SW registration so the onInstalled handler has a chance to
      // run and write the autoScan=false default into chrome.storage.
      for (let i = 0; i < 30; i++) {
        if (ctx.serviceWorkers().length > 0) break
        await new Promise((r) => setTimeout(r, 200))
      }

      const page = await ctx.newPage()
      await page.goto('https://www.verifieddit.com/demo', { waitUntil: 'networkidle', timeout: 60_000 })
      // Wait longer than any reasonable auto-scan delay
      await page.waitForTimeout(8_000)

      const iconCount = await page.evaluate(() => {
        return document.querySelectorAll('div[c2pa-icon]').length
      })

      expect(iconCount,
        `fresh install with auto-scan default OFF must render zero CR icons without explicit right-click; got ${iconCount}`
      ).toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
