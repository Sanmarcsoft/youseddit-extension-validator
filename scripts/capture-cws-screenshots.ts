/* eslint-disable no-console */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '..')
const EXT_PATH = path.join(REPO_ROOT, 'dist/chrome')
const OUT_DIR = path.join(REPO_ROOT, 'releases/screenshots')
const FIXTURE_URL = process.env.FIXTURE_URL ?? 'http://localhost:3000/'
const VIEWPORT = { width: 1280, height: 800 }

async function waitForServiceWorker (context: BrowserContext): Promise<string> {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0].url()
  const sw = await context.waitForEvent('serviceworker', { timeout: 10_000 })
  return sw.url()
}

async function main (): Promise<void> {
  if (!existsSync(EXT_PATH)) {
    throw new Error(`Extension build not found at ${EXT_PATH}. Run \`bun run build\` first.`)
  }
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`[cws-shots] Launching Chromium headless=new with extension at ${EXT_PATH}`)
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: VIEWPORT,
    args: [
      '--headless=new',
      `--load-extension=${EXT_PATH}`,
      `--disable-extensions-except=${EXT_PATH}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })

  const swUrl = await waitForServiceWorker(context)
  const extId = swUrl.split('/')[2]
  console.log(`[cws-shots] Extension ID resolved: ${extId}`)

  const page: Page = await context.newPage()
  await page.setViewportSize(VIEWPORT)

  console.log(`[cws-shots] Navigating to ${FIXTURE_URL}`)
  await page.goto(FIXTURE_URL, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(5_000)

  console.log('[cws-shots] Shot 1: corpus page with detection overlays')
  await page.screenshot({ path: path.join(OUT_DIR, '01-corpus-detection.png'), fullPage: false })

  const overlayLocator = page.locator('img').first()
  const overlayBox = await overlayLocator.boundingBox()
  if (overlayBox !== null) {
    console.log('[cws-shots] Shot 2: overlay icon close-up')
    await page.screenshot({
      path: path.join(OUT_DIR, '02-overlay-closeup.png'),
      clip: {
        x: Math.max(0, overlayBox.x - 20),
        y: Math.max(0, overlayBox.y - 20),
        width: Math.min(VIEWPORT.width - overlayBox.x + 20, overlayBox.width + 80),
        height: Math.min(VIEWPORT.height - overlayBox.y + 20, overlayBox.height + 80)
      }
    })
  } else {
    console.warn('[cws-shots] Shot 2: no img element to frame; skipping')
  }

  console.log('[cws-shots] Shot 3: popup.html as a standalone page')
  const popupPage = await context.newPage()
  await popupPage.setViewportSize({ width: 420, height: 600 })
  await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' })
  await popupPage.waitForTimeout(2_000)
  await popupPage.screenshot({ path: path.join(OUT_DIR, '03-popup.png') })
  await popupPage.close()

  console.log('[cws-shots] Shot 4: options page (about/trust lists)')
  const optionsPage = await context.newPage()
  await optionsPage.setViewportSize(VIEWPORT)
  await optionsPage.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' })
  await optionsPage.waitForTimeout(2_000)
  await optionsPage.screenshot({ path: path.join(OUT_DIR, '04-options-trust-lists.png') })
  await optionsPage.close()

  await context.close()
  console.log(`[cws-shots] Done. Output: ${OUT_DIR}`)
}

main().catch((err) => {
  console.error('[cws-shots] FAILED:', err)
  process.exit(1)
})
