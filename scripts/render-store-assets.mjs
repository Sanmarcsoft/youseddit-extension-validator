/*
 * Rasterise the store-asset SVGs at a chosen scale.
 *
 * The vectors in releases/store-assets are the source of truth; the JPEGs beside
 * them are renders. Stores and funding pages display the cover wider than the
 * file we had shipped, so they upscaled it and it looked soft. Render at 2x and
 * let the platform downscale, which it does well, rather than upscale, which it
 * does not.
 *
 * Chromium is the renderer on purpose: it resolves the same font stack the
 * design was drawn against. resvg in the devcontainer has no Helvetica, so every
 * text width shifts and the badge pills no longer fit their labels.
 *
 * Usage (on a host with Chromium and the design fonts):
 *   node scripts/render-store-assets.mjs marquee-promo-1600x400.svg 2
 */

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'releases', 'store-assets')

const name = process.argv[2]
const scale = Number(process.argv[3] ?? 2)
if (name == null) throw new Error('usage: render-store-assets.mjs <file.svg> [scale]')

const svgPath = path.join(DIR, name)
const svg = fs.readFileSync(svgPath, 'utf8')
const m = /<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/.exec(svg)
if (m == null) throw new Error(`no width/height on the root <svg> of ${name}`)
const w = Number(m[1])
const h = Number(m[2])

const outJpg = svgPath.replace(/\.svg$/, `@${scale}x.jpg`)
const outPng = svgPath.replace(/\.svg$/, `@${scale}x.png`)

const browser = await chromium.launch({ channel: 'chromium', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: scale
  })
  // The store spec forbids alpha, so paint an opaque page under the artwork too.
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:#0369a1;width:${w}px;height:${h}px;overflow:hidden}
            svg{display:block}</style>${svg}`,
    { waitUntil: 'load' }
  )
  await page.waitForTimeout(400)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, type: 'png' })
  fs.writeFileSync(outPng, buf)
  await page.screenshot({ path: outJpg, clip: { x: 0, y: 0, width: w, height: h }, type: 'jpeg', quality: 94 })
  console.log(`${name} -> ${w * scale}x${h * scale}`)
  console.log(`  ${path.relative(ROOT, outPng)}  ${(fs.statSync(outPng).size / 1024).toFixed(1)} KB`)
  console.log(`  ${path.relative(ROOT, outJpg)}  ${(fs.statSync(outJpg).size / 1024).toFixed(1)} KB`)
} finally {
  await browser.close()
}
