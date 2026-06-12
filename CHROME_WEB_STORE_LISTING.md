# Chrome Web Store Listing — Verifieddit

## Extension Name
Verifieddit - C2PA Content Credential Verifier

## Short Name
Verifieddit

## Summary (132 chars max)
Verify content authenticity using C2PA Content Credentials. Detect AI-generated and edited media directly in your browser.

## Category
Developer Tools

## Language
English

## Developer / Publisher Identity
- **Publisher (displayed on listing):** SanMarcSoft LLC
- **Developer website:** https://www.verifieddit.com
- **Marketing site:** https://www.verifieddit.com
- **Support / contact email:** support@verifieddit.com (publicly displayed on the listing; mailbox confirmed-by-user 2026-05-17)
- **Privacy policy URL:** https://www.verifieddit.com/privacy
- **Source repository:** https://github.com/Sanmarcsoft/verifieddit-extension

Listing the LLC as Publisher on the Chrome Web Store requires either (a) submitting from a Google Workspace account on a SanMarcSoft-owned domain, or (b) setting "SanMarcSoft LLC" as the verified Publisher name on an existing CWS developer account. CWS will display the registered publisher name to end users — verify spelling before submit.

## Single Purpose Description
Verify the authenticity and provenance of images, videos, and audio on any webpage using the C2PA content credentials standard.

## Detailed Description

Verifieddit is a free, open-source browser extension that verifies Content Credentials (C2PA) embedded in images, videos, and audio files on any website you visit.

**What are Content Credentials?**
Content Credentials are a new open standard (C2PA) for proving where digital content came from and how it was created or modified. Major organisations including Adobe, Google, Microsoft, and the BBC have adopted the C2PA standard.

**Key Features:**

- Automatic Detection: Scans media elements on any webpage for C2PA content credentials
- Visual Indicators: Shows overlay icons on media with verified content credentials (green = valid, yellow = warning, red = invalid)
- AI Content Detection: Identifies AI-generated content based on C2PA metadata and digital source types
- Detailed Provenance: View the full chain of custody — who created the content, what tools were used, and how it was modified
- Certificate Verification: Validates signer certificates against the C2PA Trust List
- Right-Click Inspection: Right-click any image, video, or audio to inspect its Content Credentials
- Trust List Management: Import custom trust anchors and TSA certificates
- Auto-Scan Toggle: Enable or disable automatic scanning per your preference

**Privacy-First:**
- All processing happens locally in your browser using WebAssembly
- No media files are ever uploaded to any server
- No analytics, tracking, or telemetry
- No account required

**Supported Formats:**
JPEG, PNG, WebP, AVIF, TIFF, SVG, HEIC, MP4, AVI, WAV, MP3, and PDF.

**Open Source:**
Built on the open-source C2PA Extension Validator (MIT-licensed, upstream by Microsoft). View the source code at https://github.com/Sanmarcsoft/verifieddit-extension

Learn more at https://www.verifieddit.com

## Privacy Policy URL
https://www.verifieddit.com/privacy

## Permission Justifications

### storage
Saves user preferences (auto-scan toggle, theme) and custom trust lists locally in the browser.

### activeTab
Accesses the currently active tab when the user clicks the toolbar action or selects an item from the right-click context menu, scoped to that single interaction.

### contextMenus
Adds "Inspect Content Credentials" to the right-click context menu on images, videos, and audio elements.

### alarms
Schedules periodic trust list refreshes (every 24 hours) to keep certificate validation up to date.

### Host Permissions: <all_urls>
The extension needs access to all URLs because C2PA content credentials can appear on any website. The extension scans image, video, and audio elements on the current page to detect and verify cryptographic provenance data embedded in media files. Without broad host access, users would need to manually allowlist every website, defeating the purpose of automatic content credential detection.

## Screenshots Needed
1. Extension detecting C2PA credentials on a webpage (1280x800)
2. Popup showing validation results
3. Right-click context menu "Inspect Content Credentials"
4. Overlay icon on a verified image

## Store Icon
Use vd128.png (128x128), generated from the SanMarcSoft Verifieddit logo
