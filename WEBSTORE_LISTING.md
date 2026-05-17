# Verifieddit — Chrome Web Store listing copy

> Drafted from a code-evidence audit of v1.0.0 (tag `v1.0.0` at commit `fadf48b`).
> See `CHROME_WEB_STORE_LISTING.md` in the same repo for the operational submission
> doc with permission justifications, screenshots checklist, and developer-console
> field-by-field mapping. This file is the user-facing copy + privacy draft only.

---

## Summary

> Maximum 132 characters per Chrome Web Store policy.

**See, in one click, whether an image, video, or audio file is real, AI-made, or edited — using open C2PA Content Credentials.**

*(127 characters, including spaces and punctuation.)*

---

## Detailed Description

### What Verifieddit does

Verifieddit is a free, open-source browser extension that reveals the **provenance** of images, videos, and audio on any web page. It reads the cryptographic signature embedded in modern media (the **C2PA Content Credentials** standard, the open spec adopted by Adobe, Google, Microsoft, the BBC, and others) and shows you whether the file you are looking at:

- was produced by a verified camera, editor, or AI generator,
- was edited after capture (and by what tools),
- carries a valid trust chain back to a known signer,
- has been tampered with since it was signed,
- or carries no credentials at all (the default state for most of today's web).

A small badge appears in the corner of each verified piece of media as you browse. Click it for the full chain of custody: who created the content, what tools touched it, when it was timestamped, and which trust list authenticates the signer.

### Why this matters in 2026

The internet is now a mix of authentic media and synthetic media at industrial scale. Browsers do not natively distinguish the two. Verifieddit puts cryptographic provenance one click away from every image and video you encounter, without changing how you browse.

### How to use it

1. **Install the extension.** No account, no sign-up.
2. **Browse normally.** When auto-scan is enabled, Verifieddit detects media with C2PA Content Credentials and overlays a small badge: **green** for verified trusted, **yellow** for valid manifest from an unknown signer, **red** for integrity failure.
3. **Click any badge** to open the provenance panel — full claim chain, signer details, certificate trust state, timestamp authority, and ingredient history.
4. **Right-click** any image, video, or audio element to manually inspect Content Credentials, even when auto-scan is off.
5. **Save a verification** to a dedicated "verifieddit.com" bookmark folder, so you can build your own personal library of verified provenance records you have inspected.

### Key features

- **Automatic detection** of C2PA-credentialed media on any web page (toggle on or off from the popup).
- **Visual badges** distinguish *verified trusted*, *unknown signer*, and *integrity failure* states at a glance.
- **AI content identification** based on C2PA metadata and digital-source-type assertions, surfaced when the manifest declares AI involvement.
- **Detailed provenance panel** with the full claim hierarchy, ingredient tree, signer certificate, timestamp authority, and trust-list match.
- **Right-click manual inspection** for images, videos, and audio files, even outside the auto-scan flow.
- **Trust list management** — bring your own trust anchors, or use the bundled C2PA Official Trust List + AI trust list.
- **Verification bookmarks** — save a verified result to a dedicated folder for later reference.
- **100% local processing** — see Privacy below.

### Supported formats

JPEG, PNG, WebP, AVIF, TIFF, SVG, HEIC, MP4, AVI, WAV, MP3, FLAC, PDF, and other formats covered by the C2PA specification.

### Open source

MIT-licensed, built on the upstream `c2pa-extension-validator` reference (originally by Microsoft). Source code: <https://github.com/Sanmarcsoft/verifieddit-extension>.

### Single Purpose Description

*(Required by Chrome Web Store policy — single sentence.)*

Verifieddit verifies the authenticity and provenance of images, videos, and audio on any webpage using the C2PA Content Credentials standard.

---

## Privacy Policy (draft)

> This draft is generated from a direct audit of the v1.0.0 source code and the
> bundled artifact `releases/verifieddit-chrome-1.0.0.zip` (SHA-256
> `65d66a547ee6e19ae3809a9dfd11a7dc2222f42bb96ae21407eadfba3d97d749`). It is
> intended to be reviewed and published at <https://www.verifieddit.com/privacy>
> (the URL referenced by the Chrome Web Store listing). The published version
> may already cover this ground.

**Last updated:** 2026-05-17  
**Applies to:** Verifieddit v1.0.0 Chrome extension  
**Publisher:** SanMarcSoft LLC

### Single purpose

Verifieddit has one purpose: to verify the authenticity and provenance of images, videos, and audio on any webpage using the open C2PA Content Credentials standard. Every permission the extension requests is in service of that single purpose. No feature in the extension exists for any unrelated purpose, and no permission is exercised for any unrelated purpose.

### What data the extension handles

Verifieddit is built to a **local-first, zero-server** principle. The extension does **not** collect, transmit, or store any user data on any remote server operated by us or by any third party. Specifically:

| Data category | Handling |
|---|---|
| **Media files (images, videos, audio)** on pages you visit | Verifieddit reads media bytes that your browser has already loaded for the page, and processes them inside your browser using locally-bundled WebAssembly (WASM). **Nothing is uploaded.** No copy of the media leaves your machine. |
| **URLs of verified media** | Not transmitted. Stored only inside your own browser when you explicitly click "Save Verification", in which case the URL is saved as a standard Chrome bookmark in a dedicated "verifieddit.com" folder under your own bookmarks. |
| **Verification results** | Computed and displayed in your browser only. Not transmitted. Not retained beyond the current page session unless you click "Save Verification" (see above). |
| **User preferences** (auto-scan toggle, imported trust lists) | Stored locally in `chrome.storage.local`. Never synced to any server. Never transmitted. |
| **Diagnostic state** (ephemeral init errors so the popup can show a banner if the C2PA engine fails to load) | Stored in `chrome.storage.session`, which is wiped automatically when the browser is closed. Never transmitted. |
| **Analytics / telemetry** | **None.** The extension code base contains zero analytics SDKs, zero beacon URLs, zero tracking calls, and makes zero outbound HTTP requests to any analytics or telemetry endpoint. |
| **Cookies** | **None.** The extension does not set or read cookies. |
| **`localStorage` / `sessionStorage`** | **Not used.** Only `chrome.storage.local` and `chrome.storage.session` are used, both isolated to the extension and never shared cross-origin. |
| **Personal account information** | **None.** Verifieddit does not require, collect, or accept any account, email, name, or identifier. |

### External network requests

The extension performs network requests only in the following narrow, user-initiated scenarios:

1. **Fetching the bytes of a media element** that your browser is already displaying on the page you are visiting. This is the same HTTP fetch that would occur if you right-clicked the image and chose "Save As" — it reuses your browser's cache where possible and goes to the same origin as the page. Verifieddit does not redirect the fetch elsewhere and does not store the result.
2. **Refreshing a trust list** only if you, the user, have explicitly imported a trust list with a `download_url` field. The bundled default trust lists do not set a `download_url` and are therefore never re-fetched at runtime. Custom imported trust lists are fetched only from the exact URL you provided when you imported them.

The extension does **not** call any first-party API operated by us, and does **not** make any cross-origin request that would reveal which pages you visit or which media you inspected.

### Data sharing

We do not collect any data, and therefore we do not share, sell, license, lease, trade, or transfer any data to any third party.

### Data retention

Because we do not receive any data, there is no retention. Local browser state (preferences, trust list cache, saved verification bookmarks) is governed by your browser and remains under your control. You can clear it any time from the extension's options page or from Chrome's normal data-management settings.

### Compliance with Google Chrome Web Store policies

- **Single Purpose policy**: every feature and permission in Verifieddit serves the single purpose of verifying media provenance. See "Single purpose" above.
- **User Data policy**: Verifieddit's use of permissions is limited to providing the single user-facing feature. The extension does not collect personal or sensitive user data, does not transmit any data off-device, does not sell or transfer data, and uses data only for the user-facing functionality each permission supports.

### Permissions and what they actually do

| Permission | Used for |
|---|---|
| `storage` | Save your auto-scan preference and a local cache of the loaded trust lists, both inside your own browser. |
| `tabs` | Filter your open tabs to http(s) origins so verification messages are only delivered to pages that can render them. We do not read or transmit the URL or title of any tab. |
| `activeTab` | Scope verification work to the tab you are actively viewing when you click the extension icon or use the right-click context menu. |
| `contextMenus` | Add "Inspect Content Credentials" to your right-click menu on images, videos, and audio elements. |
| `alarms` | Schedule a periodic refresh of any custom trust list you have imported (bundled lists are never re-fetched). |
| `bookmarks` | Save a verification result as a Chrome bookmark in a dedicated "verifieddit.com" folder, only when you explicitly click the **Save** button. The permission is never exercised automatically. |
| Host permission: `<all_urls>` | Allow the extension to detect C2PA Content Credentials on media from any website. Content Credentials are an open standard that may appear on any site; narrowing this scope would defeat the extension's purpose. The extension only reads media that is already visible on the page in your browser. |

### Contact

Questions about this policy or about Verifieddit's data handling: <support@verifieddit.com>.

### Changes to this policy

We will update the version date at the top of this document and the version field in the published policy at <https://www.verifieddit.com/privacy> whenever the policy changes. The change history is also publicly visible in this repository's git log.

---

*End of WEBSTORE_LISTING.md*
