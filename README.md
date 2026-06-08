# Verifieddit — C2PA Content Credential Verifier

Verifieddit is a Chrome (MV3) and Firefox browser extension that verifies the
authenticity and provenance of images, video, and audio on any web page using
the open [C2PA](https://c2pa.org) Content Credentials standard. It reads the
embedded manifest, validates the signature and certificate chain, checks the
signer against bundled trust lists, and surfaces the result in a compact overlay
— including whether the asset carries **Durable Content Credentials** and
whether it was flagged as AI-generated.

Published and maintained by **SanMarcSoft LLC**. Verification runs entirely in
your browser; media bytes never leave your machine.

> **Attribution.** Verifieddit is a fork of Microsoft's
> [c2pa-extension-validator](https://github.com/microsoft/c2pa-extension-validator)
> (MIT). It builds on the [`c2pa-js`](https://github.com/contentauth/c2pa-js)
> library from the [Content Authenticity Initiative](https://github.com/contentauth).
> SanMarcSoft is the publisher of this fork; it is not affiliated with or
> endorsed by Microsoft or the CAI.

## What it does

- **Verify on demand** — right-click any image, video, or audio element and
  choose *Inspect Content Credentials*, or enable auto-scan to badge media as
  you browse.
- **Trust evaluation** — validates the C2PA/COSE signature and builds a
  **signature-verified certificate path** to a trusted anchor (a cert merely
  present in the manifest does not confer trust).
- **Durable Content Credentials** — reports the three pillars: signed &
  timestamped, durable watermark (TrustMark soft binding), and manifest-store
  recoverability. Pillars are shown as verified only when they can actually be
  verified.
- **Bundled trust** — ships with the C2PA conformance trust anchors plus the
  Trusteddit CA; you can import your own trust lists in the options page.
- **Local-first** — nothing is uploaded; the only off-device call is the
  optional *Inspect on Verifieddit* link you choose to click. See
  [`WEBSTORE_LISTING.md`](WEBSTORE_LISTING.md) for the full privacy policy.

## Install

- **From the Chrome Web Store / Firefox Add-ons:** (pending v1.0.0 review).
- **Side-load a build:**
  1. `bun install`
  2. `bun run build` (produces `dist/chrome` and `dist/firefox`)
  3. Chrome: `chrome://extensions` → enable Developer mode → *Load unpacked* →
     select `dist/chrome`. Firefox: `about:debugging` → *Load Temporary Add-on*
     → select `dist/firefox/manifest.json`.

## Develop

| Command | What it does |
|---------|--------------|
| `bun install` | Install deps (applies the pinned `c2pa` patch via `patch-package`). |
| `bun run build` | Production build (`NODE_ENV=production`). |
| `bun run build:debug` | Development build with inline source maps. |
| `bunx tsc --noEmit` | Type-check. |
| `bun test test/*.test.ts` | Unit tests (trust path, durable credentials). |
| `bun run test` | Playwright end-to-end suite (`test/e2e`). |

Always use **bun**, never npm/npx.

## Trust setup

Verifieddit bundles default trust lists (C2PA conformance anchors, an AI trust
list, and the Trusteddit CA + TSA anchors). You can add or remove trust lists,
or import a single certificate, from the extension's options page.

## Security

Verifieddit's job is to tell people what to trust, so trust-evaluation bugs are
treated as high severity. Report vulnerabilities per [`SECURITY.md`](SECURITY.md)
(to `security@verifieddit.com`, **not** Microsoft).

## License

MIT. See [`LICENSE`](LICENSE). Microsoft's original copyright is preserved;
SanMarcSoft's modifications are likewise MIT-licensed.
