/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_DISPLAY_C2PA_OVERLAY, MSG_FRAME_CLICK, MSG_REMOTE_INSPECT_URL } from './constants'
import { C2paOverlay } from './overlay'
import { validateUrl } from './c2pa' // Import validateUrl

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

// Function to process a single image element
async function processImage(img: HTMLImageElement): Promise<void> {
  // Check if the image is larger than 50x50 pixels
  if (img.naturalWidth > 50 && img.naturalHeight > 50) {
    console.debug(`Processing image: ${img.src}`);
    try {
      const result = await validateUrl(img.src);
      if ('manifestStore' in result) {
        console.log(`C2PA data found for image: ${img.src}`, result);
      } else {
        console.log(`No C2PA data found for image: ${img.src}`, result);
      }
    } catch (error) {
      console.error(`Error processing image ${img.src}:`, error);
    }
  } else {
    console.debug(`Skipping image (too small): ${img.src}`);
  }
}

// Observe the DOM for new images
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeName === 'IMG') {
        void processImage(node as HTMLImageElement);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Check for images within added elements
        (node as Element).querySelectorAll('img').forEach((img) => {
          void processImage(img);
        });
      }
    });
  });
});

// Start observing the document body for added nodes
observer.observe(document.body, { childList: true, subtree: true });

// Process existing images on the page
document.querySelectorAll('img').forEach((img) => {
  void processImage(img);
});
