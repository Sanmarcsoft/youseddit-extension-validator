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
    tag: 'v1.1.1',
    date: '2026-08-03',
    summary: 'The one thing that phoned home now asks first, and the AI label says only what it can prove.',
    fixes: [
      {
        title: 'Nothing is sent unless you ask for it',
        howToVerify:
          'Open the panel on any signed file and click "Cloud-recoverable" under Durable Content Credentials. It explains that confirming it means sending a fingerprint of the image to our manifest store, and lets you turn that on. Until you do, the extension makes no request you did not start with a click. You can change your mind in the Options tab.'
      },
      {
        title: 'Every durability check explains itself',
        howToVerify:
          'Click any of the three pillars in the panel. Each says in plain language what it means and whether confirming it involves sending anything.'
      },
      {
        title: 'The AI row says "declared", because that is what it knows',
        howToVerify:
          'Open the popup and look at the row now labelled "AI (declared by signer)". It reports what a signer wrote in their own signed manifest. A file with no such declaration reads "not declared" rather than "no", because nothing here inspects pixels and an absent declaration is not proof of human authorship.'
      }
    ]
  },
  {
    tag: 'v1.1.0',
    date: '2026-08-03',
    summary: 'Interactive provenance graph, a rebuilt popup, and a trust list resynced with the C2PA Conformance Program.',
    fixes: [
      {
        title: 'Interactive provenance graph replaces the flat ingredient list',
        howToVerify:
          'Click any badge to open the panel. The chain of custody is now a graph you can explore: click a node to expand its detail, drag to pan, scroll or use +/- to zoom, Fit to frame the whole chain, Full screen for a closer look, Escape to come back. It shows multi-generation ingredient history, assertion and sensor-telemetry nodes, and the relationship between each step.',
        verifyFragment: '07-edge-realworld-cbc-signed'
      },
      {
        title: 'The graph is in the popup too, and the popup matches the website',
        howToVerify:
          'Click the Verifieddit toolbar icon. The Validation tab now shows the provenance graph for media on the page you are viewing, and the tabs are styled to match verifieddit.com rather than the browser default.'
      },
      {
        title: 'More signers are recognised as trusted',
        howToVerify:
          'Open the Trust Lists tab. The bundled list now carries all 29 anchors from the C2PA Conformance Program, plus the 21 official timestamp authorities. Media signed by Huawei, Huanyu, Verimago, Snowball, Encypher, TrustAsia or RealReel previously showed as valid-but-unknown; it now resolves to a named, trusted signer.'
      },
      {
        title: 'Only genuinely AI-generated media is labelled as AI',
        howToVerify:
          'The AI marker now comes from what a file declares about itself in its Content Credentials, not from which company signed it. Previously anything signed under certain corporate certificate authorities was marked AI-generated, including ordinary photographs, and AI images from other tools were missed.'
      },
      {
        title: 'Test-signing keys are no longer trusted in the published build',
        howToVerify:
          'The demo fixtures shipped with the source are signed by a development key that lives in the public repository. That key is no longer loaded as a trust anchor in the version you install, so nothing signed with it can appear trusted to you.'
      },
      {
        title: 'Fewer permissions, and the right-click item stays put',
        howToVerify:
          'The bookmarks permission and the feature behind it are gone entirely. "Verify with Verifieddit" in your right-click menu also no longer disappears after the browser suspends the extension in the background.'
      }
    ]
  },
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
