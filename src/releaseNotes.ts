/*
 * Single source of truth for the "What's new" section in the About tab.
 *
 * Each entry ties a release-candidate tag to a short list of fixes that a
 * user can verify for themselves on https://www.verifieddit.com/demo. The
 * `verifyFragment` points at a specific fixture filename under
 * /demo-corpus/ so the deep-link scrolls straight to it.
 *
 * Add a new object at the top of RELEASE_NOTES for every new rc. Keep the
 * list ordered newest-first; popup.ts renders the first entry expanded by
 * default.
 */

export interface ReleaseFix {
  title: string
  /**
   * How to verify on /demo. `verifyFragment` is appended as a hash so the
   * popup deep-link scrolls to the relevant <figure>/<img>. If omitted the
   * link points at /demo without an anchor.
   */
  howToVerify: string
  verifyFragment?: string
}

export interface ReleaseEntry {
  tag: string
  date: string
  summary: string
  fixes: ReleaseFix[]
}

export const DEMO_URL = 'https://www.verifieddit.com/demo'

export const RELEASE_NOTES: readonly ReleaseEntry[] = [
  {
    tag: 'v1.0.0-rc11',
    date: '2026-04-24',
    summary: 'CR overlay click finally opens the metadata panel.',
    fixes: [
      {
        title: 'Click any CR badge and see the full provenance panel',
        howToVerify:
          'Open /demo, click the yellow CR badge on the CBC/Radio-Canada fixture (07-edge-realworld-cbc-signed.jpg). A panel opens showing "Image signed by unknown entity CBC/Radio-Canada", the WebClaimSigningCA → Truepic Lens certificate chain, trusted timestamp, and the 1-manifest tree.',
        verifyFragment: '07-edge-realworld-cbc-signed.jpg'
      },
      {
        title: 'Post-reload failure is now self-explanatory',
        howToVerify:
          'Reload the extension from chrome://extensions with /demo still open. Click a CR badge — a small dark toast appears at the bottom-right saying "Verifieddit was reloaded — refresh this tab to restore C2PA validation." (Previously the click was silently inert.)',
        verifyFragment: '01-greentrust-jpeg.jpg'
      },
      {
        title: 'Regression gate added',
        howToVerify:
          'Playwright E2E (test/e2e/cr-click.spec.ts) drives a headed chromium with the unpacked extension, clicks the CBC badge, asserts the <c2pa-overlay> shadow DOM contains "CBC/Radio-Canada" and the "unknown" trust-list marker. CI runs this before every rc tag.'
      }
    ]
  },
  {
    tag: 'v1.0.0-rc10',
    date: '2026-04-24',
    summary: 'Console-noise hotfix + source-data inline cap for large signed media.',
    fixes: [
      {
        title: 'No-Manifest unsigned images no longer spam the console',
        howToVerify:
          'Open /demo and open DevTools on the page. Scroll through the fixtures. You should see no "Error validating image 1: [object Object]" lines — only a single debug-level "No C2PA manifest for image" per unsigned fixture, and real "C2PA validation error" entries only when something genuinely goes wrong.',
        verifyFragment: '06-no-c2pa-plain-jpeg.jpg'
      },
      {
        title: 'Large real-world C2PA media stays responsive',
        howToVerify:
          'Click the 4.7 MB CBC fixture icon; extension no longer stalls while serialising a ~6 MB base64 of the source blob through chrome.runtime.sendMessage. (Behaviour visibly depends on rc11 for the click path itself.)',
        verifyFragment: '07-edge-realworld-cbc-signed.jpg'
      }
    ]
  },
  {
    tag: 'v1.0.0-rc9',
    date: '2026-04-23',
    summary: 'UI upgrade — toolbar icon + expandable Validation tab + ingredient tree.',
    fixes: [
      {
        title: 'Popup Validation tab is now an accordion',
        howToVerify:
          'Click the Verifieddit toolbar icon on /demo. Each row in the Validation tab expands to show signer / trust list / cert chain / TSA / AI / manifest count / ingredient tree.',
        verifyFragment: '01-greentrust-jpeg.jpg'
      }
    ]
  }
]
