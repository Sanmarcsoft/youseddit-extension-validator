/* Builds a single-SVG contact sheet and rasterises it with resvg for visual review. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { renderMark, STATE_TABLE } from './aperture'

const inner = (s: string): string => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
const nest = (spec: any, x: number, y: number, size: number, extra = ''): string =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24"${extra}>` +
  inner(renderMark({ ...spec, motion: false })) + '</svg>'

const COLS = 4
const CW = 292
const CH = 168
const entries = Object.entries(STATE_TABLE)
const rows = Math.ceil(entries.length / COLS)

const cells = entries.map(([key, spec], i) => {
  const cx = (i % COLS) * CW
  const cy = Math.floor(i / COLS) * CH
  return `<g transform="translate(${cx},${cy})">
    <rect x="8" y="8" width="${CW - 16}" height="${CH - 16}" rx="12" fill="#fff" stroke="#E3E7EC"/>
    <rect x="20" y="20" width="${CW - 40}" height="66" rx="8" fill="#FAFBFC"/>
    ${nest(spec, 30, 30, 46)}
    ${nest(spec, 88, 38, 30)}
    ${nest(spec, 126, 42, 22)}
    <g filter="url(#grey)">${nest(spec, 158, 38, 30)}</g>
    <rect x="196" y="34" width="38" height="38" rx="7" fill="#5b4a38"/>
    <rect x="196" y="34" width="38" height="38" rx="7" fill="#2b3d4f" opacity="0.55"/>
    ${nest(spec, 200, 38, 30)}
    <text x="24" y="108" font-family="sans-serif" font-size="13" font-weight="600" fill="#12161C">${spec.label}</text>
    <text x="24" y="126" font-family="monospace" font-size="10.5" fill="#0F766E">${key}</text>
    <text x="24" y="146" font-family="sans-serif" font-size="10" fill="#8A94A6">${['ring:' + spec.integrity, 'P' + (spec.pillars ?? 0), 'core:' + (spec.origin ?? 'unknown'), 'seal:' + (spec.identity ?? 'none')].join('  ·  ')}</text>
  </g>`
}).join('')

const W = COLS * CW
const H = rows * CH + 64
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="grey"><feColorMatrix type="saturate" values="0"/></filter></defs>
  <rect width="${W}" height="${H}" fill="#F6F7F9"/>
  <text x="24" y="34" font-family="sans-serif" font-size="17" font-weight="700" fill="#12161C">Aperture – Verifieddit provenance mark</text>
  <text x="24" y="52" font-family="sans-serif" font-size="11.5" fill="#5A6473">sizes 46 / 30 / 22 px, then greyscale, then over photography. Ring = integrity · lit segments = durability pillars · core = origin · apex seal = identity</text>
  <g transform="translate(0,64)">${cells}</g>
</svg>`

writeFileSync(join(import.meta.dir, 'contact-sheet.svg'), svg)
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W * 2 },
  font: { fontFiles: ['/config/workspace/projects/chat-us/testenv/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf', '/config/workspace/projects/chat-us/testenv/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf', '/config/workspace/projects/chat-us/testenv/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf'], loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' }
}).render().asPng()
writeFileSync(join(import.meta.dir, 'contact-sheet.png'), png)
console.log(`contact sheet ${W}x${H} -> contact-sheet.png`)
