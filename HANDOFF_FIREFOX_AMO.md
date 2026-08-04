# Handoff — Firefox / AMO submission

> Written 2026-08-04 at the end of a working session. Pick up from
> **"Start here tomorrow"** below.
>
> **One-line status:** the Firefox add-on is built, packaged and AMO-clean, but
> **must not be submitted** — a Gecko-only bug (#149) leaves the verdict overlay
> dead on click.

## Where things stand

| | |
|---|---|
| Version | **v1.1.2**, tagged at `af29b04`, merged to `main` |
| `addons-linter` 10.10.0 | **0 errors**, 8 documented warnings |
| Firefox functional | 8/8 verdict badges render, Firefox 151.0.3 and 153.0.3 |
| Chrome regression | Playwright e2e 11 passed, 4 skipped, 0 failed |
| AMO credentials | in `pass`, **authenticate** (HTTP 200, account "SanMarcSoft LLC") |
| Artifacts | built, sha256 recorded in #148 |
| **Submission** | **BLOCKED on #149** |

Merged: PR #146 (engineering), PR #147 (release v1.1.2). Closed: #145.
Open: **#148** (AMO upload, blocked), **#149** (the blocker).

## The blocker — #149

**Clicking a verdict badge does nothing in Firefox.** It works in Chrome, and
`test/e2e/cr-click.spec.ts` passes there, which is why this reached a packaged
build unnoticed.

### Root cause (confirmed by reproduction, not inference)

`chrome.runtime.sendMessage()` from a content script **does not reach an
extension page embedded as an iframe in the same tab under Gecko.** Chrome fans
the message out to that context; Firefox does not.

`src/inject.ts` `openOverlay()` depends on exactly that fan-out, and the comment
above it states the assumption in as many words. It is correct for Chrome and
wrong for Firefox.

Evidence, from stepping WebDriver into the extension iframe after a click:

```
overlayElementPresent : true     <- iframe.html loaded, webComponents.js registered
runtimeAlive          : true     <- chrome.runtime.id present, context valid
overlayHasC2paResult  : false    <- never received MSG_OPEN_OVERLAY
```

Plus, in the top-level document: the click fired (`hasOnclick: true`), and
**zero** `[c2pa-toast]` elements appeared, so `sendMessage` did not throw. The
message is sent successfully and silently goes nowhere.

Broken chain:

```
inject.ts openOverlay()
  -> runtime.sendMessage(MSG_OPEN_OVERLAY)     <-- BREAKS HERE on Gecko
  -> overlayFrame.ts sets _overlay.c2paResult
  -> MSG_DISPLAY_C2PA_OVERLAY -> background -> content.ts -> overlay.show()
```

### Reproduce it in one command

Requires `geckodriver` on PATH (`bun add -g geckodriver`) and a real Firefox.

```bash
AUTO_SCAN=true TRUST_DEV_FIXTURES=true bun run build
bun run serve:fixtures &
node scripts/firefox-smoke.mjs --source-dir dist/firefox --min 5 --click
```

Expect `OVERLAY VISIBLE: NO` and a non-zero exit until #149 is fixed.

## Start here tomorrow

**There is one open decision. Nothing else is blocked.**

M asked three times whether Chrome and Firefox should live on separate branches
(or repos). The recommendation on the table, not yet accepted or rejected:

1. **Keep a single branch.** Churn evidence: **137 of 367 commits** touch the
   five files a Firefox branch would have to diverge (`background.ts` 54,
   `inject.ts` 34, `content.ts` 29, `overlayFrame.ts` 11, `overlay.ts` 9),
   against 7,257 shared lines of `src/` versus 91 genuinely Firefox-only lines.
   The seam would run straight through the highest-churn files. The failure mode
   that matters: a signature-validation fix landing on one branch and silently
   not the other, so the product tells a user something is authentic when it is
   not.

2. **Fix #149 with option A — port relay via the background.** `overlayFrame.ts`
   opens `chrome.runtime.connect({ name: 'overlay-frame' })`; the background
   tracks ports by `port.sender.tab.id` and relays `MSG_OPEN_OVERLAY` to the
   right tab's frame. This is **one code path that is correct on both engines**,
   which is the main argument against branching for this bug specifically.

   Option B (content script `postMessage` direct to `iframe.contentWindow`) is
   smaller but lets the host page post into the overlay frame, which is a
   UI-spoofing surface: a hostile page could draw a fake "verified" panel under
   Verifieddit branding. A nonce does not close it, since the page can read
   `iframe.src`. Not recommended for a product whose purpose is establishing
   what is true. Note `overlayFrame.ts` still carries an unused `secret` field,
   suggesting someone walked this path before and backed out.

3. **Add `src/platform.ts`.** Engine differences are currently scattered across
   four places (Firefox manifest, the `c2paProxy -> c2pa` rollup alias, the
   `BROWSER_TARGET` build flag, and now this messaging path) with no single
   owner. One module behind a stable interface makes "what differs between
   Chrome and Firefox?" a one-file question. This addresses the real instinct
   behind the branching question without the merge tax.

**After the fix:** re-run the Chrome Playwright suite before anything else.
Option A touches shared content-script code and Chrome v1.1.1 is still in CWS
review.

## Also open, not yet investigated

**Fullscreen from the toolbar popup does not work in Firefox.** Reported by M,
not yet reproduced or filed. Suspected to be separate from #149:
`src/overlay.ts` already sets `iframe.allow = 'fullscreen'` and
`allowFullscreen` for the *overlay* iframe, but a browser-action popup panel
cannot enter fullscreen in Firefox at all. Confirm before filing.

## Gate gap this exposed

`addons-linter` passed and badges rendered while the interactive UI was dead.
Static validation and "does it render" are not sufficient signals for a store
submission.

`scripts/firefox-smoke.mjs --click` now covers the overlay path. **It should be
wired into CI** so a Gecko UI regression cannot reach a store again. It is not
in any workflow yet.

Related: `playwright.config.ts` has only a `chrome-extension` project. Playwright
**cannot** install WebExtensions into Firefox at all, which is why the Gecko side
is driven by geckodriver's `POST /session/:id/moz/addon/install` instead.

## Tooling added this session

| Path | Purpose |
|---|---|
| `scripts/package-firefox.mjs` | `bun run package:firefox` — build, manifest gate, linter, add-on zip + AMO source archive |
| `scripts/firefox-smoke.mjs` | `bun run smoke:firefox` — functional test in real Firefox; `--click` probes the overlay |
| `scripts/submit-firefox.mjs` | `bun run submit:firefox` — signs and uploads; `--dry-run` validates without uploading |
| `FIREFOX_ADDON_LISTING.md` | AMO listing copy and the Chrome/AMO deltas |
| `AMO_REVIEWER_NOTES.md` | Paste into "Notes to reviewer" at submission |

**`addons-linter` is pinned to 10.10.0 on purpose.** Version 7.x hard-errors on
`data_collection_permissions` with `DATA_COLLECTION_PERMISSIONS_PROP_RESERVED`,
a stale false positive that would block a correct submission. Do not loosen it
to a floating range.

**`geckodriver` is deliberately not a devDependency** — its postinstall
downloads a platform binary, which would churn `bun.lock` and break offline and
CI installs for everyone who never runs the Firefox test. Install it globally.

## Environment notes

- **Build server is `ai.matthewstevens.org`** (SSH alias `ai`), repo at
  `/Volumes/home/matthewstevens/verifieddit-extension`. It has the GUI stack the
  dev container lacks, so all headed browser testing happens there.
- **`bun run build` OOMs in the newmini dev container** at Node's default heap.
  Use `NODE_OPTIONS=--max-old-space-size=8192`. Builds fine unaided on `ai`.
- **Firefox on `ai` auto-updates** (151 -> 153 mid-session), which killed one
  geckodriver session. The add-on passed on both, but a CI smoke test there could
  flake for this reason.
- `ai` had heavy memory pressure (13-day uptime, ~1 GB of 2 GB swap used, 39 M
  pageins). Symptom: `about:debugging` -> *Load Temporary Add-on* silently did
  nothing, because macOS could not spawn `openAndSavePanelService`. **A reboot
  clears it.** Workaround used meanwhile: `web-ext run`, which installs the
  add-on over the remote debugging protocol and needs no file picker.
- Test copies were staged at `~/Desktop/verifieddit-test/` on `ai`
  (`autoscan/`, `production/`, and a drag-and-droppable `.xpi`). Disposable.
- The fixture server and the `web-ext run` Firefox instance were **shut down** at
  the end of the session. Restart with `bun run serve:fixtures`.

## Manual testing recipe

```bash
# on ai
cd /Volumes/home/matthewstevens/verifieddit-extension
AUTO_SCAN=true TRUST_DEV_FIXTURES=true bun run build
bun run serve:fixtures &
web-ext run --source-dir dist/firefox-autoscan \
  --firefox=/Applications/Firefox.app/Contents/MacOS/firefox \
  --start-url http://localhost:3000/demo-corpus/
```

The corpus is built to give a spread, **not** all green: 01-03 valid/trusted,
**04 warning** (untrusted signer), **05 error** (tampered pixels), 06 no
credentials, 07 real-world CBC-signed, 08 Trusteddit-signed. If all eight look
green, something is wrong.

Note the production build ships **auto-scan OFF** (#86), so `dist/firefox` shows
zero badges until you right-click an image and choose *Verify with Verifieddit.*
That is correct behaviour, not a fault. Use `dist/firefox-autoscan` for eyeballing.

## Submission, once #149 is fixed

Credentials are in `pass` at `sanmarcsoft/amo/jwt-issuer` and
`sanmarcsoft/amo/jwt-secret`, and are verified working.

```bash
bun run package:firefox
bun run submit:firefox -- --dry-run   # validates everything, uploads nothing
```

**The first listed submission must go through the Developer Hub by hand.**
`web-ext sign` does support `--upload-source-code`, so the mandatory source
archive can go over the API, but the signing API cannot set listing metadata
(name, summary, categories, screenshots, privacy policy). We have written copy
and six screenshots to place. Every release after the first can ship via
`bun run submit:firefox`.

Checklist and the eight expected linter warnings are in #148 and
`FIREFOX_ADDON_LISTING.md`.
