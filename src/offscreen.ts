/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { createC2pa, type C2pa } from 'c2pa'
import { type C2paError } from './c2pa'
import {
  MSG_C2PA_VALIDATE_URL_OFFSCREEN,
  AWAIT_ASYNC_RESPONSE,
  MSG_OFFSCREEN_READY,
  MSG_OFFSCREEN_INIT_ERROR,
  MSG_PING_OFFSCREEN,
  MSG_OFFSCREEN_KEEPALIVE
} from './constants'

const KEEPALIVE_INTERVAL_MS = 20 * 1000 // 20 seconds

if (typeof Worker === 'undefined' && typeof self?.Worker !== 'undefined') {
  // Make self.Worker available as the global Worker
  (globalThis as typeof globalThis & { Worker?: typeof self.Worker }).Worker = self.Worker
} else if (typeof Worker !== 'undefined') {
} else {
}

let c2pa: C2pa | null = null
let c2paInitializationPromise: Promise<C2pa | null> | null = null

async function initC2paOffscreen (): Promise<C2pa | null> {
  if (c2pa !== null) {
    return c2pa
  }
  if (c2paInitializationPromise !== null) {
    return await c2paInitializationPromise
  }

  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  c2paInitializationPromise = (async () => {
    try {
      const instance = await createC2pa({ workerSrc: workerUrl, wasmSrc: wasmUrl })
      c2pa = instance // Assign to global c2pa instance once successful
      return instance
    } catch (error) {
      c2pa = null // Ensure c2pa is null if initialization fails
      c2paInitializationPromise = null // Reset promise so retry can happen
      throw error // Re-throw to be caught by callers
    }
  })()
  return await c2paInitializationPromise
}

// Define the message listener callback function
const handleIncomingMessages = (
  message: { action: string, data?: unknown }, // A more specific type for message
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void // Changed any to unknown
): boolean | undefined => {
  const { action, data } = message

  if (action === MSG_C2PA_VALIDATE_URL_OFFSCREEN) {
    const url = data as string

    // Use an IIFE for the asynchronous operation
    void (async () => {
      try {
        let localC2paInstance = c2pa
        if (localC2paInstance === null) {
          localC2paInstance = await initC2paOffscreen()
        }

        if (localC2paInstance === null) {
          const errorResponse: C2paError = { name: 'C2PAInitError', message: 'C2PA could not be initialized in offscreen document', url }
          sendResponse(errorResponse)
          return
        }

        const readResult = await localC2paInstance.read(url)
        sendResponse(readResult)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorName = error instanceof Error && error.name !== 'Error' ? error.name : 'C2PAProcessingError'
        const errorResponse: C2paError = { name: errorName, message: errorMessage, url }
        sendResponse(errorResponse)
      }
    })() // Invoke the async IIFE

    return AWAIT_ASYNC_RESPONSE // Crucial for async sendResponse
  } else if (action === MSG_PING_OFFSCREEN) {
    void (async () => {
      try {
        if (c2pa === null) {
          await initC2paOffscreen() // This will set global c2pa or throw
        }
        // After attempt, check again
        if (c2pa !== null) {
          // Do not use sendResponse here. The background script has a generic listener.
          void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_READY })
        } else {
          // This case should ideally be caught by initC2paOffscreen's throw
          void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_INIT_ERROR, data: { name: 'C2PAStillNullAfterPingReinit', message: 'C2PA instance null after ping re-init' } })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorName = error instanceof Error && error.name !== 'Error' ? error.name : 'C2PAPingReinitError'
        void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_INIT_ERROR, data: { name: errorName, message: errorMessage, stack: error instanceof Error ? error.stack : undefined } })
      }
    })()

    // We are not using sendResponse for this message, so we can return false.
    // The async work will send a new message to the background script.
    return false
  }
  // Default for unhandled actions if not returning true for async
  return false // Explicitly return false if not handled and not async
}
// Add the listener
chrome.runtime.onMessage.addListener(handleIncomingMessages)

// Initial attempt to initialize C2PA when the offscreen document loads.
setInterval(() => {
  void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_KEEPALIVE })
}, KEEPALIVE_INTERVAL_MS)

// Initial attempt to initialize C2PA when the offscreen document loads.
// Send a message to the background script indicating success or failure.
void (async () => {
  try {
    await initC2paOffscreen()
    void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_READY })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error && error.name !== 'Error' ? error.name : 'C2PAInitErrorOffscreen'
    void chrome.runtime.sendMessage({
      action: MSG_OFFSCREEN_INIT_ERROR,
      data: { name: errorName, message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
    })
  }
})()
