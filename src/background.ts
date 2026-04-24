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
  MSG_LOG_MESSAGE, MSG_GET_LOGS, TRUSTLIST_UPDATE_INTERVAL
} from './constants'
import { sendMessageToAllTabs } from './utils'
// rc11.6 / #83 — Intentionally NOT importing verifiedditApi. rc12 shipped
// an anonymous cross-origin fallback that fired on every unsigned image;
// that is a security / privacy surface and must not run in production
// without per-install auth + user consent + server-side rate limits.
// Reintroducing any call here requires #83's acceptance criteria.
// import { validateImageUrl as apiValidate, isApiFailure, type RecoveredCredential } from './verifiedditApi'

const MAX_LOG_ENTRIES = 200 // Limit the number of log entries to store
let extensionLogs: string[] = []

console.debug('Background: Script: start')

void initTrustlist()

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    console.debug('This is a first-time install!')
    void chrome.storage.local.set({ autoScan: AUTO_SCAN_DEFAULT })
  } else if (details.reason === 'update') {
    console.debug('The extension has been updated to version:', chrome.runtime.getManifest().version)
  } else if (details.reason === 'chrome_update') {
    console.debug('Chrome has been updated.')
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
      console.error('Error validating URL:', c2paResult)
      return
    }
    const message = { action: MSG_C2PA_RESULT_FROM_CONTEXT, data: { url, c2paResult, frame: info.frameId } }
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => { /* tab may not have a content-script listener */ })
    }
  })
})

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    console.debug('Background: Intercepted image request: ', details.url, 'color: #2784BC;')
  },
  { urls: ['*://*/*.jpg', '*://*/*.mp4'] }
)

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

  if (action === MSG_LOG_MESSAGE) {
    const logEntry = data as string
    extensionLogs.push(logEntry)
    if (extensionLogs.length > MAX_LOG_ENTRIES) {
      extensionLogs.shift() // Remove the oldest entry
    }
  }

  if (action === MSG_GET_LOGS) {
    sendResponse(extensionLogs)
    return AWAIT_ASYNC_RESPONSE
  }
})

async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  console.debug(`Background: validateUrl: Starting validation for: ${url}`);
  const c2paResult = await c2paValidateUrl(url);
  
  if (c2paResult instanceof Error) {
    // rc11.6 / #83 — removed the anonymous cross-origin verifieddit.com
    // API fallback that rc12 shipped here. See issue #83 for context.
    console.error(`Background: validateUrl: Error from c2paValidateUrl for ${url}:`, c2paResult);
    return c2paResult;
  }

  console.debug(`Background: validateUrl: Initial c2paResult for ${url}:`, c2paResult);
  
  // Check trust list inclusion
  c2paResult.trustList = checkTrustListInclusion(c2paResult.certChain ?? []);
  console.debug(`Background: validateUrl: trustList after check for ${url}:`, c2paResult.trustList);
  
  // Check TSA trust list inclusion if TST tokens exist
  if (c2paResult.tstTokens != null && c2paResult.tstTokens.length > 0) {
    const tstToken = c2paResult.tstTokens[0]; // TODO: for each token
    c2paResult.tsaTrustList = checkTSATrustListInclusion(tstToken.certChain ?? []);
    console.debug(`Background: validateUrl: tsaTrustList after check for ${url}:`, c2paResult.tsaTrustList);
  } else {
    console.debug(`Background: validateUrl: No TST tokens found for ${url}.`);
  }

  // rc11.6 / #83 — removed the anonymous cross-origin verifieddit.com
  // API fallback that rc12 shipped here. Reintroducing the path requires
  // per-install auth + server-side rate limiting + user consent per #83.

  console.debug(`Background: validateUrl: Final c2paResult before returning for ${url}:`, c2paResult);
  return c2paResult;
}

// rc11.6 / #83 — synthesiseRecoveredC2paResult helper removed along with the
// anonymous cross-origin API calls. When the per-install auth story lands
// (tracked in #83 follow-up), reintroduce this together with the call sites.

async function init (): Promise<void> {
  if (chrome.offscreen !== undefined) {
    if (await chrome.offscreen.hasDocument()) {
      return
    }
    await chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.DOM_PARSER, chrome.offscreen.Reason.WORKERS],
        justification: 'Parse C2PA manifest DOM and run WebAssembly verification in a Web Worker (both forbidden in MV3 service workers)'
      })
      .catch((error) => {
        console.error('Failed to create offscreen document', error)
      })
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/cr128.png',
    title: 'Content Credentials',
    message: 'Loaded'
  })
}

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
      .then(() => { console.debug('Trust lists refresh completed successfully.') })
      .catch((error) => { console.error('Error refreshing trust lists:', error) })
  }
})

chrome.runtime.onInstalled.addListener(() => {
  console.debug('Extension installed. Setting up trust list refresh alarm.')
  setupTrustListRefreshAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  console.debug('Browser started. Ensuring trust list refresh alarm is active.')
  setupTrustListRefreshAlarm()
})

void init()

console.debug('Background: Script: end')
