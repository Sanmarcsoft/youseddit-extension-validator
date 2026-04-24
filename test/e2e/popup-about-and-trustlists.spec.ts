import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * E2E gate for rc11.1 (issue #68) — About-tab RC visibility, What's new
 * section, and popup Trust Lists read-only tab.
 */

const EXT_PATH = path.resolve(__dirname, '..', '..', 'dist', 'chrome')

async function launchWithExtension (): Promise<BrowserContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-popup-'))
  return await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 800, height: 900 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })
}

async function getExtensionId (ctx: BrowserContext): Promise<string> {
  // Wait for the service worker to register — its URL carries the extension id
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers()
    if (workers.length > 0) {
      const match = workers[0].url().match(/chrome-extension:\/\/([a-p]+)\//)
      if (match != null) return match[1]
    }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('Could not resolve extension id from service worker URL')
}

test.describe('popup About + Trust Lists (issue #68)', () => {
  test('About tab surfaces the RC tag prominently and lists "What\'s new"', async () => {
    test.setTimeout(60_000)
    expect(fs.existsSync(EXT_PATH)).toBe(true)
    const ctx = await launchWithExtension()
    try {
      const extId = await getExtensionId(ctx)
      const page = await ctx.newPage()
      await page.goto(`chrome-extension://${extId}/popup.html`)
      await page.waitForTimeout(1_500)

      // Switch to the About tab
      await page.click('button.tab[data-tab="about"]')
      await page.waitForTimeout(500)

      // Release tag visible, starts with "v1.0.0-rc"
      const releaseTag = await page.locator('#release-tag').textContent()
      expect(releaseTag, 'release tag must be non-empty').toBeTruthy()
      expect(releaseTag ?? '', 'release tag should look like vX.Y.Z-rcNN').toMatch(/^v\d+\.\d+\.\d+(-rc\d+)?/)

      // Pre-release badge visible
      await expect(page.locator('#release-stage')).toBeVisible()

      // "What's new" section has at least one release entry
      const entries = page.locator('.release-entry')
      expect(await entries.count(), 'whats-new section must render at least 1 release entry').toBeGreaterThan(0)

      // The first entry is expanded by default and contains a verify link to /demo
      const firstEntry = entries.first()
      await expect(firstEntry).toHaveAttribute('open', '')
      const verifyLinks = firstEntry.locator('.release-fix-verify-link')
      expect(await verifyLinks.count()).toBeGreaterThan(0)
      const firstHref = await verifyLinks.first().getAttribute('href')
      expect(firstHref).toContain('verifieddit.com/demo')

      // Build-metadata still present but now inside a <details>
      await expect(page.locator('.build-info-details')).toBeAttached()
    } finally {
      await ctx.close()
    }
  })

  test('Trust Lists tab renders a read-only listing with entity counts', async () => {
    test.setTimeout(60_000)
    const ctx = await launchWithExtension()
    try {
      const extId = await getExtensionId(ctx)
      const page = await ctx.newPage()
      await page.goto(`chrome-extension://${extId}/popup.html`)
      // Service worker needs a beat to initialise trust-list data
      await page.waitForTimeout(3_000)

      await page.click('button.tab[data-tab="trustlists"]')
      await page.waitForTimeout(1_500)

      // Summary line reports a non-zero number of trust lists
      const summary = await page.locator('.trustlists-summary').textContent()
      expect(summary, 'trust-lists summary text').toBeTruthy()
      expect(summary).toMatch(/\d+\s+trust list/)

      // At least one row renders
      const rows = page.locator('.trustlist-row')
      expect(await rows.count()).toBeGreaterThan(0)

      // First row has a non-empty name and positive entity count
      const firstName = await rows.first().locator('.trustlist-name').textContent()
      const firstMeta = await rows.first().locator('.trustlist-meta').textContent()
      expect(firstName?.trim().length ?? 0).toBeGreaterThan(0)
      expect(firstMeta).toMatch(/\d+\s+entit/i)

      // The Trust Lists tab is content-focused, not edit-focused: no file
      // input should be visible here. (Import UI stays in Options and
      // belongs to rc12 / #66.)
      const fileInputs = await page.locator('#trustlists input[type="file"]').count()
      expect(fileInputs, 'Trust Lists tab must be read-only — no file inputs').toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
