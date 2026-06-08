/*
 * Firefox cannot run the blob: worker that @contentauth/c2pa-web creates, and
 * Firefox MV3 strips blob: from the extension-page CSP, so the manifest can't
 * allow it. The companion patch (patches/@contentauth+c2pa-web+0.9.0.patch)
 * makes the library honour a globalThis.__C2PA_WORKER_URL__ override; this
 * script extracts the worker's source (the inline `j` IIFE string in the
 * c2pa-web chunk) into public/c2pa-web.worker.js so it can be shipped as a
 * packaged moz-extension:// / chrome-extension:// file (allowed by 'self').
 *
 * Runs in prebuild so the worker file always matches the installed version.
 */
import fs from 'node:fs'
import path from 'node:path'

const distDir = 'node_modules/@contentauth/c2pa-web/dist'
const out = 'public/c2pa-web.worker.js'

const candidates = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'))
let chunk = null
for (const f of candidates) {
  const s = fs.readFileSync(path.join(distDir, f), 'utf8')
  if (/,\s*j\s*=\s*'\(function\(\)\{/.test(s)) { chunk = s; break }
}
if (chunk == null) {
  console.error('extract-c2pa-worker: could not find the worker chunk in', distDir)
  process.exit(1)
}

const m = chunk.match(/,\s*j\s*=\s*'/)
let i = m.index + m[0].length
let body = ''
while (i < chunk.length) {
  const c = chunk[i]
  if (c === '\\') { body += c + chunk[i + 1]; i += 2; continue }
  if (c === "'") break
  body += c
  i++
}
// Unescape the JS single-quoted string literal into the actual worker source.
// eslint-disable-next-line no-eval
const worker = (0, eval)("'" + body + "'")
if (!worker.startsWith('(function(){')) {
  console.error('extract-c2pa-worker: extracted content does not look like the worker IIFE')
  process.exit(1)
}
fs.writeFileSync(out, worker)
console.log(`extract-c2pa-worker: wrote ${out} (${worker.length} bytes)`)
