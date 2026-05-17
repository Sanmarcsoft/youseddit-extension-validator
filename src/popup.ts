/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type TrustListInfo, getTrustListInfos, removeTrustList, addTSATrustFile, addTrustFile } from './trustlistProxy.js'
import packageManifest from '../package.json'
import { BUILD_INFO } from './build-info'
import { AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED, MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES, MSG_SAVE_BOOKMARK } from './constants.js'
import { type MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD } from './inject.js'
import { type ToggleSwitch } from './components/toggle.js'
import { RELEASE_NOTES, DEMO_URL, type ReleaseEntry, type ReleaseFix } from './releaseNotes.js'

function setText (id: string, value: string): void {
  const el = document.getElementById(id)
  if (el !== null) el.textContent = value
}

function setHref (id: string, url: string): void {
  const el = document.getElementById(id) as HTMLAnchorElement | null
  if (el !== null) el.href = url
}

/**
 * Return the release family tag for the current build, even when the build
 * isn't at an exact tag commit. Examples:
 *   BUILD_INFO.tag         = "v1.0.0-rc11"             → "v1.0.0-rc11"
 *   BUILD_INFO.tagDescribe = "v1.0.0-rc11-2-g544aaa6"  → "v1.0.0-rc11"
 *   BUILD_INFO.tagDescribe = "v1.0.0-rc9-1-gdd46fd1-dirty" → "v1.0.0-rc9"
 *   BUILD_INFO.tagDescribe = "v1.0.0" (exact-match rare) → "v1.0.0"
 * Falls back to the version string from package.json if no tag is available.
 */
function releaseFamilyTag (): string {
  if (BUILD_INFO.tag !== '') return BUILD_INFO.tag
  const td = BUILD_INFO.tagDescribe
  if (td == null || td === '' || td === 'unknown') return `v${BUILD_INFO.version}`
  // Strip trailing "-<n>-g<sha>[-dirty]" if present.
  const match = td.match(/^(.+?)(?:-\d+-g[0-9a-f]+(?:-dirty)?)?$/)
  return match?.[1] ?? td
}

function populateReleaseHeader (): void {
  const tag = releaseFamilyTag()
  setText('release-tag', tag)
  const isPrerelease = /-rc\d+/i.test(tag) || /-alpha|-beta/i.test(tag)
  setText('release-stage', isPrerelease ? 'pre-release' : 'stable')
  setHref('release-tag-link',
    BUILD_INFO.tag !== ''
      ? `${BUILD_INFO.repoUrl}/releases/tag/${BUILD_INFO.tag}`
      : `${BUILD_INFO.repoUrl}/releases`
  )
  // Find the matching release-notes entry by family tag. The buildDate is
  // the compile-time stamp; the release date is the one in releaseNotes.ts
  // so we prefer the latter when we have it.
  const matching = RELEASE_NOTES.find(r => r.tag === tag)
  const displayDate = matching?.date ?? (BUILD_INFO.buildDate !== '' ? BUILD_INFO.buildDate.slice(0, 10) : '')
  setText('release-date', displayDate !== '' ? `Released ${displayDate}` : '')
}

function populateBuildInfo (): void {
  populateReleaseHeader()
  setText('version', BUILD_INFO.version)
  // version-name shows tag if at an exact release, else 'dev'
  setText('version-name', BUILD_INFO.tag !== '' ? `(${BUILD_INFO.tag})` : '(dev)')

  setText('tag-describe', BUILD_INFO.tagDescribe)
  if (BUILD_INFO.tag !== '') {
    setHref('tag-link', `${BUILD_INFO.repoUrl}/releases/tag/${BUILD_INFO.tag}`)
  } else {
    // No exact tag — link to the commit's tree on that branch
    setHref('tag-link', `${BUILD_INFO.repoUrl}/tree/${BUILD_INFO.commitBranch}`)
  }

  setText('commit-short', BUILD_INFO.commitShort)
  setHref('commit-link', `${BUILD_INFO.repoUrl}/commit/${BUILD_INFO.commit}`)
  setText('commit-branch', BUILD_INFO.commitBranch !== 'unknown' ? `· ${BUILD_INFO.commitBranch}` : '')

  setText('build-date', BUILD_INFO.buildDate)
  setText('build-host', BUILD_INFO.buildHost !== 'unknown' ? `· ${BUILD_INFO.buildHost}` : '')
}

function renderWhatsNew (): void {
  const host = document.getElementById('whats-new')
  if (host == null) return
  const currentTag = releaseFamilyTag()
  const html = RELEASE_NOTES.map((entry, idx) => renderReleaseEntry(entry, idx === 0 || entry.tag === currentTag)).join('')
  host.innerHTML = html
}

function renderReleaseEntry (entry: ReleaseEntry, openByDefault: boolean): string {
  const fixesHtml = entry.fixes.map(renderFix).join('')
  const openAttr = openByDefault ? ' open' : ''
  return `
    <details class="release-entry"${openAttr} data-tag="${esc(entry.tag)}">
      <summary>
        <span class="release-entry-tag">${esc(entry.tag)}</span>
        <span class="release-entry-date">${esc(entry.date)}</span>
        <span class="release-entry-summary">${esc(entry.summary)}</span>
      </summary>
      <ul class="release-fix-list">${fixesHtml}</ul>
    </details>
  `
}

function renderFix (fix: ReleaseFix): string {
  const verifyHref = fix.verifyFragment != null && fix.verifyFragment !== ''
    ? `${DEMO_URL}#${esc(encodeURIComponent(fix.verifyFragment))}`
    : DEMO_URL
  return `
    <li class="release-fix">
      <div class="release-fix-title">${esc(fix.title)}</div>
      <div class="release-fix-verify"><span class="release-fix-verify-label">How to verify:</span> ${esc(fix.howToVerify)}</div>
      <a class="release-fix-verify-link" href="${esc(verifyHref)}" target="_blank" rel="noopener">Open /demo ↗</a>
    </li>
  `
}

async function renderTrustListsTab (): Promise<void> {
  const host = document.getElementById('trustlists-content')
  if (host == null) return
  try {
    const tlis = await getTrustListInfos()
    if (tlis == null || tlis.length === 0) {
      host.innerHTML = '<p class="detail-dim">No trust lists loaded yet. The background service worker may still be warming up — try closing and reopening this popup.</p>'
      return
    }
    const totalEntities = tlis.reduce((sum, tli) => sum + (tli.entities_count ?? 0), 0)
    const summary = `<p class="trustlists-summary"><b>${tlis.length}</b> trust list${tlis.length === 1 ? '' : 's'} loaded · <b>${totalEntities}</b> entit${totalEntities === 1 ? 'y' : 'ies'} total</p>`
    const rows = tlis.map((tli) => {
      const displayName = esc(tli.name ?? '(unnamed list)')
      const website = tli.website?.length > 0 ? `<a href="${esc(tli.website)}" target="_blank" rel="noopener">${esc(tli.website)}</a>` : '<span class="detail-dim">no website</span>'
      const lastUpdated = tli.last_updated != null && tli.last_updated !== ''
        ? esc(tli.last_updated.slice(0, 10))
        : '<span class="detail-dim">unknown</span>'
      return `
        <li class="trustlist-row">
          <div class="trustlist-name">${displayName}</div>
          <div class="trustlist-meta"><b>${tli.entities_count}</b> entit${tli.entities_count === 1 ? 'y' : 'ies'} · updated ${lastUpdated}</div>
          <div class="trustlist-desc">${esc(tli.description ?? '')}</div>
          <div class="trustlist-source">Source: ${website}</div>
        </li>
      `
    }).join('')
    host.innerHTML = `${summary}<ul class="trustlist-readonly">${rows}</ul>`
  } catch (err) {
    host.innerHTML = `<p class="validation-errors">Couldn't load trust lists: ${esc(String((err as Error).message ?? err))}</p>`
  }
}

async function renderInitErrorBanner (): Promise<void> {
  const banner = document.getElementById('initErrorBanner')
  if (banner == null) return
  // chrome.storage.session is Chrome 102+. Use optional chain to no-op
  // on older Chromes; the banner stays hidden, which is correct since
  // the writer side also no-ops there.
  const stored = await chrome.storage.session?.get(['c2paInitError', 'trustListsInitError']) ?? {}
  const c2paErr = stored.c2paInitError as string | undefined
  const tlErr = stored.trustListsInitError as string | undefined
  if ((c2paErr == null || c2paErr === '') && (tlErr == null || tlErr === '')) return

  const parts: string[] = []
  if (c2paErr != null && c2paErr !== '') {
    const title = document.createElement('div')
    title.className = 'init-error-title'
    title.textContent = 'C2PA engine failed to initialise'
    banner.appendChild(title)
    const detail = document.createElement('div')
    detail.textContent = c2paErr
    banner.appendChild(detail)
    parts.push('c2pa')
  }
  if (tlErr != null && tlErr !== '') {
    const title = document.createElement('div')
    title.className = 'init-error-title'
    title.style.marginTop = parts.length > 0 ? '6px' : '0'
    title.textContent = 'Default trust lists failed to load'
    banner.appendChild(title)
    const detail = document.createElement('div')
    detail.textContent = tlErr
    banner.appendChild(detail)
  }
  banner.removeAttribute('hidden')
}

document.addEventListener('DOMContentLoaded', function (): void {
  populateBuildInfo()
  renderWhatsNew()
  void renderInitErrorBanner()
  // The popup can open in the millisecond window before c2pa.init or
  // initTrustlist resolves. Re-render the banner whenever the writers
  // touch the session storage keys we care about, so a delayed init
  // failure still becomes visible to the user.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return
    if ('c2paInitError' in changes || 'trustListsInitError' in changes) {
      void renderInitErrorBanner()
    }
  })

  const autoScanToggle = document.getElementById('toggleAutoScan') as ToggleSwitch

  chrome.storage.local.get('autoScan', (result) => {
    autoScanToggle.checked = result.autoScan ?? AUTO_SCAN_DEFAULT
  })

  autoScanToggle.addEventListener('change', (event) => {
    const checked = (event as CustomEvent).detail.checked
    void chrome.storage.local.set({ autoScan: checked })
    void chrome.runtime.sendMessage({ action: MSG_AUTO_SCAN_UPDATED, data: checked })
  })

  // Add event listeners to switch tabs
  const tabs = document.querySelectorAll('.tab')
  const tabContents = document.querySelectorAll('.tab-content')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and tab contents
      tabs.forEach((t) => { t.classList.remove('active') })
      tabContents.forEach((c) => { c.classList.remove('active-content') })

      // Add active class to clicked tab and tab content
      tab.classList.add('active')
      const tabContentId = tab.getAttribute('data-tab') ?? ''
      document.getElementById(tabContentId)?.classList.add('active-content')

      // refresh the trust lists info in the option tab
      if (tabContentId === 'options') {
        const info = document.getElementById('trust-list-info')
        if (info !== null && info.innerHTML === '') {
          // Paint an immediate placeholder so the Options tab never
          // looks like it's forgotten to render trust lists (#59/#60 UX).
          info.innerHTML = '<p class="detail-dim">Loading trust lists…</p>'
        }
        void displayTrustListInfos()
      }

      // Populate the new Trust Lists read-only tab when it becomes active.
      if (tabContentId === 'trustlists') {
        void renderTrustListsTab()
      }
    })
  })
  void showResults()
  // Pre-warm trust-list data so the Options tab is ready to render
  // as soon as it's selected, not after a perceptible delay (#59/#60).
  void displayTrustListInfos()
  // Pre-warm the new read-only Trust Lists tab too.
  void renderTrustListsTab()

  // rc13.1 / #66 — Wire the in-tab import controls (file + URL). These
  // duplicate the Options-tab inputs but live alongside the list UI so
  // users don't have to hunt for them.
  wireTrustListImportControls()
})

function wireTrustListImportControls (): void {
  const fileInput = document.getElementById('tl-file-input-trustlists') as HTMLInputElement | null
  const urlInput = document.getElementById('tl-url-input') as HTMLInputElement | null
  const fetchBtn = document.getElementById('tl-url-fetch') as HTMLButtonElement | null
  const statusEl = document.getElementById('tl-import-status') as HTMLDivElement | null

  const setStatus = (msg: string, tone: 'info' | 'ok' | 'error' = 'info'): void => {
    if (statusEl == null) return
    statusEl.textContent = msg
    statusEl.style.color = tone === 'ok' ? '#1f6a2c' : tone === 'error' ? '#7a1f1f' : '#666'
  }

  if (fileInput != null) {
    fileInput.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement
      const f = t.files?.[0]
      if (f == null) return
      setStatus(`Reading ${f.name}…`)
      const reader = new FileReader()
      reader.readAsText(f, 'UTF-8')
      reader.onload = () => {
        const contents = reader.result as string
        addTrustFile(contents)
          .then(async () => {
            await displayTrustListInfos()
            await renderTrustListsTab()
            setStatus(`Imported ${f.name}`, 'ok')
            t.value = ''
          })
          .catch((err) => {
            setStatus(`Import failed: ${String((err as Error).message ?? err)}`, 'error')
          })
      }
      reader.onerror = () => { setStatus('Failed to read file', 'error') }
    })
  }

  if (fetchBtn != null && urlInput != null) {
    fetchBtn.addEventListener('click', () => {
      const url = urlInput.value.trim()
      if (url === '' || !/^https?:\/\//i.test(url)) {
        setStatus('Enter a full http(s) URL.', 'error')
        return
      }
      setStatus(`Fetching ${url}…`)
      fetch(url, { credentials: 'omit' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return await r.text()
        })
        .then(async (contents) => {
          await addTrustFile(contents)
          await displayTrustListInfos()
          await renderTrustListsTab()
          setStatus(`Imported from ${url}`, 'ok')
          urlInput.value = ''
        })
        .catch((err) => { setStatus(`Fetch failed: ${String((err as Error).message ?? err)}`, 'error') })
    })
  }
}

/**
 * Displays the validation results in the popup.
 * @returns {Promise<void>} A promise that resolves when the results are displayed.
 */
async function showResults (): Promise<void> {
  const activeBrowserTab = await chrome.tabs.query({ active: true, currentWindow: true })
  const id = activeBrowserTab[0].id
  if (id == null) {
    return
  }
  void chrome.tabs.sendMessage(id, { action: MSG_REQUEST_C2PA_ENTRIES, data: null })
}

// Escape untrusted strings before insertion into innerHTML (#59).
function esc (s: string | null | undefined): string {
  if (s == null) return ''
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function statusLabel (status: string): { text: string, cls: string } {
  switch (status) {
    case 'success':    return { text: 'Trusted',     cls: 'status-success' }
    case 'warning':    return { text: 'Untrusted',   cls: 'status-warning' }
    case 'error':      return { text: 'Invalid',     cls: 'status-error' }
    case 'ai-success': return { text: 'AI (signed)', cls: 'status-ai-success' }
    case 'ai-error':   return { text: 'AI (error)',  cls: 'status-ai-error' }
    default:           return { text: status,        cls: 'status-unknown' }
  }
}

function renderIngredientTree (ingredients: MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD['ingredients']): string {
  if (ingredients.length === 0) {
    return '<div class="ingredient-empty">No ingredients in manifest</div>'
  }
  const rows = ingredients.map((ing) => {
    const thumb = ing.thumbnail != null && ing.thumbnail !== ''
      ? `<img class="ingredient-thumb" src="${esc(ing.thumbnail)}" alt="">`
      : '<div class="ingredient-thumb placeholder">?</div>'
    return `
      <li class="ingredient">
        ${thumb}
        <div class="ingredient-meta">
          <div class="ingredient-title">${esc(ing.title)}</div>
          <div class="ingredient-dim">${esc(ing.format)} · in ${esc(ing.parentManifest)}</div>
        </div>
      </li>`
  }).join('')
  return `<ul class="ingredient-tree">${rows}</ul>`
}

function addValidationResult (r: MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD): void {
  // Status icon — same two-tone CR set as the in-page overlay.
  const iconUrl = {
    success:      chrome.runtime.getURL('icons/cr.svg'),
    warning:      chrome.runtime.getURL('icons/cr!.svg'),
    error:        chrome.runtime.getURL('icons/crx.svg'),
    'ai-success': chrome.runtime.getURL('icons/cr.svg'),
    'ai-error':   chrome.runtime.getURL('icons/crx.svg')
  } as Record<string, string>
  const icon = iconUrl[r.status] ?? iconUrl.success

  const thumbSrc = (r.thumbnail != null && r.thumbnail !== '')
    ? r.thumbnail
    : chrome.runtime.getURL('icons/camera.svg')

  const { text: statusText, cls: statusCls } = statusLabel(r.status)

  const errorsSection = r.validationErrors.length > 0
    ? `<dt>Errors</dt><dd class="validation-errors">${r.validationErrors.map((e) => `<div>${esc(e)}</div>`).join('')}</dd>`
    : ''

  const trustLine = r.trustListName != null
    ? `${esc(r.trustListName)}${r.trustListEntity != null ? ` · ${esc(r.trustListEntity)}` : ''}`
    : '<span class="detail-dim">not in any trust list</span>'

  const tsaLine = r.hasTSA
    ? '<span class="tsa-ok">✓ present</span>'
    : '<span class="detail-dim">absent</span>'

  const aiLine = r.isAIDetected
    ? '<span class="ai-flag">⚠ AI-generated</span>'
    : '<span class="detail-dim">no</span>'

  // Unique id so each row's details panel can be toggled independently.
  const rowId = `v-${Math.random().toString(36).slice(2, 9)}`

  const html = `
    <div class="v-row" data-status="${esc(r.status)}" data-url="${esc(r.url)}" data-title="${esc(`Verifieddit · ${decodeURIComponent(r.name)} · ${statusText}${r.signer !== '(unknown signer)' ? ` (${r.signer})` : ''}`)}">
      <button class="v-summary" data-target="${rowId}" aria-expanded="false">
        <img class="v-status-icon" src="${esc(icon)}" alt="${esc(statusText)}">
        <img class="v-thumb" src="${esc(thumbSrc)}" alt="">
        <div class="v-name">${esc(decodeURIComponent(r.name))}</div>
        <span class="v-pill ${statusCls}">${esc(statusText)}</span>
        <button class="v-save" title="Save verification to the verifieddit.com bookmark folder" aria-label="Save verification" style="margin-left:auto;padding:2px 8px;font-size:11px;background:transparent;border:1px solid #1f4d7a;color:#1f4d7a;border-radius:4px;cursor:pointer">★ Save</button>
        <span class="v-disclosure">▸</span>
      </button>
      <div class="v-details" id="${rowId}" hidden>
        <dl>
          <dt>Signer</dt>
          <dd>${esc(r.signer)}</dd>
          <dt>Trust list</dt>
          <dd>${trustLine}</dd>
          <dt>Certificate</dt>
          <dd>${r.certIssuer != null ? `issued by <b>${esc(r.certIssuer)}</b>${r.certSubject != null ? ` to <b>${esc(r.certSubject)}</b>` : ''}` : '<span class="detail-dim">no chain</span>'}</dd>
          <dt>Trusted timestamp</dt>
          <dd>${tsaLine}</dd>
          <dt>AI detection</dt>
          <dd>${aiLine}</dd>
          <dt>Manifests</dt>
          <dd>${r.manifestCount} · active: <b>${esc(r.activeManifest)}</b></dd>
          ${errorsSection}
        </dl>
        <div class="ingredient-header">Ingredients (${r.ingredients.length})</div>
        ${renderIngredientTree(r.ingredients)}
      </div>
    </div>
  `

  const validationEntries = document.getElementById('validationEntries')
  if (validationEntries == null) return
  // Hide the "scanning…" empty state as soon as the first entry arrives.
  const empty = document.getElementById('validationEmpty')
  if (empty != null) empty.style.display = 'none'
  // Append; wire up the toggle for the newly inserted row.
  const wrap = document.createElement('template')
  wrap.innerHTML = html.trim()
  const node = wrap.content.firstElementChild
  if (node == null) return
  validationEntries.appendChild(node)
  const btn = node.querySelector<HTMLButtonElement>('.v-summary')
  const panel = node.querySelector<HTMLElement>('.v-details')
  const saveBtn = node.querySelector<HTMLButtonElement>('.v-save')
  const row = node as HTMLElement
  if (saveBtn != null) {
    saveBtn.addEventListener('click', (ev) => {
      // Don't also toggle the surrounding summary button.
      ev.stopPropagation()
      ev.preventDefault()
      const imageUrl = row.getAttribute('data-url') ?? ''
      const title = row.getAttribute('data-title') ?? 'Verifieddit verification'
      if (imageUrl === '') return
      saveBtn.disabled = true
      saveBtn.textContent = 'Saving…'
      chrome.runtime.sendMessage(
        { action: MSG_SAVE_BOOKMARK, data: { imageUrl, title } },
        (resp: { status?: 'created' | 'already-exists' | 'error' }) => {
          if (chrome.runtime.lastError != null || resp?.status === 'error') {
            saveBtn.textContent = 'Save failed'
            return
          }
          saveBtn.textContent = resp?.status === 'already-exists' ? '✓ Already saved' : '✓ Saved'
          saveBtn.style.background = '#eef9f0'
          saveBtn.style.borderColor = '#2a8a3c'
          saveBtn.style.color = '#1f6a2c'
        }
      )
    })
  }
  if (btn != null && panel != null) {
    btn.addEventListener('click', () => {
      const open = panel.hasAttribute('hidden') === false
      if (open) {
        panel.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
        btn.classList.remove('is-open')
      } else {
        panel.removeAttribute('hidden')
        btn.setAttribute('aria-expanded', 'true')
        btn.classList.add('is-open')
      }
    })
  }
}

function createFileInputEventListener (callback: (fileContents: string) => void): (event: Event) => void {
  return function (event: Event): void {
    const eventTarget = event.target as HTMLInputElement
    if (eventTarget.files != null && eventTarget.files.length > 0) {
      const file = eventTarget.files[0]
      const reader = new FileReader()
      reader.readAsText(file, 'UTF-8')
      reader.onload = function (evt): void {
        const fileContents = evt?.target?.result as string
        callback(fileContents)
      }
    } else {
    }
  }
}

const trustFileInput = document.getElementById('trust-file-input') as HTMLInputElement
trustFileInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  try {
    // eslint-disable-next-line no-void
    void addTrustFile(fileContents).then(displayTrustListInfos)
  } catch (e) {
  }
}))

const tsaFileInput = document.getElementById('tsa-file-input') as HTMLInputElement
tsaFileInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  try {
    // eslint-disable-next-line no-void
    void addTSATrustFile(fileContents).then(displayTrustListInfos)
  } catch (e) {
  }
}))

/**
 * Displays the trust list info in the popup.
 */
async function displayTrustListInfos (): Promise<void> {
  try {
    const tlis = await getTrustListInfos()
    const trustListInfo = document.getElementById('trust-list-info') as HTMLDivElement | null
    if (trustListInfo == null) return
    trustListInfo.style.display = 'block'

    if (tlis == null || tlis.length === 0) {
      trustListInfo.innerHTML = '<p class="detail-dim">No trust list loaded. Import a trust anchor above, or trust lists will appear here once the background service worker initialises.</p>'
      return
    }

    let listHtml = '<p><b>Active trust lists</b></p><ul>'
    tlis.forEach((tli, index) => {
      const safeName = esc(tli.name ?? '')
      const safeWebsite = esc(tli.website ?? '')
      const listItem = (tli.website.length > 0)
        ? `<li><a href="${safeWebsite}" target="_blank" rel="noopener">${safeName}</a>`
        : `<li>${safeName}`
      listHtml += `${listItem} (<a href="#" class="delete-link" data-index="${index}">delete</a>)</li>`
    })
    listHtml += '</ul>'
    trustListInfo.innerHTML = listHtml
  } catch (err) {
    const trustListInfo = document.getElementById('trust-list-info')
    if (trustListInfo != null) {
      const p = document.createElement('p')
      p.className = 'validation-errors'
      p.textContent = `Trust-list lookup failed (service worker may be warming up — reopen the popup). Details: ${String((err as Error).message ?? err)}`
      trustListInfo.replaceChildren(p)
    }
  }
}

// event listener for trust lists delete link
const trustListInfoElement = document.getElementById('trust-list-info')
if (trustListInfoElement !== null) {
  trustListInfoElement.addEventListener('click', function (event) {
    const target = event.target as HTMLElement
    if (target.classList.contains('delete-link')) {
      event.preventDefault() // Prevent default link action
      const index = target.getAttribute('data-index')
      if (index !== null) {
        void removeTrustList(parseInt(index))
          .then(async () => { await displayTrustListInfos() })
      }
    }
  })
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === MSG_RESPONSE_C2PA_ENTRIES) {
    addValidationResult(request.data as MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD)
  }
})
