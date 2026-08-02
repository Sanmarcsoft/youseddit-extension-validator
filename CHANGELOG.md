# CHANGELOG

## vNext (dev)

- Trust anchors resynced with the C2PA Conformance Program. The bundled default
  list had drifted to 18 of the 29 official anchors, so assets signed by Huawei,
  Huanyu, Verimago, Snowball, Encypher, TrustAsia and RealReel rendered as
  valid-but-untrusted. Added the official C2PA TSA trust list (21 anchors) —
  previously only the Trusteddit TSA chain shipped, so official timestamp
  authorities failed the RFC 3161 trust check. Generated and drift-gated by
  `bun scripts/sync-c2pa-trust-lists.ts [--check]`.
- Fixture-signing CA moved out of the production trust list into
  `dev-trust-list.json`, so `default-trust-list.json` is exactly the official list.

- Interactive provenance diagram at parity with verifieddit.com and trusteddit.com:
  assertion and sensor-telemetry nodes, multi-generation ingredient chains,
  C2PA relationship labels on edges, per-node signer/claim-generator/validation
  detail, pan, zoom, auto-fit and full screen. Replaces the flat ingredient-only
  diagram. The graph is built from the raw c2pa-rs manifest store by a port of
  the hub's canonical `provenance-graph` builder, so all three verifiers agree.
- Added TSA trust list and timestamp validation

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
