# CHANGELOG

## v1.1.2

- Firefox is submittable. The Gecko build existed but had never been checked
  against AMO's validator or run in Firefox at all. It carried a hard rejection
  (the add-on name was 46 characters against AMO's 45-character limit) plus 29
  warnings; it now reports zero errors and eight documented warnings.
- The Firefox minimum is now 115.0, up from 109.0. `background.type: module`
  needs 112 and `storage.session` needs 115, so the old floor advertised support
  the code could not deliver. 115 is an ESR, so no realistic user is dropped.
- Data collection is declared in the manifest, as AMO now requires. Nothing is
  collected by default; the opt-in manifest-store probe is disclosed as optional
  `websiteContent`, which is truthful about the perceptual hashes it sends when
  a user turns it on.
- The Firefox bundle no longer contains `chrome.offscreen`. Firefox has no such
  API and the call site was already guarded, but AMO flags every textual
  reference, so the branch is now constant-folded out at build time. Chrome
  keeps its offscreen path unchanged.
- Dropped a `web_accessible_resources` entry naming `iframe.js`, a file the
  build has never produced.
- Builds no longer bake the build machine's hostname into the shipped bundle.
  That value was published to the store; it now reads `local` unless a CI runner
  name is present, which also makes a reviewer's rebuild match.
- First functional proof in Gecko: eight of eight verdict badges across the demo
  corpus in Firefox 151, confirming the C2PA WebAssembly engine initialises
  inside a Firefox event page. Chrome runs that engine in an offscreen document,
  which Firefox has no equivalent for, so this was the real unknown.

## v1.1.1

- The manifest-store probe is opt-in. During validation the extension used to
  send a perceptual fingerprint of images to manifests.sanmarcsoft.com without
  anyone choosing it, and it was disclosed nowhere; WEBSTORE_LISTING.md claimed
  the opposite outright. Now gated inside probeManifestStore itself, off by
  default, failing closed when storage is unreadable. Consent is granted in
  context from the Cloud-recoverable pillar, applies forward only, and is
  reversible from Options. Pillar 3 reads 'declared' rather than 'verified'
  while off. Disclosed in both listing docs and in section 2.9 of the published
  privacy policy.
- All three Durable Content Credentials pillars are clickable and explain
  themselves in plain language.
- AI labelling says only what it knows. The popup row "AI detection" is now
  "AI (declared by signer)"; its negative value is "not declared" rather than
  "no", because an absent declaration is not evidence of human authorship. The
  manifest description no longer promises to "Detect AI-generated" media, which
  implied pixel analysis the extension does not perform.


## v1.1.0

- Interactive C2PA provenance graph. Click a node to expand its detail, drag to
  pan, scroll or +/- to zoom, Fit to frame, Full screen, Escape to exit. Shows
  assertion and sensor-telemetry nodes, multi-generation ingredient chains, C2PA
  relationship labels on edges, and per-node signer, claim-generator and
  validation detail. Replaces the flat ingredient-only diagram. Built from the
  raw c2pa-rs manifest store by a port of the hub's canonical `provenance-graph`
  builder, so the extension, verifieddit.com and trusteddit.com agree on what a
  file's metadata says. A malformed store degrades to the ingredient grid and can
  never turn a valid asset into a failed validation.
- C2PA engine upgraded to `@contentauth/c2pa-web` 0.11, `@contentauth/toolkit`
  0.13.14 and `c2pa-wc` 0.14.17. The WASM worker now loads from a packaged file
  via the native `workerSrc`, so no `blob:` CSP exception is needed in either
  browser.
- Right-click "Inspect Content Credentials" is recreated on every service-worker
  startup, so it no longer disappears after the worker is torn down.
- `bookmarks` permission removed entirely, along with the feature behind it.
- Trust anchors resynced with the C2PA Conformance Program. The bundled default
  list had drifted to 18 of the 29 official anchors, so assets signed by Huawei,
  Huanyu, Verimago, Snowball, Encypher, TrustAsia and RealReel rendered as
  valid-but-untrusted. Added the official C2PA TSA trust list (21 anchors) —
  previously only the Trusteddit TSA chain shipped, so official timestamp
  authorities failed the RFC 3161 trust check. Generated and drift-gated by
  `bun scripts/sync-c2pa-trust-lists.ts [--check]`.
- Fixture-signing CA moved out of the production trust list into
  `dev-trust-list.json`, so `default-trust-list.json` is exactly the official list.
- AI-generated media is now identified from what the asset declares, not from
  who signed it. `isAIDetected` was `trustList.name === 'AI trust list'`, and
  that list holds Microsoft as a CA plus OpenAI. A CA match covers every leaf
  certificate beneath it, so an ordinary photograph signed anywhere under
  Microsoft's PKI was badged AI-generated, while genuine AI output from any
  other vendor was missed entirely. Detection now reads the IPTC
  `digitalSourceType` from the active manifest's own `c2pa.actions` assertion:
  `trainedAlgorithmicMedia` is full generation, `compositeWithTrainedAlgorithmicMedia`
  is partial, and everything else — including `algorithmicMedia` for procedural
  work — is not AI. Unit tests in `test/aiDetection.test.ts` pin the negative
  cases, which are the ones that matter.
- Fixture-signing CA is no longer loaded as a trust anchor in published builds.
  Splitting it into its own file left it still being pushed into
  `globalTrustLists` by `loadDefaultTrustLists()`, so every installed copy
  trusted a signing key that is public in this repository — anyone holding it
  could mint media the extension reported as trusted. Loading is now gated on
  `TRUST_DEV_FIXTURES`, off by default and set only by `bun run build:e2e` so the
  bundled corpus can still exercise the trusted-signer path.

- Trust-path regression tests now `await` `checkTrustListInclusion`. The function
  became async and three call sites were never updated; the attacker-chain test
  had been passing without ever running.

## v0.1.3

- Auto-refresh trust lists
- Enable context menu validation and added auto-scan option
- Dynamic icon updates when in web view
- Create chrome and firefox dist zip artifact
- Add individual trust anchors list
- Add support for AVIF and SVG image formats
- Add support for MP3 and WAV audio formats
- Add support for AVI video format

## v0.1.2

- Add support for Firefox
- Add option to scan all media on a page
- Various updates

## v0.1.1

- IFrames, including nested IFrames and IFrames within shadow-roots, are now scanned for media elements
- Display trust list logo in popup (if available)
- Various updates

## v0.1.0

- Initial release
