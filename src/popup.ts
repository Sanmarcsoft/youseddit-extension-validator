/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type TrustListInfo, getTrustListInfos, removeTrustList, addTSATrustFile, addTrustFile } from './trustlistProxy.js'
import packageManifest from '../package.json'
import { BUILD_INFO } from './build-info'
import { AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED, MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES } from './constants.js'
import { type MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD } from './inject.js'
import { type ToggleSwitch } from './components/toggle.js'

console.debug('popup.js: load')

function setText (id: string, value: string): void {
  const el = document.getElementById(id)
  if (el !== null) el.textContent = value
}

function setHref (id: string, url: string): void {
  const el = document.getElementById(id) as HTMLAnchorElement | null
  if (el !== null) el.href = url
}

function populateBuildInfo (): void {
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

document.addEventListener('DOMContentLoaded', function (): void {
  populateBuildInfo()

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
    })
  })
  void showResults()
  // Pre-warm trust-list data so the Options tab is ready to render
  // as soon as it's selected, not after a perceptible delay (#59/#60).
  void displayTrustListInfos()
})

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
    <div class="v-row" data-status="${esc(r.status)}">
      <button class="v-summary" data-target="${rowId}" aria-expanded="false">
        <img class="v-status-icon" src="${esc(icon)}" alt="${esc(statusText)}">
        <img class="v-thumb" src="${esc(thumbSrc)}" alt="">
        <div class="v-name">${esc(decodeURIComponent(r.name))}</div>
        <span class="v-pill ${statusCls}">${esc(statusText)}</span>
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
      console.debug('No file selected')
    }
  }
}

const trustFileInput = document.getElementById('trust-file-input') as HTMLInputElement
trustFileInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  try {
    // eslint-disable-next-line no-void
    void addTrustFile(fileContents).then(displayTrustListInfos)
  } catch (e) {
    console.error('Can\'t parse trust file')
  }
}))

const tsaFileInput = document.getElementById('tsa-file-input') as HTMLInputElement
tsaFileInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  try {
    // eslint-disable-next-line no-void
    void addTSATrustFile(fileContents).then(displayTrustListInfos)
  } catch (e) {
    console.error('Can\'t parse TSA trust file')
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
      const listItem = (tli.website.length > 0)
        ? `<li><a href="${tli.website}" target="_blank">${tli.name}</a>`
        : `<li>${tli.name}`
      listHtml += `${listItem} (<a href="#" class="delete-link" data-index="${index}">delete</a>)</li>`
    })
    listHtml += '</ul>'
    trustListInfo.innerHTML = listHtml
  } catch (err) {
    const trustListInfo = document.getElementById('trust-list-info')
    if (trustListInfo != null) {
      trustListInfo.innerHTML = `<p class="validation-errors">Trust-list lookup failed (service worker may be warming up — reopen the popup). Details: ${String((err as Error).message ?? err)}</p>`
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
