/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_DISPLAY_C2PA_OVERLAY, MSG_FRAME_CLICK, MSG_REMOTE_INSPECT_URL } from './constants'
import { C2paOverlay } from './overlay'
// NOTE (#57): do not import c2pa here. c2pa spawns a Worker from
// chrome-extension://.../c2pa.worker.js which is blocked when the content
// script runs on a web origin. The real validation path goes through
// inject.ts -> MSG_VALIDATE_URL -> background service worker, where the
// Worker is allowed.

export type MediaElement = (HTMLImageElement | HTMLVideoElement | HTMLAudioElement)

console.debug('%cCONTENT:', 'color: cornsilk', window.location.href)

/*
  This is the overlay that will be displayed when a media element is validated.
*/
const overlay = C2paOverlay.overlay

/*
  The https://contentintegrity.microsoft.com/check page does not support validating a url from a query parameter.
  So we have the extension detect when the https://contentintegrity.microsoft.com/check is active and paste the url into the input field.
  This assumes that the page structure does not change.
*/
function pasteUrlIntoInput (url: string): void {
  // are we already on the validation where we have to click the 'Check another file' button?
  const checkAnotherFileButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Check another file')
  if (checkAnotherFileButton != null) {
    checkAnotherFileButton.click()
  }

  // If the above button was clicked, we need to queue the URL to be pasted after the page has transitioned
  setTimeout(() => {
    const textInput: HTMLInputElement | null = document.querySelector('input[type="text"]')
    if (textInput == null) {
      return
    }
    textInput.value = decodeURIComponent(url)
    // send input event or page will believe the input is still empty
    textInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  }, 0)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /*
    Populate the IFrame with C2PA validation results for a media element.
  */
  if (message.action === MSG_DISPLAY_C2PA_OVERLAY) {
    overlay.show(message.data.position.x as number, message.data.position.y as number)
  }

  if (message.action === MSG_REMOTE_INSPECT_URL) {
    const url = message.data as string
    pasteUrlIntoInput(url)
  }

  if (message.action === MSG_FRAME_CLICK) {
    overlay.hide()
  }
})

// Duplicate image-processing observer removed (#57). inject.ts is the single
// source of truth for image discovery + validation. This script only bridges
// overlay messages between the background worker and the page.
