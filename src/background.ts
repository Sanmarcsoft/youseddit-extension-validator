/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import 'c2pa'
import { validateUrl as c2paValidateUrl } from './c2paProxy'
import { init as initTrustlist, checkTrustListInclusion, refreshTrustLists, checkTSATrustListInclusion } from './trustlist'
import { type C2paError, type C2paResult } from './c2pa'
import {
  MSG_GET_ID, MSG_L3_INSPECT_URL, MSG_REMOTE_INSPECT_URL, MSG_FORWARD_TO_CONTENT, REMOTE_VALIDATION_LINK,
  MSG_VALIDATE_URL, AWAIT_ASYNC_RESPONSE, MSG_C2PA_RESULT_FROM_CONTEXT, AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED,
  TRUSTLIST_UPDATE_INTERVAL, MSG_SAVE_BOOKMARK
} from './constants'
import { saveVerificationBookmark, type SaveBookmarkRequest } from './bookmarks'
import { sendMessageToAllTabs } from './utils'
// rc11.6 / #83 — Intentionally NOT importing verifiedditApi. rc12 shipped
// an anonymous cross-origin fallback that fired on every unsigned image;
// that is a security / privacy surface and must not run in production
// without per-install auth + user consent + server-side rate limits.
// Reintroducing any call here requires #83's acceptance criteria.
// import { validateImageUrl as apiValidate, isApiFailure, type RecoveredCredential } from './verifiedditApi'

// Catch initTrustlist rejection so an unhandled rejection in the SW
// (e.g. corrupt bundled JSON, storage quota) doesn't leave the service
// worker silent. The popup reads trustListsInitError from chrome.storage
// .session and renders a banner so the user sees what's wrong.
initTrustlist().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  void chrome.storage.session?.set({ trustListsInitError: message })
})

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    void chrome.storage.local.set({ autoScan: AUTO_SCAN_DEFAULT })
  } else if (details.reason === 'update') {
    // rc11.7 / #86 — one-shot migration to force auto-scan OFF for any
    // user who was silently stuck on the old rc<=11.6 build where
    // AUTO_SCAN=true was baked into the bundle as the install default.
    // Users who genuinely want auto-scan back on can re-enable via the
    // Options tab; doing so on every update would be rude, so we gate
    // on a one-shot marker.
    void chrome.storage.local.get('rc117AutoScanMigrationDone').then((stored) => {
      if (stored?.rc117AutoScanMigrationDone !== true) {
        void chrome.storage.local.set({ autoScan: false, rc117AutoScanMigrationDone: true })
      }
    })
  } else if (details.reason === 'chrome_update') {
  }
  createContextMenu()
})

function createContextMenu (): void {
  chrome.contextMenus.create({
    id: 'validateMediaElement',
    title: 'Verify with Verifieddit.',
    contexts: ['audio', 'image', 'video'],
    documentUrlPatterns: ['<all_urls>']
  })
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.srcUrl
  if (url == null) {
    return
  }

  void validateUrl(url).then(c2paResult => {
    if (c2paResult instanceof Error) {
      return
    }
    const message = { action: MSG_C2PA_RESULT_FROM_CONTEXT, data: { url, c2paResult, frame: info.frameId } }
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => { /* tab may not have a content-script listener */ })
    }
  })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id
  const action = message.action
  const data = message.data

  if (action === MSG_GET_ID) {
    sendResponse({ tab: tabId, frame: sender.frameId })
  }

  if (action === MSG_L3_INSPECT_URL) {
    // Open verifieddit.com with the image URL pre-populated via ?url=.
    // (#74) Replaces the upstream "paste into Microsoft Content Integrity's
    // HTMLInputElement via MutationObserver" dance, which was tied to
    // Microsoft's page DOM and is no longer the target validator page.
    void openOrSwitchToTab(data as string)
  }

  if (action === MSG_FORWARD_TO_CONTENT && tabId != null) {
    chrome.tabs.sendMessage(tabId, data).catch(() => { /* content script may be absent on this tab */ })
  }

  if (action === MSG_VALIDATE_URL) {
    void validateUrl(data as string).then(sendResponse)
    return AWAIT_ASYNC_RESPONSE
  }

  if (action === MSG_AUTO_SCAN_UPDATED) {
    void chrome.storage.local.set({ autoScan: data })
    void sendMessageToAllTabs({ action: MSG_AUTO_SCAN_UPDATED, data })
  }

  // rc14 / #93 — Save Verification bookmark. Content script fires this;
  // background has chrome.bookmarks.* and returns the structured result
  // (created | already-exists | error) so the overlay can show a toast.
  if (action === MSG_SAVE_BOOKMARK) {
    const req = data as SaveBookmarkRequest
    void saveVerificationBookmark(req).then((result) => { sendResponse(result) })
    return AWAIT_ASYNC_RESPONSE
  }
})

async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  const c2paResult = await c2paValidateUrl(url);
  
  if (c2paResult instanceof Error) {
    // rc11.6 / #83 — removed the anonymous cross-origin verifieddit.com
    // API fallback that rc12 shipped here. See issue #83 for context.
    return c2paResult;
  }

  
  // Check trust list inclusion
  c2paResult.trustList = checkTrustListInclusion(c2paResult.certChain ?? []);
  
  // Check TSA trust list inclusion if TST tokens exist
  if (c2paResult.tstTokens != null && c2paResult.tstTokens.length > 0) {
    const tstToken = c2paResult.tstTokens[0]; // TODO: for each token
    c2paResult.tsaTrustList = checkTSATrustListInclusion(tstToken.certChain ?? []);
  } else {
  }

  // rc11.6 / #83 — removed the anonymous cross-origin verifieddit.com
  // API fallback that rc12 shipped here. Reintroducing the path requires
  // per-install auth + server-side rate limiting + user consent per #83.

  return c2paResult;
}

// rc11.6 / #83 — synthesiseRecoveredC2paResult helper removed along with the
// anonymous cross-origin API calls. When the per-install auth story lands
// (tracked in #83 follow-up), reintroduce this together with the call sites.

async function openOrSwitchToTab (imageUrl: string): Promise<chrome.tabs.Tab> {
  // Build the Verifieddit /check URL with the image URL as a query parameter.
  // (#74) Always open a NEW tab — reusing the existing tab loses the previous
  // inspection, and matching a pre-existing tab by REMOTE_VALIDATION_LINK
  // exactly no longer works once the URL carries per-image query params.
  const target = new URL(REMOTE_VALIDATION_LINK)
  target.searchParams.set('url', imageUrl)
  return await chrome.tabs.create({ url: target.toString() })
}

// trust list refresh alarm (run once a day) TODO: create an option
function setupTrustListRefreshAlarm (): void {
  void chrome.alarms.create('trustListRefreshAlarm', { delayInMinutes: 1, periodInMinutes: TRUSTLIST_UPDATE_INTERVAL })
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'trustListRefreshAlarm') {
    refreshTrustLists()
      .then(() => {})
      .catch((error) => {})
  }
})

chrome.runtime.onInstalled.addListener(() => {
  setupTrustListRefreshAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  setupTrustListRefreshAlarm()
})

