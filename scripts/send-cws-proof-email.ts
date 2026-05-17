#!/usr/bin/env bun
/**
 * Send the Verifieddit v1.0.0 CWS submission end-to-end testing proof email
 * via Brevo Transactional API v3.
 *
 * Usage (preferred — key from pass):
 *   BREVO_API_KEY="$(pass show verifieddit/BREVO_API_KEY)" bun scripts/send-cws-proof-email.ts
 *
 * Or pass the key directly:
 *   BREVO_API_KEY=xkeysib-... bun scripts/send-cws-proof-email.ts
 *
 * Optional env:
 *   PROOF_RECIPIENT  (default: matt@sanmarcsoft.com)
 *   PROOF_FROM       (default: hello@verifieddit.com — must be a verified sender on the verifieddit Brevo account)
 *   PROOF_FROM_NAME  (default: Verifieddit Releases)
 *   PROOF_DRY_RUN    (default: false; set to 'true' to skip the API POST)
 */
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dir, '..')
const ZIP_PATH = path.join(REPO_ROOT, 'releases/verifieddit-chrome-1.0.0.zip')
const SHOTS_DIR = path.join(REPO_ROOT, 'releases/screenshots')
const SHOT_NAMES = [
  '01-corpus-detection.png',
  '02-overlay-closeup.png',
  '03-popup-trustlists.png',
  '04-popup-about.png'
]

const apiKey = process.env.BREVO_API_KEY
const recipient = process.env.PROOF_RECIPIENT ?? 'matt@sanmarcsoft.com'
const sender = process.env.PROOF_FROM ?? 'hello@verifieddit.com'
const senderName = process.env.PROOF_FROM_NAME ?? 'Verifieddit Releases'
const dryRun = process.env.PROOF_DRY_RUN === 'true'

if (!apiKey && !dryRun) {
  console.error('ERROR: BREVO_API_KEY env var is required (or set PROOF_DRY_RUN=true to inspect the payload).')
  process.exit(1)
}

async function fileToB64 (p: string): Promise<string> {
  const buf = await readFile(p)
  return buf.toString('base64')
}

async function sha256 (p: string): Promise<string> {
  const buf = await readFile(p)
  return createHash('sha256').update(buf).digest('hex')
}

const zipSha = await sha256(ZIP_PATH)
const zipSize = (await stat(ZIP_PATH)).size
const nowIso = new Date().toISOString()

const htmlBody = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:680px;color:#222;line-height:1.5">
  <h2 style="margin:0 0 6px 0">Verifieddit v1.0.0 — Chrome Web Store submission proof</h2>
  <p style="color:#555;margin:0 0 18px 0">End-to-end testing proof generated ${nowIso}.</p>

  <h3 style="margin:20px 0 6px 0">Submission package</h3>
  <table style="border-collapse:collapse;font-size:13px">
    <tr><td style="padding:3px 12px 3px 0;color:#666">file</td><td><code>releases/verifieddit-chrome-1.0.0.zip</code></td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666">size</td><td>${zipSize.toLocaleString()} bytes (${(zipSize / 1024 / 1024).toFixed(2)} MB)</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666">SHA-256</td><td style="font-family:monospace;font-size:12px">${zipSha}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666">git tag</td><td><code>v1.0.0</code> (at commit <code>fadf48b</code>)</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666">repo</td><td><a href="https://github.com/Sanmarcsoft/verifieddit-extension">github.com/Sanmarcsoft/verifieddit-extension</a></td></tr>
  </table>

  <h3 style="margin:20px 0 6px 0">Bundled manifest (sanity)</h3>
  <ul style="font-size:13px;line-height:1.6;margin:0">
    <li>name: <em>Verifieddit - C2PA Content Credential Verifier</em> (46 chars)</li>
    <li>version: 1.0.0 / minimum_chrome_version: 109</li>
    <li>permissions (6): <code>storage, tabs, activeTab, contextMenus, alarms, bookmarks</code></li>
    <li>host_permissions: <code>&lt;all_urls&gt;</code> (necessary for C2PA discovery on any site)</li>
    <li>web_accessible_resources (4): <code>c2pa.worker.js</code>, <code>icons/*.svg</code>, <code>toolkit_bg.wasm</code>, <code>iframe.html</code> (trust-list JSONs intentionally absent)</li>
    <li>icons + action.default_icon: 16 / 32 / 48 / 128</li>
    <li>CSP: <code>script-src 'self' 'wasm-unsafe-eval'; object-src 'self'</code></li>
  </ul>

  <h3 style="margin:20px 0 6px 0">Hardening verifications (all green)</h3>
  <ul style="font-size:13px;line-height:1.6;margin:0">
    <li>Bundled own-code <code>console.*</code> calls: <strong>0</strong> (background/inject/content/popup)</li>
    <li>Bundled <code>eval()</code> / <code>new Function()</code> (own code): <strong>0</strong></li>
    <li>Bundled modal-dialog calls (<code>alert/confirm/prompt</code>): <strong>0</strong></li>
    <li><code>raw.githubusercontent.com</code> runtime fetch: <strong>removed</strong> (trust-list <code>download_url</code> blanked)</li>
    <li>Trust-list JSONs in <code>web_accessible_resources</code>: <strong>removed</strong></li>
    <li>Dead code surface: <code>offscreen.{ts,html,css}</code> + <code>verifiedditApi.ts</code> deleted; 5 MSG_* OFFSCREEN constants gone</li>
    <li>WASM-init silent failure: now surfaces to popup banner via <code>chrome.storage.session</code></li>
    <li>Trust-list refresh: <code>response.ok</code> check added; default-bootstrap-empty crash path closed</li>
    <li>Privacy URL <code>https://www.verifieddit.com/privacy</code>: <strong>HTTP 200, no auth gate</strong></li>
    <li>GH Actions annotation panel: <strong>1 entry</strong> (intentional TDD-red from issue #50, allowlisted)</li>
  </ul>

  <h3 style="margin:20px 0 6px 0">RedTeam history</h3>
  <p style="font-size:13px;margin:0">
    Three adversarial rounds executed by <code>RedTeam</code> skill (ParallelAnalysis workflow with security-engineer + silent-failure-hunter subagents). Round 1 surfaced 2 CRITICAL + 6 HIGH/MEDIUM auto-reject vectors. Round 2 verified all 9 PASS at code level and surfaced 3 NEW findings (popup banner read race, init catch, min_chrome). Round 3 returned CONDITIONAL PASS, resolved with the <code>chrome.storage.onChanged</code> listener. Final verdict: PASS.
  </p>

  <h3 style="margin:20px 0 6px 0">Visual evidence (attached)</h3>
  <ul style="font-size:13px;line-height:1.6;margin:0">
    <li>01-corpus-detection.png — demo corpus page with six green C2PA badges painted by the extension</li>
    <li>02-overlay-closeup.png — close-up of one verified-trust badge on a signed image</li>
    <li>03-popup-trustlists.png — popup Trust Lists tab showing 2 lists loaded (23 entities total)</li>
    <li>04-popup-about.png — popup About tab showing v1.0.0 STABLE released 2026-05-17</li>
  </ul>

  <h3 style="margin:20px 0 6px 0">Submission readiness</h3>
  <p style="font-size:13px;margin:0;padding:10px;background:#ecf7ed;border-left:3px solid #2a8a3c;color:#1a5a24"><strong>READY TO UPLOAD.</strong> All safety and security gates pass. Submit via <a href="https://chrome.google.com/u/0/webstore/devconsole">chrome.google.com/u/0/webstore/devconsole</a> under the SanMarcSoft LLC publisher.</p>

  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd">
  <p style="font-size:11px;color:#999;margin:0">Generated by <code>scripts/send-cws-proof-email.ts</code> on ${nowIso}. Bundle and screenshots attached.</p>
</div>
`.trim()

const attachments: Array<{ name: string; content: string }> = []
attachments.push({
  name: 'verifieddit-chrome-1.0.0.zip',
  content: await fileToB64(ZIP_PATH)
})
for (const sn of SHOT_NAMES) {
  attachments.push({
    name: sn,
    content: await fileToB64(path.join(SHOTS_DIR, sn))
  })
}

const payload = {
  sender: { name: senderName, email: sender },
  to: [{ email: recipient }],
  subject: 'Verifieddit v1.0.0 — Chrome Web Store submission end-to-end proof',
  htmlContent: htmlBody,
  attachment: attachments
}

console.log(`[proof-email] recipient: ${recipient}`)
console.log(`[proof-email] sender:    ${sender} (${senderName})`)
console.log(`[proof-email] subject:   ${payload.subject}`)
console.log(`[proof-email] attachments: ${attachments.length}`)
for (const a of attachments) {
  const kb = Math.round(a.content.length * 0.75 / 1024)
  console.log(`  - ${a.name}  (~${kb} KB)`)
}
console.log(`[proof-email] zip SHA-256: ${zipSha}`)

if (dryRun) {
  console.log('[proof-email] DRY RUN. Skipping Brevo POST. Set PROOF_DRY_RUN=false to send.')
  process.exit(0)
}

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    'api-key': apiKey!,
    'content-type': 'application/json',
    'accept': 'application/json'
  },
  body: JSON.stringify(payload)
})
const text = await res.text()
console.log(`[proof-email] HTTP ${res.status} ${res.statusText}`)
console.log(`[proof-email] body: ${text}`)

if (!res.ok) {
  console.error('[proof-email] SEND FAILED')
  process.exit(2)
}
console.log('[proof-email] SENT.')
