/*
 * Single source of truth for the "What's new" section in the About tab.
 *
 * Public-facing copy. No internal QA / Playwright / test-fixture language;
 * the popup renders this verbatim to end users. The "How to verify" lines
 * are written as something a user can actually try on the web today.
 *
 * Add a new object at the top of RELEASE_NOTES for every shipped version.
 * Newest first; popup.ts renders the first entry expanded by default.
 */

export interface ReleaseFix {
  title: string
  /**
   * Plain-English action a user can take to see the feature in action.
   * Optional `verifyFragment` deep-links to a demo image fixture by name.
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
    tag: 'v1.0.0',
    date: '2026-05-17',
    summary: 'Initial public release. Verify C2PA Content Credentials on any webpage.',
    fixes: [
      {
        title: 'Automatic detection of signed media on every page',
        howToVerify:
          'Open any page with C2PA-credentialed images (try the demo page link above). Verifieddit overlays a small badge in the corner of each verified piece of media — green for trusted, yellow for an unknown signer, red for an integrity failure.'
      },
      {
        title: 'Click a badge for the full provenance panel',
        howToVerify:
          'Click any badge to open the provenance panel: who created the content, what tools touched it, the certificate trust chain, the trusted timestamp, and the ingredient history.'
      },
      {
        title: 'Right-click to inspect any image, video, or audio',
        howToVerify:
          'Right-click any media element on any page and choose "Verify with Verifieddit." A new tab opens with the full Content Credentials inspection — works whether auto-scan is on or off.'
      },
      {
        title: '100% local processing, zero servers',
        howToVerify:
          'Every byte of verification work happens inside your browser using locally-bundled WebAssembly. No media is uploaded anywhere. No analytics, no telemetry, no account required. See the Privacy Policy linked from the listing.'
      }
    ]
  }
]
