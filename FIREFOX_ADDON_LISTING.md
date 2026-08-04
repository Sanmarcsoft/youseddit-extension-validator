# Firefox Add-ons (AMO) Listing — Verifieddit

> Operational submission doc for addons.mozilla.org. Verified against the v1.1.1
> source tree: every permission below is one `src/manifest.firefox.v3.json`
> actually requests, and every UI string is one the code actually renders.
>
> **Applies to:** v1.1.1 · **Last verified:** 2026-08-04
> **Chrome equivalent:** `CHROME_WEB_STORE_LISTING.md` — read that first; this
> file records only what AMO does *differently*.

## How AMO differs from the Chrome Web Store

These are the deltas that actually change the submission. Everything not listed
here is identical to the Chrome listing.

| Field | Chrome Web Store | AMO |
|---|---|---|
| Add-on name | 75 chars | **45 chars, hard limit** — the CWS name is 46 and is rejected |
| Summary | 132 chars | 250 chars |
| Promo tiles | 1400x560 marquee + 440x280 small | **No equivalent — do not upload** |
| Source code | Not required | **Required** for minified/bundled code (see `AMO_REVIEWER_NOTES.md`) |
| Data disclosure | Privacy tab fields | `data_collection_permissions` in the manifest |
| Categories | One | Up to two |

## Add-on Name (45 char limit)

```
Verifieddit: C2PA Content Credential Verifier
```

Exactly 45 characters. The Chrome name (`Verifieddit - C2PA Content Credential
Verifier`) is 46 and AMO rejects it with
`JSON_INVALID: "/name" must NOT have more than 45 characters`. Do not "fix" this
by re-syncing the two manifests.

## Summary (250 char limit)

```
Verify content authenticity with C2PA Content Credentials. See who signed an image, video, audio file or PDF, whether it was altered since, and what the signer declared about AI origin. Everything is checked locally — your media is never uploaded.
```

## Categories

- **Primary:** Privacy & Security
- **Secondary:** Other

(The Chrome listing uses "Developer Tools". AMO's audience skews toward the
privacy framing, and the add-on's value is verification, not development.)

## Detailed Description

Reuse the "Detailed Description" section of `CHROME_WEB_STORE_LISTING.md`
verbatim — it is accurate for Firefox. Two edits when pasting:

1. Change "browser extension" phrasing that says *Chrome* to *Firefox*.
2. AMO renders a restricted HTML subset, not Markdown. Bullet lists survive;
   `**bold**` does not — use `<b>` or plain text.

## Support and Identity

| Field | Value |
|---|---|
| Developer / Publisher | SanMarcSoft LLC |
| Homepage | https://www.verifieddit.com |
| Support site | https://www.verifieddit.com |
| Support email | support@verifieddit.com |
| Privacy policy | https://www.verifieddit.com/privacy |
| Source repository | https://github.com/Sanmarcsoft/verifieddit-extension |
| License | MIT |

## Screenshots

Reuse `releases/screenshots/` as-is — all six carry over:

| File | Caption |
|---|---|
| `01-detection.png` | Verdict badges on media, in place, as you browse |
| `02-provenance-graph.png` | The full chain of custody as an interactive graph |
| `03-graph-fullscreen.png` | Expand any provenance graph to full screen |
| `04-popup-validation.png` | Signer, trust status, and declared AI origin |
| `05-popup-trustlists.png` | C2PA Conformance Program anchors, plus your own |
| `06-popup-about.png` | Version, commit, and build provenance |

Do **not** upload `marquee-promo-1400x560` or `small-promo-440x280`; AMO has no
slot for either.

## Data Collection Disclosure

AMO reads this from the manifest rather than a web form. The shipped value:

```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": ["websiteContent"]
}
```

Both halves are load-bearing and both are truthful:

- **`required: ["none"]`** — with default settings the add-on makes no outbound
  request carrying user data. C2PA verification is WASM, entirely in-browser,
  and media bytes never leave the machine.
- **`optional: ["websiteContent"]`** — the Manifest Store probe
  (`src/manifestStore.ts`) is **off unless the user turns it on**. When enabled,
  it sends *perceptual hashes* (pHash/dHash hex digests) of viewed images to
  `manifests.sanmarcsoft.com` to recover credentials stripped from a file. Image
  bytes are never sent, but a perceptual hash of what someone is viewing is
  still information about what they are viewing, so it is disclosed and it is a
  choice rather than a default.

The one remaining lint warning pair
(`KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`) is expected: the key needs Firefox
140 to be *read*, and we target 115. Older Firefox ignores it harmlessly. Do not
raise `strict_min_version` to silence it — that would drop ESR 115 and 128 users
for no functional gain.

## Permission Justifications

Identical to the Chrome listing except `offscreen`, which the Firefox build does
not request (Firefox has no offscreen API; the C2PA engine runs directly in the
event page). Requested permissions are exactly:

| Permission | Why |
|---|---|
| `storage` | Auto-scan preference and the local trust-list cache. Nothing is synced to a server. |
| `activeTab` | The active tab only, when the user clicks the toolbar button or a context-menu item. |
| `contextMenus` | Adds "Verify with Verifieddit." to the right-click menu for images, video, and audio. |
| `alarms` | A once-daily trust-list refresh. |
| `<all_urls>` (host) | Content Credentials can be on media on any site, so verification cannot be scoped to a fixed host list. Nothing is transmitted; the media is read in-page and verified locally. |

## Pre-submission Checklist

- [ ] `node scripts/package-firefox.mjs` exits 0 (build, manifest gate, linter, package)
- [ ] `addons-linter` reports **0 errors** (warnings documented above are expected)
- [ ] `node scripts/firefox-smoke.mjs` passes against a real Firefox
- [ ] Version in `src/manifest.firefox.v3.json` matches `package.json`
- [ ] Tree is clean and tagged — `build-info.tagDescribe` must not read `-dirty`
- [ ] Both artifacts present in `releases/`: the add-on zip **and** the `-source.zip`
- [ ] `AMO_REVIEWER_NOTES.md` pasted into the "Notes to reviewer" field

## Submission

Listed submission: https://addons.mozilla.org/developers/addon/submit/upload-listed

1. Upload `releases/verifieddit-firefox-<version>.zip`.
2. When asked whether the add-on requires source code: **yes**. Upload
   `releases/verifieddit-firefox-<version>-source.zip`.
3. Paste `AMO_REVIEWER_NOTES.md` into "Notes to reviewer".
4. Fill the listing fields from this document.

### Credentials — blocker for automated submission

There are currently **no AMO credentials in `pass`** (searched for
`mozilla|amo|firefox|addon`, zero matches), and no `~/.config/web-ext*`. So
`web-ext sign` and the AMO v5 API are unavailable and the first submission must
be a manual upload through the Developer Hub.

To automate later releases, generate a JWT issuer + secret at
https://addons.mozilla.org/developers/addon/api/key/ and store them as:

```
pass insert sanmarcsoft/amo/jwt-issuer
pass insert sanmarcsoft/amo/jwt-secret
```

Then `web-ext sign --api-key=... --api-secret=... --channel=listed` can publish
from CI.
