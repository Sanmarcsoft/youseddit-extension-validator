/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_DISPLAY_C2PA_OVERLAY, MSG_FORWARD_TO_CONTENT, MSG_UPDATE_FRAME_HEIGHT, MSG_OPEN_OVERLAY } from './constants'
import { type C2paOverlay } from './webComponents'
import { type C2paResult } from './c2pa'

console.debug('%cFRAME:', 'color: blue', window.location.href)

export interface FrameMessage {
  secret: string
  action: string
  data: unknown
}

let _overlay: C2paOverlay | null = null
// Buffer overlay messages that arrive before window.onload fires (#57).
let _pendingOverlay: { c2paResult: C2paResult, position: { x: number, y: number } } | null = null

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug('overlayFrame received runtime message, action=', message?.action, ', senderTabId=', sender?.tab?.id, ', senderFrameId=', sender?.frameId)
  /*
    Populate the IFrame with C2PA validation results for a media element.
  */
  if (message.action === MSG_OPEN_OVERLAY) {
    console.debug('overlayFrame: MSG_OPEN_OVERLAY matched, overlay is', _overlay === null ? 'null (buffering)' : 'ready')
    const c2paResult = message.data.c2paResult as C2paResult
    const position = message.data.position as { x: number, y: number }
    if (_overlay !== null) {
      _overlay.c2paResult = c2paResult
      sendToContent({ action: MSG_DISPLAY_C2PA_OVERLAY, data: { position } })
      console.debug('overlayFrame: forwarded MSG_DISPLAY_C2PA_OVERLAY to content, position=', position)
    } else {
      // window.onload hasn't fired yet — buffer and apply on load
      _pendingOverlay = { c2paResult, position }
    }
  }
})

document.addEventListener('DOMContentLoaded', () => {
})

// DOMContentLoaded is too early to access c2pa-overlay, so we wait for window.onload
window.onload = () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  _overlay = document.querySelector('c2pa-overlay')!
  resizeObserver.observe(document.body)
  if (_pendingOverlay !== null) {
    _overlay.c2paResult = _pendingOverlay.c2paResult
    sendToContent({ action: MSG_DISPLAY_C2PA_OVERLAY, data: { position: _pendingOverlay.position } })
    _pendingOverlay = null
  }
}

const resizeObserver = new ResizeObserver(entries => {
  // We are only observing the body element, so expect only one entry
  for (const entry of entries) {
    const newHeight = Math.floor(entry.contentRect.height)
    sendToContent({ action: MSG_UPDATE_FRAME_HEIGHT, data: newHeight })
  }
})

function sendToContent (message: unknown): void {
  void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
}
