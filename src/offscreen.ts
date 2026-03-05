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
  console.debug('Offscreen: Shimmed global Worker with self.Worker')
} else if (typeof Worker !== 'undefined') {
  console.debug('Offscreen: Global Worker is already defined.')
} else {
  console.warn('Offscreen: self.Worker is not available to shim global Worker.')
}

console.debug('Offscreen: Script loaded')

let c2pa: C2pa | null = null
let c2paInitializationPromise: Promise<C2pa | null> | null = null

async function initC2paOffscreen (): Promise<C2pa | null> {
  if (c2pa !== null) {
    console.debug('Offscreen: C2PA instance already available.')
    return c2pa
  }
  if (c2paInitializationPromise !== null) {
    console.debug('Offscreen: C2PA initialization already in progress.')
    return await c2paInitializationPromise
  }

  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  c2paInitializationPromise = (async () => {
    try {
      console.debug('Offscreen: Initializing C2PA with workerUrl:', workerUrl, 'wasmUrl:', wasmUrl)
      const instance = await createC2pa({ workerSrc: workerUrl, wasmSrc: wasmUrl })
      console.debug('Offscreen: C2PA initialized successfully.')
      c2pa = instance // Assign to global c2pa instance once successful
      return instance
    } catch (error) {
      console.error('Offscreen: Error initializing C2PA:', error)
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
  console.debug('Offscreen: Message received:', message)
  const { action, data } = message

  if (action === MSG_C2PA_VALIDATE_URL_OFFSCREEN) {
    const url = data as string
    console.debug(`Offscreen: Handling MSG_C2PA_VALIDATE_URL_OFFSCREEN for URL: ${url}`)

    // Use an IIFE for the asynchronous operation
    void (async () => {
      try {
        let localC2paInstance = c2pa
        if (localC2paInstance === null) {
          console.debug('Offscreen: C2PA not yet initialized, awaiting initialization...')
          localC2paInstance = await initC2paOffscreen()
        }

        if (localC2paInstance === null) {
          console.error('Offscreen: C2PA could not be initialized.')
          const errorResponse: C2paError = { name: 'C2PAInitError', message: 'C2PA could not be initialized in offscreen document', url }
          sendResponse(errorResponse)
          return
        }

        console.debug('Offscreen: C2PA instance obtained, proceeding with validation for URL:', url)
        const readResult = await localC2paInstance.read(url)
        console.debug('Offscreen: Validation result for', url, readResult)
        sendResponse(readResult)
      } catch (error) {
        console.error('Offscreen: Error during validation process for URL:', url, error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorName = error instanceof Error && error.name !== 'Error' ? error.name : 'C2PAProcessingError'
        const errorResponse: C2paError = { name: errorName, message: errorMessage, url }
        sendResponse(errorResponse)
      }
    })() // Invoke the async IIFE

    return AWAIT_ASYNC_RESPONSE // Crucial for async sendResponse
  } else if (action === MSG_PING_OFFSCREEN) {
    console.debug('Offscreen: Received MSG_PING_OFFSCREEN.')
    void (async () => {
      try {
        if (c2pa === null) {
          console.debug('Offscreen (ping): C2PA not initialized, attempting to initialize.')
          await initC2paOffscreen() // This will set global c2pa or throw
        }
        // After attempt, check again
        if (c2pa !== null) {
          console.debug('Offscreen (ping): C2PA instance is valid. Sending MSG_OFFSCREEN_READY back to background.')
          // Do not use sendResponse here. The background script has a generic listener.
          void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_READY })
        } else {
          // This case should ideally be caught by initC2paOffscreen's throw
          console.error('Offscreen (ping): C2PA instance is null even after re-init attempt. Sending MSG_OFFSCREEN_INIT_ERROR.')
          void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_INIT_ERROR, data: { name: 'C2PAStillNullAfterPingReinit', message: 'C2PA instance null after ping re-init' } })
        }
      } catch (error) {
        console.error('Offscreen (ping): Error during C2PA re-initialization attempt:', error)
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
  console.warn(`Offscreen: Unhandled action: ${action}. No response sent.`)
  return false // Explicitly return false if not handled and not async
}
// Add the listener
chrome.runtime.onMessage.addListener(handleIncomingMessages)

// Initial attempt to initialize C2PA when the offscreen document loads.
setInterval(() => {
  console.debug('Offscreen: Sending keep-alive message to background script.')
  void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_KEEPALIVE })
}, KEEPALIVE_INTERVAL_MS)

// Initial attempt to initialize C2PA when the offscreen document loads.
// Send a message to the background script indicating success or failure.
void (async () => {
  try {
    console.debug('Offscreen: Starting initial C2PA initialization on load.')
    await initC2paOffscreen()
    console.debug('Offscreen: Initial C2PA initialization successful. Sending MSG_OFFSCREEN_READY.')
    void chrome.runtime.sendMessage({ action: MSG_OFFSCREEN_READY })
  } catch (error) {
    console.error('Offscreen: Initial C2PA initialization failed on load. Sending MSG_OFFSCREEN_INIT_ERROR.', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error && error.name !== 'Error' ? error.name : 'C2PAInitErrorOffscreen'
    void chrome.runtime.sendMessage({
      action: MSG_OFFSCREEN_INIT_ERROR,
      data: { name: errorName, message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
    })
  }
})()
