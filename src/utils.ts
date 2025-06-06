/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import 'dotenv/config'
import { DEFAULT_MSG_TIMEOUT, type MSG_PAYLOAD } from './constants'

export const DEBUG = process.env.NODE_ENV?.toUpperCase() !== 'PRODUCTION'

export function bytesToHex (uint8Array: Uint8Array): string {
  return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function formatUUID (uuid: string): string {
  return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20)}`
}

export async function blobToDataURL (blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => { resolve(reader.result as string) }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function bytesToBase64 (bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return globalThis.btoa(binary)
}

export function isObject (value: unknown): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}

export function isKeyedObject (value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function base64ToBlob (base64: string): Promise<Blob> {
  return await fetch(`data:;base64,${base64}`).then(async res => await res.blob())
}

export function base64ToArrayBuffer (base64: string): ArrayBuffer {
  const binaryString = globalThis.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function decimalStringToHex (decimalString: string): string {
  // Use BigInt to handle very large numbers
  const bigIntValue = BigInt(decimalString)
  // Convert to hexadecimal
  let hexString = bigIntValue.toString(16)

  // Optional: Ensure the hexadecimal string is prefixed with "0x"
  hexString = '0x' + hexString

  return hexString
}

export function localDateTime (isoDateString: string): string {
  const date = new Date(isoDateString)

  // Use Intl.DateTimeFormat to format the date
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    // hour: 'numeric',
    // minute: 'numeric',
    // second: 'numeric',
    // timeZoneName: 'short',
    hour12: true
  }
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date)
  return formattedDate
}

export async function sendMessageWithTimeout<T> (message: unknown, timeout: number = DEFAULT_MSG_TIMEOUT): Promise<T> {
  const messagePromise = chrome.runtime.sendMessage(message)
    .catch((error) => {
      console.error('Error sending message:', error)
      throw error
    })
  const timeoutPromise = new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id)
      reject(new Error(`Message response timeout: ${JSON.stringify(message)}`))
    }, timeout)
  })
  return await Promise.race([messagePromise, timeoutPromise])
}

export function dataURLtoBlob (dataurl: string): Blob | null {
  // Split the data URL at the comma to get the MIME type and the base64 data
  const arr = dataurl.split(',')
  if (arr.length < 2) {
    return null // Not a valid data URL
  }

  // Get the MIME type from the data URL
  const mimeMatch = arr[0].match(/:(.*?);/)
  if (mimeMatch == null) {
    return null // MIME type not found
  }
  const mimeType = mimeMatch[1]

  // Decode the base64 string to binary data
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)

  // Convert the binary string to a typed array
  while ((n--) !== 0) {
    u8arr[n] = bstr.charCodeAt(n)
  }

  // Create and return a Blob from the typed array
  return new Blob([u8arr], { type: mimeType })
}

export async function sendMessageToAllTabs (message: MSG_PAYLOAD): Promise<void> {
  const tabs = await chrome.tabs.query({})
  tabs.filter(tab => tab.id != null).forEach(function (tab) {
    if (tab.id == null) {
      return
    }
    void chrome.tabs.sendMessage(tab.id, message)
  })
}

export async function getActiveTabId (): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs?.[0]?.id
}
