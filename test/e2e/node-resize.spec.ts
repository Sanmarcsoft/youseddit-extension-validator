import { test, expect, chromium, type BrowserContext, type Frame, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * An expanded provenance node must actually resize when its corner is dragged.
 *
 * `.node.expanded` has carried `resize: both` since the diagram landed, so
 * Chromium paints a gripper in the bottom-right corner. It never did anything.
 * `onPointerDown` treats a press anywhere on `.node` as the start of a node
 * drag and calls setPointerCapture on the frame, which redirects the gesture
 * away from the element the UA resizer lives on. The node moved instead. The
 * selector guard could not have caught it: the gripper is not an element, it is
 * a painted corner of the node's own box, so only geometry can recognise it.
 *
 * This drives the real UA resizer with real input rather than asserting a
 * handler ran, so it stays honest if the wiring is refactored. Set EXT_PATH to
 * point it at a specific build.
 */

const EXT_PATH = process.env.EXT_PATH ?? path.resolve(__dirname, '..', '..', 'dist', 'chrome')
const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3000/demo-corpus/'
const FIXTURE = '07-edge-realworld-cbc-signed'

interface Box { width: number, height: number, left: number, top: number, right: number, bottom: number }

async function launch (): Promise<{ ctx: BrowserContext, page: Page }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifieddit-resize-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1400, height: 1800 },
    args: ['--headless=new', `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--no-sandbox']
  })
  return { ctx, page: ctx.pages()[0] ?? await ctx.newPage() }
}

/** Opens the overlay on the CBC fixture and returns its iframe frame. */
async function openOverlay (ctx: BrowserContext, page: Page): Promise<Frame> {
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
  return frame!
}

/** Reaches the diagram's shadow root and expands the first node that can be. */
async function expandFirstNode (frame: Frame): Promise<string> {
  return await frame.evaluate(() => {
    const g = document.querySelector('c2pa-overlay')?.shadowRoot
      ?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
    const root = g?.shadowRoot
    if (root == null) throw new Error('provenance graph shadow root not found')
    const node = root.querySelector('.node[data-node-id]') as HTMLElement | null
    if (node == null) throw new Error('no .node rendered')
    const toggle = node.querySelector('button.toggle') as HTMLButtonElement | null
    if (toggle == null) throw new Error('node has no toggle button')
    toggle.click()
    return node.dataset.nodeId ?? ''
  })
}

/** Layout size and screen box of one node, measured inside the frame. */
async function boxOf (frame: Frame, id: string): Promise<Box> {
  return await frame.evaluate((nodeId) => {
    const g = document.querySelector('c2pa-overlay')?.shadowRoot
      ?.querySelector('c2pa-provenance-graph') as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null
    const n = g?.shadowRoot?.querySelector(`.node[data-node-id="${nodeId}"]`) as HTMLElement | null
    if (n == null) throw new Error(`node ${nodeId} not found`)
    const r = n.getBoundingClientRect()
    return { width: n.offsetWidth, height: n.offsetHeight, left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }, id)
}

/**
 * Maps a point inside the overlay iframe to page coordinates for page.mouse,
 * and proves the result actually lands on the iframe.
 *
 * The iframe is 372x1050 and positioned partway down the page, so with a short
 * viewport the node's corner sits below the fold: elementFromPoint returns null
 * and every drag silently does nothing. That produced a green-looking RED, with
 * both the resize and the drag assertions failing for the same wrong reason.
 * Scroll first, re-read the box, then assert the hit.
 */
async function toPagePoint (page: Page, frame: Frame, x: number, y: number): Promise<{ x: number, y: number }> {
  const el = await frame.frameElement()
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  const bb = await el.boundingBox()
  expect(bb, 'overlay iframe must have a box').toBeTruthy()

  const point = { x: bb!.x + x, y: bb!.y + y }
  const vp = page.viewportSize()!
  expect(
    point.y, `target is below the viewport (${point.y} vs ${vp.height}); the mouse cannot reach it`
  ).toBeLessThan(vp.height)
  expect(point.x, 'target is right of the viewport').toBeLessThan(vp.width)

  const hit = await page.evaluate(([px, py]) => {
    const e = document.elementFromPoint(px as number, py as number) as HTMLElement | null
    return e == null ? 'null' : `${e.tagName}.${e.className}`
  }, [point.x, point.y])
  expect(hit, 'mapped point must land on the overlay iframe').toContain('c2paDialog')

  return point
}

async function drag (page: Page, fromX: number, fromY: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  // Stepped, because the UA resizer tracks movement rather than a single jump.
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(fromX + (dx * i) / 10, fromY + (dy * i) / 10)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

test.describe('expanded node resize handle', () => {
  test('dragging the bottom-right corner grows the node', async () => {
    test.setTimeout(180_000)

    const { ctx, page } = await launch()
    try {
      const frame = await openOverlay(ctx, page)
      const id = await expandFirstNode(frame)
      await page.waitForTimeout(600)

      const before = await boxOf(frame, id)
      // 3px inside the corner. The viewport is scaled (~0.58 after Fit), so the
      // gripper covers RESIZER_SIZE_PX * zoom on screen and 3px is well inside.
      const grip = await toPagePoint(page, frame, before.right - 3, before.bottom - 3)

      await drag(page, grip.x, grip.y, 90, 70)

      const after = await boxOf(frame, id)
      const moved = Math.round(Math.abs(after.left - before.left) + Math.abs(after.top - before.top))

      expect(
        after.width - before.width,
        `node must widen. before=${before.width} after=${after.width}; node translated ${moved}px, which is the drag-shadows-resize bug`
      ).toBeGreaterThan(20)
      expect(
        after.height - before.height,
        `node must grow taller. before=${before.height} after=${after.height}`
      ).toBeGreaterThan(15)
    } finally {
      await ctx.close()
    }
  })

  test('dragging the node body still moves it (#141 must not regress)', async () => {
    test.setTimeout(180_000)

    const { ctx, page } = await launch()
    try {
      const frame = await openOverlay(ctx, page)
      const id = await expandFirstNode(frame)
      await page.waitForTimeout(600)

      const before = await boxOf(frame, id)
      // Middle of the node's title row, far from the gripper.
      const body = await toPagePoint(page, frame, (before.left + before.right) / 2, before.top + 12)

      await drag(page, body.x, body.y, 60, 40)

      const after = await boxOf(frame, id)
      const moved = Math.abs(after.left - before.left) + Math.abs(after.top - before.top)

      expect(moved, 'a press on the node body must still drag the node').toBeGreaterThan(20)
      expect(
        Math.abs(after.width - before.width),
        'dragging the body must not resize the node'
      ).toBeLessThan(5)
    } finally {
      await ctx.close()
    }
  })
})
