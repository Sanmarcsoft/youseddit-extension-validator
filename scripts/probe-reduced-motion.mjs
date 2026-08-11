/**
 * The overlay panel must be fully usable with `prefers-reduced-motion: reduce`.
 *
 * `sharedStyles` disables every transition under that media query, so the
 * `transitionend` the "View more" panel used to wait on never fired: the panel
 * stayed frozen at the height it had while all sections were shut, with
 * overflow still hidden. Each section still toggled open — the revealed detail
 * was simply clipped away — so the disclosure arrows read as dead controls.
 *
 * This runs the same gesture twice, once with each motion preference, and
 * asserts the panel grows in both. Comparing the two is what makes the failure
 * legible: without the reduce arm it looks like the sections work fine.
 *
 * Usage: node probe-reduced-motion.mjs <path-to-dist/chrome> <chromium-executable>
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXT_PATH = process.argv[2]
const EXECUTABLE = process.argv[3]
/** Real, third-party, publicly published C2PA asset. */
const SIGNED_URL = 'https://contentauth.github.io/example-assets/images/ChatGPT_Image.png'

const results = []
function check (name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail != null ? ` :: ${detail}` : ''}`)
}

async function run (reducedMotion) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-rm-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXECUTABLE,
    // Tall enough that nothing under test sits below the fold: a click Playwright
    // aims outside the viewport lands nowhere and reads as a hit-testing bug.
    viewport: { width: 1400, height: 1600 },
    reducedMotion,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  })

  try {
    let sw
    for (let i = 0; i < 120 && sw == null; i++) {
      sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'))
      if (sw == null) await new Promise((r) => setTimeout(r, 250))
    }
    if (sw == null) throw new Error('extension service worker never registered')
    for (let i = 0; i < 20; i++) {
      try { await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }) }); break } catch { await new Promise((r) => setTimeout(r, 500)) }
    }

    const page = await ctx.newPage()
    await page.goto(SIGNED_URL, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForSelector('div[c2pa-icon]', { timeout: 60_000 })
    let opened = false
    for (let i = 0; i < 24 && !opened; i++) {
      await page.waitForTimeout(2_000)
      await page.evaluate(() => { document.querySelector('div[c2pa-icon]')?.click() })
      opened = await page.evaluate(() => {
        const d = [...document.querySelectorAll('iframe')].find((f) => f.className === 'c2paDialog')
        return d != null && d.style.visibility === 'visible'
      })
    }
    if (!opened) throw new Error('overlay never became visible')

    const frame = page.frames().find((f) => f.url().includes('iframe.html'))
    const panel = async () => await frame.evaluate(() => {
      const root = document.querySelector('c2pa-overlay')?.shadowRoot
      const ai = root?.querySelector('.additional-info')
      const cs = ai != null ? getComputedStyle(ai) : null
      return {
        maxHeight: cs?.maxHeight,
        overflow: cs?.overflow,
        height: Math.round(ai?.getBoundingClientRect().height ?? -1),
        scrollHeight: ai?.scrollHeight ?? -1,
        sections: [...(root?.querySelectorAll('c2pa-collapsible') ?? [])].map((c) => ({
          header: (c.querySelector('[slot="header"]')?.textContent ?? '').trim().slice(0, 24),
          open: c.open === true
        }))
      }
    })

    const ui = page.frameLocator('iframe.c2paDialog')
    await ui.locator('c2pa-overlay button.more').click()
    await page.waitForTimeout(1_500)
    const afterMore = await panel()
    check(`[${reducedMotion}] View more releases the panel's clip`,
      afterMore.overflow === 'visible' && afterMore.maxHeight === 'none',
      `max-height=${afterMore.maxHeight} overflow=${afterMore.overflow} h=${afterMore.height}`)

    const headers = ui.locator('c2pa-collapsible .collapsible-header')
    const count = await headers.count()
    check(`[${reducedMotion}] the panel exposes its sections`, count > 0, `${count} sections`)

    let grew = true
    let trace = []
    for (let i = 0; i < count; i++) {
      const before = await panel()
      await headers.nth(i).click()
      await page.waitForTimeout(700)
      const after = await panel()
      // Only one section is open at a time, so the panel height moves with the
      // section that just opened rather than accumulating.
      const visible = after.height >= after.scrollHeight - 2
      trace.push(`${after.sections[i]?.header}: open=${after.sections[i]?.open} h ${before.height}->${after.height} scrollH=${after.scrollHeight}`)
      if (after.sections[i]?.open !== true || !visible) grew = false
    }
    check(`[${reducedMotion}] every section reveals its detail when clicked`, grew, trace.join(' | '))
    await page.screenshot({ path: path.join(os.tmpdir(), `vd-sections-${reducedMotion}.png`) })
  } finally {
    await ctx.close().catch(() => {})
  }
}

await run('no-preference')
await run('reduce')

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
