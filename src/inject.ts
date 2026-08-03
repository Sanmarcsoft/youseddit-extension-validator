/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { type ProvenanceGraph } from './provenanceTypes.js'
import { type MediaElement } from './content'
import { CrIcon } from './icon'
import { checkTrustListInclusion, loadTrustLists } from './trustlist'
import { type MediaRecord } from './mediaRecord'
import * as VisibilityMonitor from './visible'
import { MediaMonitor } from './mediaMonitor' // requires treeshake: { moduleSideEffects: [path.resolve('src/mediaMonitor.ts')] }, in rollup.config.js
import {
  MSG_CHILD_REQUEST, MSG_FRAME_CLICK, MSG_GET_CONTAINER_OFFSET, MSG_PARENT_RESPONSE,
  MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES, MSG_TRUSTLIST_UPDATE, MSG_OPEN_OVERLAY,
  type VALIDATION_STATUS, MSG_FORWARD_TO_CONTENT, MSG_C2PA_RESULT_FROM_CONTEXT, MSG_GET_ID,
  MSG_VALIDATE_URL
} from './constants'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

interface TabAndFrameId {
  tab: number
  frame: number
}

const topLevelFrame = window === window.top
let messageCounter = 0
// const media = new Map<MediaElement, { validation: C2paResult, icon: CrIcon, status: VALIDATION_STATUS }>()
let _id: TabAndFrameId

try {
  void chrome.runtime.sendMessage({ action: MSG_GET_ID })
    .then((id) => { _id = id })
    .catch(() => { /* SW may be suspended at load-time; _id stays undefined, the callers tolerate it */ })
} catch {
  // synchronous throw: extension context invalidated before first call — ignore
}

if (window.location.href.startsWith('chrome-extension:') || window.location.href.startsWith('moz-extension:')) {
  throw new Error('Ignoring extension IFrame')
}

window.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === MSG_CHILD_REQUEST) {
    if (event.source == null) {
      throw new Error('event.source is null')
    }
    const sender = findChildFrame(event.source)
    if (sender === null) {
      return // not from a child frame
    }
    const payload = message.data
    if (payload?.type === MSG_GET_CONTAINER_OFFSET) {
      const contentWindow = sender.contentWindow
      if (contentWindow === null) {
        throw new Error('contentWindow is null')
      }
      void getParentOffset().then((parentOffsets) => {
        const senderRect = sender.getBoundingClientRect()
        const combinedOffset = combineOffsets(senderRect, parentOffsets)
        contentWindow.postMessage({ type: MSG_PARENT_RESPONSE, data: combinedOffset, id: message.id }, event.origin)
      })
    }
  }
})

function findChildFrame (sender: MessageEventSource): HTMLIFrameElement | null {
  const childIFrames = Array.from(document.querySelectorAll('iframe'))
  for (const iframe of childIFrames) {
    const contentWindow = iframe.contentWindow
    if (contentWindow === null) {
      throw new Error('contentWindow is null')
    }
    if (sender === contentWindow) {
      return iframe
    }
  }
  // child frames not found, look for shadow roots
  const divs = Array.from(document.getElementsByTagName('div'))
  const shadowRoots = divs.filter(div => div.shadowRoot != null) as HTMLElement[]
  for (const shadowRoot of shadowRoots) {
    const iFrames = Array.from(shadowRoot.shadowRoot?.querySelectorAll('iframe') ?? [])
    for (const iframe of iFrames) {
      const contentWindow = iframe.contentWindow
      if (contentWindow === null) {
        throw new Error('contentWindow is null')
      }
      if (sender === contentWindow) {
        return iframe
      }
    }
  }

  return null
}

async function postWithResponse <T> (message: unknown): Promise<T> {
  return await new Promise((resolve) => {
    const counter = messageCounter++
    const listener = (event: MessageEvent): void => {
      if (event.data.id === counter && event.data.type === MSG_PARENT_RESPONSE && event.source === window.parent) {
        resolve(event.data.data as T)
        window.removeEventListener('message', listener)
      }
    }
    window.addEventListener('message', listener)
    // #123: drop `src: document.location.href` — the receiver never reads it and
    // it leaked the frame URL to any listener. The remaining payload is
    // non-sensitive frame-geometry coordination; the receiver authenticates the
    // sender via `event.source === window.parent`.
    window.parent.postMessage({ type: MSG_CHILD_REQUEST, data: message, id: counter }, '*')
  })
}

async function handleValidationResult (mediaElement: MediaElement, c2paResult: C2paResult | C2paError): Promise<void> {
  // rc11.7 / #86 — the user explicitly right-click → Verify'd this image.
  // Always produce a visible interactive icon, even when the result has
  // no embedded C2PA manifest. Previously this path early-returned and
  // the user saw nothing happen. The 'no-credentials' badge now renders
  // a distinct grey-camera-with-red-slash so users can see the verifier
  // DID run and found nothing.
  const mediaRecord = MediaMonitor.lookup(mediaElement)
  if (mediaRecord == null) {
    return
  }

  if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
    const failure = c2paResult as C2paError
    const name = failure.name
    const url = failure?.url ?? mediaRecord.src

    // "We looked and found nothing" and "we could not look" are different
    // claims, and only the first one is a statement about the file. Reporting
    // a fetch failure or an uninitialised engine as "this file has no C2PA
    // manifest" tells the user a signed asset is unsigned — the worst verdict
    // a verifier can get wrong. Both branches previously fell through to the
    // same 'no-credentials' badge.
    if (name === 'No Manifest') {
      // Create (or update) an icon in the 'no-credentials' state so the
      // user gets clear feedback. Click handler opens a minimal panel —
      // no API call, just explanatory text (respects #83 security baseline).
      ensureNoCredentialsIcon(mediaRecord, url)
    } else {
      ensureVerificationFailedIcon(mediaRecord, url, failure.message ?? 'unknown error')
    }
    return
  }

  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)
}

function ensureNoCredentialsIcon (mediaRecord: MediaRecord, url: string): void {
  if (mediaRecord.icon != null) {
    mediaRecord.icon.status = 'no-credentials'
    mediaRecord.icon.setMetadataLink(url)
    mediaRecord.icon.show()
    return
  }
  mediaRecord.onReady = (mr: MediaRecord): void => {
    mr.icon = new CrIcon(mr.element, 'no-credentials')
    mr.icon.setMetadataLink(url)
    mr.icon.onClick = async () => {
      const note = `No embedded content credentials were found for this image. ` +
        `The file has no C2PA manifest, so nothing cryptographic can be verified locally.`
      showNoCredentialsToast(note, url)
    }
  }
}

function ensureVerificationFailedIcon (mediaRecord: MediaRecord, url: string, detail: string): void {
  const note = `Verification could not be completed for this image, so its ` +
    `Content Credentials are unknown. This is NOT a finding that the file is ` +
    `unsigned — the check itself failed. Details: ${detail}`

  if (mediaRecord.icon != null) {
    mediaRecord.icon.status = 'error'
    mediaRecord.icon.setMetadataLink(url)
    mediaRecord.icon.show()
    return
  }
  mediaRecord.onReady = (mr: MediaRecord): void => {
    mr.icon = new CrIcon(mr.element, 'error')
    mr.icon.setMetadataLink(url)
    mr.icon.onClick = async () => {
      showNoCredentialsToast(note, url)
    }
  }
}

async function getParentOffset (): Promise<Rect> {
  if (topLevelFrame) {
    return {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      left: 0
    }
  }
  return await postWithResponse<DOMRect>({ type: MSG_GET_CONTAINER_OFFSET })
}

async function getOffsets (element: HTMLElement): Promise<Rect> {
  const parentOffset = await getParentOffset()
  const mediaElementOffset = element.getBoundingClientRect()
  const combinedOffset = combineOffsets(mediaElementOffset, parentOffset)
  return combinedOffset
}

function combineOffsets (offset: Rect, parent: Rect): Rect {
  try {
    return {
      x: offset.x + parent.x,
      y: offset.y + parent.y,
      width: offset.width,
      height: offset.height,
      top: offset.top + parent.top,
      right: offset.right + parent.right,
      bottom: offset.bottom + parent.bottom,
      left: offset.left + parent.left
    }
  } catch (error) {
    throw new Error('Error combining offsets')
  }
}

async function sendMessageWithRetry <T> (message: unknown, retries = 3, delay = 500): Promise<T | Error> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.runtime.sendMessage(message) as T;
      return response;
    } catch (error: any) {
      if (error.message.includes('Extension context invalidated') || error.message.includes('Receiving end does not exist')) {
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          return new Error(`Failed to send message after ${retries} retries: ${error.message}`);
        }
      } else {
        return new Error(`Failed to send message: ${error.message}`);
      }
    }
  }
  return new Error('Unknown error in sendMessageWithRetry'); // Should not be reached
}

async function c2paValidateImage (url: string): Promise<C2paResult | C2paError> {
  const result = await sendMessageWithRetry<C2paResult | C2paError>({ action: MSG_VALIDATE_URL, data: url });
  if (result instanceof Error) {
    return result as C2paError;
  }
  return result;
}

/*
  Detect clicks within this frame and notify the content script. This is used to hide the overlay.
  When the overlay is displayed, the user can click anywhere on the page to hide the overlay.
  However when the user clicks within an IFrame, no click event occurs in the main window.

  The overlayFrame listens for this message and forwards it to the content script.
*/
document.addEventListener('click', (event) => {
  sendToContent({ action: MSG_FRAME_CLICK, data: null })
})

export interface IngredientSummary {
  title: string
  format: string
  thumbnail: string | null
  parentManifest: string
}

export interface MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD {
  name: string
  status: VALIDATION_STATUS
  thumbnail: string | null
  // Original image URL, used to populate each popup row's data-url and the
  // "Inspect on Verifieddit" deep link.
  url: string
  // rc9 (#59) — detail fields rendered inside the expandable Validation row
  signer: string
  trustListName: string | null
  trustListEntity: string | null
  isAIDetected: boolean
  manifestCount: number
  activeManifest: string
  certIssuer: string | null
  certSubject: string | null
  hasTSA: boolean
  validationErrors: string[]
  ingredients: IngredientSummary[]
  /**
   * The full provenance graph, so the popup can draw the same diagram the
   * overlay draws. Previously the popup received only the flattened
   * `ingredients` list, which is why the Validation tab could never show a
   * diagram: the data simply never crossed the message boundary.
   *
   * Null when the graph could not be built — the popup falls back to the
   * ingredient tree, exactly as the overlay falls back to its grid.
   */
  provenanceGraph: ProvenanceGraph | null
}

async function updateTrustLists (): Promise<void> {
  await loadTrustLists()
  for (const mediaRecord of MediaMonitor.all) {
    if (mediaRecord.state.c2pa?.certChain == null) continue
    mediaRecord.state.c2pa.trustList = await checkTrustListInclusion(mediaRecord.state.c2pa.certChain)
    setIcon(mediaRecord)
  }
}

// A validation_status code is a real INTEGRITY failure (→ red 'error' badge)
// unless it is merely a trust/expiry signal. signingCredential.untrusted means
// the signer is not in the trust list (surfaced as the amber 'warning' state);
// .expired is a cert-validity signal. Neither means the content was altered, so
// neither should turn the badge red. Mirrors isFatalValidationCode in
// webComponents.ts — keep the two in sync.
const NON_FATAL_VALIDATION_CODE = /\.(untrusted|expired)$/i
function hasFatalValidation (codes: string[] | undefined | null): boolean {
  return (codes ?? []).some((c) => c !== '' && !NON_FATAL_VALIDATION_CODE.test(c))
}

function getC2PAStatus(c2pa: C2paResult): VALIDATION_STATUS {

  // AI status comes from what the asset DECLARES about its own content (the
  // IPTC digitalSourceType in its c2pa.actions assertion), not from which
  // trust list its signer matched. Matching on the "AI trust list" labelled
  // any file signed under Microsoft's CA as AI-generated, photographs
  // included, and missed genuine AI output from every other vendor.
  if (c2pa.aiGeneration !== 'none') {
    if (hasFatalValidation(c2pa.manifestStore.validationStatus)) {
      return 'ai-error';
    }
    return 'ai-success';
  }

  // make sure we have a manifest store and validation result
  if (!c2pa.manifestStore.validationStatus) {
    return 'error'; // Should not happen if manifestStore exists
  }
  // if there are genuine integrity failures, return the error status. Untrusted/
  // expired signers are NOT failures — they fall through to the trust-list check
  // below and surface as the amber 'warning' state.
  if (hasFatalValidation(c2pa.manifestStore.validationStatus)) {
    return 'error';
  }
  // if there is no trust list, return the warning status
  if (c2pa.trustList == null) {
    return 'warning';
  }
  // if the cert is expired, make sure the TSA time stamp is trusted
  // (no easy way to check that, we need to check the cert chain)
  if (c2pa.certChain && c2pa.certChain.length > 0 && new Date(c2pa.certChain[0].validTo) < new Date()) {
    // cert is expired, make sure we have a match in the TSA trust list (if not, timestamp must be ignored)
    if (c2pa.tstTokens == null || c2pa.tsaTrustList == null) {
      // add an error to the validation status
      c2pa.manifestStore.validationStatus.push('certificate is expired and no trusted timestamp found');
      return 'error';
    }
  }
  // otherwise, return the success status
  return 'success';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null || data === undefined) return

  if (message.action === MSG_REQUEST_C2PA_ENTRIES) {
    void (async () => {
      const c2paEntries = MediaMonitor.all.filter((mediaRecord) => mediaRecord.state.c2pa != null)
      c2paEntries.forEach((entry) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const c2pa = entry.state.c2pa!
        const activeManifest = c2pa.manifestStore.manifests[c2pa.manifestStore.activeManifest as unknown as keyof typeof c2pa.manifestStore.manifests]
        const certChain = c2pa.certChain ?? []
        const signingCert = certChain[0]
        const manifestArr = Object.values(c2pa.manifestStore.manifests ?? {}) as Array<{ title?: string, ingredients: Array<{ title: string, format: string, thumbnail: { data: string, type: string } }> }>
        const ingredients: IngredientSummary[] = []
        for (const m of manifestArr) {
          for (const ing of m.ingredients ?? []) {
            ingredients.push({
              title: ing.title ?? '(untitled)',
              format: ing.format ?? '',
              thumbnail: (ing.thumbnail?.data !== '' ? ing.thumbnail?.data : null) ?? null,
              parentManifest: m.title ?? '(unnamed manifest)'
            })
          }
        }
        const response: MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD = {
          name: c2pa.source.filename,
          status: getC2PAStatus(c2pa),
          thumbnail: c2pa.source.thumbnail.data,
          url: c2pa.url,
          signer: (activeManifest as unknown as { signatureInfo?: { issuer?: string } })?.signatureInfo?.issuer ?? signingCert?.subject?.CN ?? '(unknown signer)',
          trustListName: c2pa.trustList?.tlInfo.name ?? null,
          trustListEntity: c2pa.trustList?.entity?.name ?? null,
          isAIDetected: c2pa.aiGeneration !== 'none',
          manifestCount: manifestArr.length,
          activeManifest: (activeManifest as unknown as { title?: string })?.title ?? '(unnamed)',
          certIssuer: signingCert?.issuer?.CN ?? null,
          certSubject: signingCert?.subject?.CN ?? null,
          hasTSA: c2pa.tstTokens != null && c2pa.tstTokens.length > 0,
          validationErrors: c2pa.manifestStore.validationStatus ?? [],
          ingredients,
          provenanceGraph: c2pa.provenanceGraph ?? null
        }
        void chrome.runtime.sendMessage({ action: MSG_RESPONSE_C2PA_ENTRIES, data: response })
      })
    })()
    // multiple frames will act on this message, so we send the response as a separate message
  }
  if (message.action === MSG_TRUSTLIST_UPDATE) {
    void updateTrustLists()
  }
  if (message.action === MSG_C2PA_RESULT_FROM_CONTEXT && _id != null) {
    if (data?.frame !== _id.frame || data?.c2paResult == null || data.url == null || _lastContextTarget == null) return
    if (data.url !== _lastContextTarget?.src && data.url !== _lastContextTarget?.currentSrc) {
      return
    }
    const c2paResultOrError = data.c2paResult as C2paResult | C2paError

    MediaMonitor.add(_lastContextTarget)
    void handleValidationResult(_lastContextTarget, c2paResultOrError)
  }
})

function sendToContent (message: unknown): void {
  // Wrap sendMessage: after an extension reload the content-script keeps
  // running but the runtime channel is dead, so chrome.runtime.sendMessage
  // throws "Extension context invalidated." and the async/fire-and-forget
  // call swallows the error silently — leaving the CR-overlay click inert
  // with no diagnostic. Catch + log + show a one-shot page toast.
  try {
    void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
  } catch (err) {
    showExtensionReloadToast()
  }
}

// Deliver MSG_OPEN_OVERLAY directly via chrome.runtime.sendMessage (not
// through the MSG_FORWARD_TO_CONTENT wrapper). The overlay UI lives in
// `iframe.html`, an extension page hosted as an iframe on the current tab.
// background.ts's MSG_FORWARD_TO_CONTENT handler forwards via
// chrome.tabs.sendMessage, which is delivered to **content scripts only** —
// extension-page iframes are a different world and do not hear it. In
// contrast, chrome.runtime.sendMessage fans out to every extension context
// with a runtime.onMessage listener (service worker + popup + options +
// embedded extension pages), so overlayFrame.ts's listener fires directly.
// This was the missing link: the click reached the handler, the send
// completed, but the payload never reached overlayFrame.
function openOverlay (c2paResult: unknown, position: { x: number, y: number }): void {
  try {
    void chrome.runtime.sendMessage({
      action: MSG_OPEN_OVERLAY,
      data: { c2paResult, position }
    })
  } catch (err) {
    showExtensionReloadToast()
  }
}

// Tiny in-page toast shown when the content script can no longer talk to the
// background. Rendered once; subsequent failures update the text. This makes
// the "click does nothing" post-reload failure mode self-explanatory.
let _toastEl: HTMLDivElement | null = null
function showExtensionReloadToast (): void {
  try {
    if (_toastEl != null) return
    const toast = document.createElement('div')
    toast.setAttribute('c2pa-toast', 'c2pa-toast')
    toast.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:2147483647',
      'background:#1a1a1a',
      'color:#ffffff',
      'padding:10px 14px',
      'border-radius:6px',
      'font:13px/1.4 system-ui,-apple-system,sans-serif',
      'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
      'max-width:320px'
    ].map(s => `${s} !important`).join(';')
    toast.textContent = 'Verifieddit was reloaded — refresh this tab to restore C2PA validation.'
    document.body.appendChild(toast)
    _toastEl = toast
  } catch {
    // nothing we can do if document is gone
  }
}

// Per-call, auto-dismissing in-page toast for the "no credentials" badge click.
// Replaces the prior native modal dialog in content-script context (CWS policy
// prohibits content scripts from spawning native dialogs — host-page event-loop
// hijack, origin-spoofing risk). Same visual idiom as showExtensionReloadToast
// but non-singleton and self-removing.
function showNoCredentialsToast (note: string, url: string): void {
  try {
    const toast = document.createElement('div')
    toast.setAttribute('c2pa-toast', 'c2pa-toast')
    toast.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:2147483647',
      'background:#1a1a1a',
      'color:#ffffff',
      'padding:10px 14px',
      'border-radius:6px',
      'font:13px/1.4 system-ui,-apple-system,sans-serif',
      'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
      'max-width:380px',
      'word-break:break-all'
    ].map(s => `${s} !important`).join(';')
    const noteLine = document.createElement('div')
    noteLine.textContent = note
    const urlLine = document.createElement('div')
    urlLine.style.cssText = 'margin-top:6px;opacity:0.75;font-size:11px !important'
    const truncated = url.length > 140 ? url.slice(0, 140) + '…' : url
    urlLine.textContent = truncated
    toast.appendChild(noteLine)
    toast.appendChild(urlLine)
    document.body.appendChild(toast)
    setTimeout(() => { try { toast.remove() } catch { /* gone already */ } }, 8000)
  } catch {
    // nothing we can do if document is gone
  }
}

let _lastContextTarget: MediaElement | null = null

document.addEventListener('contextmenu', event => {
  _lastContextTarget = event.target as MediaElement
})

MediaMonitor.onAdd = (mediaRecord: MediaRecord): void => {
  VisibilityMonitor.observe(mediaRecord)
}

MediaMonitor.onRemove = (mediaRecord: MediaRecord): void => {
  if (mediaRecord.icon != null) {
    mediaRecord.icon.remove()
  }
  VisibilityMonitor.unobserve(mediaRecord)
}

MediaMonitor.onMonitoringStart = (): void => {
  MediaMonitor.all.forEach((mediaRecord) => {
    setIcon(mediaRecord)
    VisibilityMonitor.observe(mediaRecord)
  })
}

MediaMonitor.onMonitoringStop = (): void => {
  MediaMonitor.all.forEach((mediaRecord) => {
    mediaRecord.icon = null
    VisibilityMonitor.unobserve(mediaRecord)
  })
}

VisibilityMonitor.onVisible((mediaRecord: MediaRecord): void => {
  setIcon(mediaRecord)
})

VisibilityMonitor.onNotVisible((mediaRecord: MediaRecord): void => {
  mediaRecord.icon = null
})

VisibilityMonitor.onEnterViewport((mediaRecord: MediaRecord): void => {
  if (!mediaRecord.state.evaluated && mediaRecord.src !== '') {
    mediaRecord.state.evaluated = true

    // Check image dimensions for icon injection
    if (mediaRecord.element.tagName === 'IMG') {
      const imgElement = mediaRecord.element as HTMLImageElement;
      // Capture the ready-callback locally so we can invoke it directly
      // for already-loaded images. mediaRecord.onReady is a setter-only
      // property on MediaRecord — reading it returns undefined, so we
      // cannot round-trip through it (#57).
      const onReadyCallback = (): void => {
        if (imgElement.naturalWidth > 5 && imgElement.naturalHeight > 5) {
          // Create icon with a default status if it doesn't exist
          if (mediaRecord.icon === null) {
             mediaRecord.icon = new CrIcon(mediaRecord.element, 'img'); // Use 'img' as default status
             mediaRecord.icon.setMetadataLink(mediaRecord.src);
             mediaRecord.icon.onClick = async () => {
               const offsets = await getOffsets(mediaRecord.element);
               if (mediaRecord.state.c2pa) {
                 openOverlay(mediaRecord.state.c2pa, { x: offsets.x + offsets.width, y: offsets.y });
               } else {
                 // Optional: Provide user feedback that C2PA data is not available
               }
             };
          } else {
             // Icon already exists (shouldn't happen if created here first), ensure it's visible and positioned
             mediaRecord.icon.show();
          }

          // Proceed with C2PA validation regardless of icon creation
          void c2paValidateImage(mediaRecord.src)
            .then((c2paResult) => {
              if (!(c2paResult instanceof Error) && c2paResult.manifestStore != null) {
                mediaRecord.state.c2pa = c2paResult;
                // setIcon will update the status based on C2PA result
                setIcon(mediaRecord);
              } else {
                // If no C2PA data, the icon (if created) remains with its initial status ('img')
                // No need to call setIcon here if c2pa is null, as setIcon now handles this.
              }
            })
            .catch((error) => {
              // Handle validation errors - maybe update icon status to 'error'?
              if (mediaRecord.icon) {
                 mediaRecord.icon.status = 'error'; // Or a new 'validation-error' status
                 mediaRecord.icon.setMetadataLink(mediaRecord.src); // Keep the link
              }
            });
        } else {
          // If icon exists for this element (shouldn't if logic is correct), remove it
          if (mediaRecord.icon) {
             mediaRecord.icon.remove();
             mediaRecord.icon = null;
          }
        }
      };
      mediaRecord.onReady = onReadyCallback;
      // Trigger onReady logic immediately if the image is already loaded
      if (imgElement.complete && imgElement.naturalWidth !== 0) {
          onReadyCallback();
      }
    } else {
       // For non-image media elements (video, audio), proceed with C2PA validation
       // Icon injection for these types is not part of the current 5x5px image requirement.
       void c2paValidateImage(mediaRecord.src)
         .then((c2paResult) => {
           if (!(c2paResult instanceof Error) && c2paResult.manifestStore != null) {
             mediaRecord.state.c2pa = c2paResult;
             // If C2PA data is found for non-image media, create/update icon
             setIcon(mediaRecord);
           } else {
             // No C2PA data, no icon needed for non-image media based on current scope.
           }
         })
         .catch((error) => {
           // Handle validation errors for non-image media if needed (e.g., log)
         });
    }
  }
});

VisibilityMonitor.onLeaveViewport((mediaRecord: MediaRecord): void => {
  // do nothing
})

VisibilityMonitor.onUpdate((mediaRecord: MediaRecord): void => {
  mediaRecord.icon?.position()
})

function setIcon (mediaRecord: MediaRecord): void {

  // If no C2PA data, and an icon already exists (created based on size), do nothing.
  // If no C2PA data and no icon, do nothing.
  if (mediaRecord.state.c2pa == null) {
    return;
  }

  // If C2PA data is available, get the status and update/create the icon
  const c2paStatus = getC2PAStatus(mediaRecord.state.c2pa);

  if (mediaRecord.icon == null) {
    // This case handles non-image media or images where C2PA data arrived before onEnterViewport's load listener.
    mediaRecord.onReady = (mediaRecord) => {
      // Use the C2PA status directly for the icon status
      mediaRecord.icon = new CrIcon(mediaRecord.element, c2paStatus as VALIDATION_STATUS)
      mediaRecord.icon.setMetadataLink(mediaRecord.src) // Set the metadata link
      mediaRecord.icon.onClick = async () => {
        const offsets = await getOffsets(mediaRecord.element)
        if (mediaRecord.state.c2pa) {
          openOverlay(mediaRecord.state.c2pa, { x: offsets.x + offsets.width, y: offsets.y })
        }
      }
    }
    return; // Wait for onReady if element isn't ready
  }

  // Icon already exists (created in onEnterViewport or previously here), update its status
  mediaRecord.icon.status = c2paStatus as VALIDATION_STATUS;
  mediaRecord.icon.setMetadataLink(mediaRecord.src); // Update the metadata link
  mediaRecord.icon.show(); // Explicitly ensure icon is visible
}
