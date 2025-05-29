/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
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
  MSG_VALIDATE_URL, IS_DEBUG, MSG_LOG_MESSAGE
} from './constants'

// Save original console methods
const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
}

// Override console methods to send messages to background script
console.log = (...args: any[]) => {
  const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  void chrome.runtime.sendMessage({ action: MSG_LOG_MESSAGE, data: `[LOG] ${logString}` })
  originalConsole.log(...args)
}

console.debug = (...args: any[]) => {
  const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  void chrome.runtime.sendMessage({ action: MSG_LOG_MESSAGE, data: `[DEBUG] ${logString}` })
  originalConsole.debug(...args)
}

console.info = (...args: any[]) => {
  const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  void chrome.runtime.sendMessage({ action: MSG_LOG_MESSAGE, data: `[INFO] ${logString}` })
  originalConsole.info(...args)
}

console.warn = (...args: any[]) => {
  const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  void chrome.runtime.sendMessage({ action: MSG_LOG_MESSAGE, data: `[WARN] ${logString}` })
  originalConsole.warn(...args)
}

console.error = (...args: any[]) => {
  const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  void chrome.runtime.sendMessage({ action: MSG_LOG_MESSAGE, data: `[ERROR] ${logString}` })
  originalConsole.error(...args)
}

console.debug('%cFRAME:', 'color: magenta', window.location)

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

void chrome.runtime.sendMessage({ action: MSG_GET_ID }).then((id) => {
  _id = id
})

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
    window.parent.postMessage({ type: MSG_CHILD_REQUEST, data: message, id: counter, src: document.location.href }, '*')
  })
}

async function handleValidationResult (mediaElement: MediaElement, c2paResult: C2paResult | C2paError): Promise<void> {
  if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
    console.error('Error validating image 1:', c2paResult)
    return
  }

  const mediaRecord = MediaMonitor.lookup(mediaElement)
  if (mediaRecord == null) {
    console.error('Media record not found:', mediaElement)
    return
  }

  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)
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
      console.warn(`sendMessage failed (attempt ${i + 1}/${retries}):`, error.message);
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
    console.error('Error validating image via background script:', result);
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

export interface MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD {
  name: string
  status: VALIDATION_STATUS
  thumbnail: string | null
}

async function updateTrustLists (): Promise<void> {
  await loadTrustLists()
  MediaMonitor.all.forEach((mediaRecord) => {
    if (mediaRecord.state.c2pa?.certChain == null) return
    mediaRecord.state.c2pa.trustList = checkTrustListInclusion(mediaRecord.state.c2pa.certChain)
    setIcon(mediaRecord)
  })
}

function getC2PAStatus(c2pa: C2paResult): VALIDATION_STATUS {
  console.debug('getC2PAStatus: Evaluating C2PA result for URL:', c2pa.url, c2pa);

  // Check for AI content first
  if (c2pa.trustList?.tlInfo.name === 'AI trust list') {
    console.debug('getC2PAStatus: AI trust list match found for URL:', c2pa.url);
    if (c2pa.manifestStore.validationStatus.length > 0) {
      console.debug('getC2PAStatus: AI content with validation errors for URL:', c2pa.url, 'returning ai-error.');
      return 'ai-error';
    }
    console.debug('getC2PAStatus: AI content valid for URL:', c2pa.url, 'returning ai-success.');
    return 'ai-success';
  }

  // make sure we have a manifest store and validation result
  if (!c2pa.manifestStore.validationStatus) {
    console.debug('getC2PAStatus: Manifest store validationStatus not found for URL:', c2pa.url, 'returning error.');
    return 'error'; // Should not happen if manifestStore exists
  }
  // if there are validation errors, return the error status
  if (c2pa.manifestStore.validationStatus.length > 0) {
    console.debug('getC2PAStatus: Validation errors found for URL:', c2pa.url, 'returning error:', c2pa.manifestStore.validationStatus);
    return 'error';
  }
  // if there is no trust list, return the warning status
  if (c2pa.trustList == null) {
    console.debug('getC2PAStatus: No trust list found for URL:', c2pa.url, 'returning warning.');
    return 'warning';
  }
  // if the cert is expired, make sure the TSA time stamp is trusted
  // (no easy way to check that, we need to check the cert chain)
  if (c2pa.certChain && c2pa.certChain.length > 0 && new Date(c2pa.certChain[0].validTo) < new Date()) {
    console.debug('getC2PAStatus: Certificate is expired for URL:', c2pa.url);
    // cert is expired, make sure we have a match in the TSA trust list (if not, timestamp must be ignored)
    if (c2pa.tstTokens == null || c2pa.tsaTrustList == null) {
      console.debug('getC2PAStatus: No trusted timestamp found for expired cert for URL:', c2pa.url, 'returning error.');
      // add an error to the validation status
      c2pa.manifestStore.validationStatus.push('certificate is expired and no trusted timestamp found');
      return 'error';
    }
  }
  // otherwise, return the success status
  console.debug('getC2PAStatus: All checks passed for URL:', c2pa.url, 'returning success.');
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
        const response = {
          name: c2pa.source.filename,
          status: getC2PAStatus(c2pa),
          thumbnail: c2pa.source.thumbnail.data
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
  void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
}

let _lastContextTarget: MediaElement | null = null

document.addEventListener('contextmenu', event => {
  _lastContextTarget = event.target as MediaElement
})

MediaMonitor.onAdd = (mediaRecord: MediaRecord): void => {
  console.debug('MediaMonitor.onAdd:', mediaRecord.element.tagName, mediaRecord.src)
  VisibilityMonitor.observe(mediaRecord)
}

MediaMonitor.onRemove = (mediaRecord: MediaRecord): void => {
  if (mediaRecord.icon != null) {
console.debug('Removing CrIcon from MediaMonitor.onRemove for:', mediaRecord.src);
    mediaRecord.icon.remove()
  }
  VisibilityMonitor.unobserve(mediaRecord)
}

MediaMonitor.onMonitoringStart = (): void => {
  console.debug('MediaMonitor.onMonitoringStart')
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
  console.debug('VisibilityMonitor.onEnterViewport:', mediaRecord.element.tagName, mediaRecord.src)
  if (!mediaRecord.state.evaluated && mediaRecord.src !== '') {
    mediaRecord.state.evaluated = true

    // Check image dimensions for icon injection
    if (mediaRecord.element.tagName === 'IMG') {
      const imgElement = mediaRecord.element as HTMLImageElement;
      // Use onReady to ensure dimensions are available
      mediaRecord.onReady = () => {
        if (imgElement.naturalWidth > 5 && imgElement.naturalHeight > 5) {
          console.debug('Image meets size criteria, creating/updating icon:', mediaRecord.src);
          // Create icon with a default status if it doesn't exist
          if (mediaRecord.icon === null) {
             mediaRecord.icon = new CrIcon(mediaRecord.element, 'img'); // Use 'img' as default status
             mediaRecord.icon.setMetadataLink(mediaRecord.src);
             mediaRecord.icon.onClick = async () => {
               const offsets = await getOffsets(mediaRecord.element);
               if (mediaRecord.state.c2pa) {
                 sendToContent({
                   action: MSG_OPEN_OVERLAY,
                   data: { c2paResult: mediaRecord.state.c2pa, position: { x: offsets.x + offsets.width, y: offsets.y } }
                 });
               } else {
                 console.debug('Icon clicked, but no C2PA data available yet.');
                 // Optional: Provide user feedback that C2PA data is not available
               }
             };
          } else {
             // Icon already exists (shouldn't happen if created here first), ensure it's visible and positioned
             mediaRecord.icon.show();
          }

          // Proceed with C2PA validation regardless of icon creation
          console.debug('Triggering c2paValidateImage for:', mediaRecord.src);
          void c2paValidateImage(mediaRecord.src)
            .then((c2paResult) => {
              console.debug('c2paValidateImage result for', mediaRecord.src, c2paResult);
              if (!(c2paResult instanceof Error) && c2paResult.manifestStore != null) {
                mediaRecord.state.c2pa = c2paResult;
                // setIcon will update the status based on C2PA result
                setIcon(mediaRecord);
              } else {
                console.debug('Not a C2PA element or error:', mediaRecord.src, c2paResult);
                // If no C2PA data, the icon (if created) remains with its initial status ('img')
                // No need to call setIcon here if c2pa is null, as setIcon now handles this.
              }
            })
            .catch((error) => {
              console.error('Error validating image 3:', error);
              // Handle validation errors - maybe update icon status to 'error'?
              if (mediaRecord.icon) {
                 mediaRecord.icon.status = 'error'; // Or a new 'validation-error' status
                 mediaRecord.icon.setMetadataLink(mediaRecord.src); // Keep the link
              }
            });
        } else {
          console.debug('Image does not meet size criteria, removing icon if exists:', imgElement.naturalWidth, imgElement.naturalHeight, mediaRecord.src);
          // If icon exists for this element (shouldn't if logic is correct), remove it
          if (mediaRecord.icon) {
             mediaRecord.icon.remove();
console.debug('Removing CrIcon due to size criteria in onEnterViewport for:', mediaRecord.src);
             mediaRecord.icon = null;
          }
        }
      };
      // Trigger onReady logic immediately if the image is already loaded
      if (imgElement.complete && imgElement.naturalWidth !== 0) {
          mediaRecord.onReady(mediaRecord);
      }
    } else {
       // For non-image media elements (video, audio), proceed with C2PA validation
       // Icon injection for these types is not part of the current 5x5px image requirement.
       console.debug('Processing non-image element for C2PA validation:', mediaRecord.element.tagName, mediaRecord.src);
       console.debug('Triggering c2paValidateImage for:', mediaRecord.src);
       void c2paValidateImage(mediaRecord.src)
         .then((c2paResult) => {
           console.debug('c2paValidateImage result for', mediaRecord.src, c2paResult);
           if (!(c2paResult instanceof Error) && c2paResult.manifestStore != null) {
             mediaRecord.state.c2pa = c2paResult;
             // If C2PA data is found for non-image media, create/update icon
             setIcon(mediaRecord);
           } else {
             console.debug('Not a C2PA element or error for non-image media:', mediaRecord.src, c2paResult);
             // No C2PA data, no icon needed for non-image media based on current scope.
           }
         })
         .catch((error) => {
           console.error('Error validating non-image media:', error);
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
console.debug('setIcon: Start for:', mediaRecord.src);
  console.debug('setIcon: mediaRecord.state.c2pa:', mediaRecord.state.c2pa);
  console.debug('setIcon: mediaRecord.icon:', mediaRecord.icon);
  console.debug('setIcon called for:', mediaRecord.element.tagName, mediaRecord.src)

  // If no C2PA data, and an icon already exists (created based on size), do nothing.
console.debug('setIcon: Inside c2pa == null block for:', mediaRecord.src);
  // If no C2PA data and no icon, do nothing.
  if (mediaRecord.state.c2pa == null) {
    console.debug('No C2PA data for:', mediaRecord.src, 'Keeping existing icon status if present.');
    return;
  }

console.debug('Removing CrIcon from setIcon (c2pa == null) for:', mediaRecord.src);
  // If C2PA data is available, get the status and update/create the icon
  const c2paStatus = getC2PAStatus(mediaRecord.state.c2pa);
  console.debug('C2PA data available, status:', c2paStatus, 'for:', mediaRecord.src);
console.debug('setIcon: Before icon == null check for:', mediaRecord.src, 'mediaRecord.icon:', mediaRecord.icon);
console.debug('setIcon: Before icon == null check for:', mediaRecord.src, 'mediaRecord.icon:', mediaRecord.icon);


  if (mediaRecord.icon == null) {
    // This case handles non-image media or images where C2PA data arrived before onEnterViewport's load listener.
    mediaRecord.onReady = (mediaRecord) => {
      console.debug('Creating CrIcon based on C2PA data for:', mediaRecord.src, 'status:', c2paStatus)
      // Use the C2PA status directly for the icon status
      mediaRecord.icon = new CrIcon(mediaRecord.element, c2paStatus as VALIDATION_STATUS)
      mediaRecord.icon.setMetadataLink(mediaRecord.src) // Set the metadata link
      mediaRecord.icon.onClick = async () => {
        const offsets = await getOffsets(mediaRecord.element)
        sendToContent({
          action: MSG_OPEN_OVERLAY,
          data: { c2paResult: mediaRecord.state.c2pa, position: { x: offsets.x + offsets.width, y: offsets.y } }
        })
      }
    }
    return; // Wait for onReady if element isn't ready
  }

  // Icon already exists (created in onEnterViewport or previously here), update its status
  console.debug('setIcon: Updating existing CrIcon status for:', mediaRecord.src, 'new status:', c2paStatus);
  mediaRecord.icon.status = c2paStatus as VALIDATION_STATUS;
  mediaRecord.icon.setMetadataLink(mediaRecord.src); // Update the metadata link
  mediaRecord.icon.show(); // Explicitly ensure icon is visible
  console.debug('setIcon: Ensured icon is shown for:', mediaRecord.src, 'with status:', c2paStatus);
}
