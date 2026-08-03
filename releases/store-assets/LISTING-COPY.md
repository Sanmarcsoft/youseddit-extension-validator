# Verifieddit v1.1.1 Chrome Web Store listing copy

Every claim below was checked against the v1.1.1 source. No em-dashes.

---

## Item name (75 max)

```
Verifieddit - C2PA Content Credential Verifier
```

45 characters. Carries the two highest-intent keywords, "C2PA" and "Content Credential", plus the category word "Verifier".

---

## Summary (132 hard cap), already in the shipped manifest

```
Verify content authenticity with C2PA Content Credentials. See who signed a file, whether it was altered, and declared AI origin.
```

129 characters.

---

## Detailed description

```
Most photos and videos online carry no proof of where they came from, or whether they were altered since. Verifieddit checks the ones that do.

It does not just display what a file says about itself. It rebuilds the signature on the file's C2PA Content Credential and traces the signing certificate back to an issuer your extension already trusts, the way your browser checks a padlock before you trust a website. A signed file that was altered, or whose certificate chain is broken, gets caught here instead of being shown to you as fine.

Free, open source, no account, no sign-up, nothing to unlock.


WHAT THE BADGES MEAN

Browse normally. Media carrying Content Credentials picks up a small badge in the corner.

GREEN: the signature checks out and the certificate traces back to a trust anchor already loaded, whether we shipped it or you added it yourself.

YELLOW: the manifest is valid, but the signer is not in any of your trust lists. Signed by someone, and you decide whether that someone counts.

RED: the file was altered after it was signed. The bytes no longer match what was signed.

NO BADGE: nothing signed was found here. That means unverified, not clean, and today that is most of the web.

That fourth state is the one most tools quietly skip. Absence of a warning is not evidence of authenticity, and this extension will not let you read it that way.


WHAT YOU SEE WHEN YOU OPEN IT

Click any badge, or right click any image, video or audio file and choose "Verify with Verifieddit", and you get the whole record:

- who signed it, and which trust list matched
- the certificate, and who issued it to whom
- whether an RFC 3161 trusted timestamp is present
- an interactive provenance graph of every ingredient and edit in the file's history, which you can pan, zoom, fit, expand node by node, or open full screen
- and when verification fails, exactly what failed

The same panel is available from the toolbar popup for whatever is on the page you are viewing.


ABOUT THE AI LABEL

The popup shows a row called "AI (declared by signer)". Read that label literally. It reports the IPTC digitalSourceType that a signer wrote into their own signed manifest. It does not analyse pixels and it does not guess.

Media with no signed manifest, which is most of what you will encounter, reads "not declared" rather than "no", because an absent declaration is not evidence of human authorship. Anyone selling you an AI detector that works on an unsigned JPEG is selling you a guess.


IT TELLS YOU WHAT IT CANNOT CONFIRM

Content Credentials have more than one layer, and the panel scores three: signed and timestamped, a durable watermark, and cloud recovery if the file is re-encoded or stripped.

Often only the first can be confirmed from what is in the file, and the panel says so plainly, "1 of 3 verified", instead of showing you a clean result you would only discover was fragile later. An embed-only credential is real, but it does not survive a screenshot.


YOUR PRIVACY

Verification runs entirely inside your browser using locally bundled WebAssembly. Media bytes never leave your machine. There are no analytics, no telemetry, no cookies, no account, and no history of what you inspected.

One optional feature can send something, and it is off until you switch it on. If you enable the durable credential check, the extension asks our manifest store whether a credential is registered for an image, sending a short perceptual fingerprint of that picture. Never the image, never the page, and nothing identifying you or your device. You turn it on from the panel itself, where it explains exactly what would be sent before anything is, and off again whenever you like. Full detail in section 2.9 of the privacy policy.


WHY IT ASKS FOR ACCESS TO ALL SITES

Content Credentials can appear on any page you visit, so the extension has to be able to read media on the page you are actually looking at. It makes no other use of that access.


TRUST IS YOURS TO SET

Five trust lists ship built in, 56 entities in total: the C2PA Conformance Program anchors, 29 signing and 21 official timestamp authorities, an AI trust list, and the Trusteddit signing and timestamp anchors.

Add your own trust list from a file or a web address at any time, or remove any list you would rather not rely on. The trust decision is configuration, not something we make on your behalf.


SUPPORTED FORMATS

JPEG, PNG, WebP, AVIF, TIFF, SVG, HEIC, HEIF, DNG, ARW, MP4, AVI, WAV, MP3, M4A and PDF.


WHO THIS IS FOR

Journalists and picture desks checking wire images before publication. Photographers proving their own work. Researchers, moderators and archivists tracing where a file came from. Anyone who has shared something that turned out to be fake and would rather check first.


IF YOU SIGN YOUR OWN WORK

Verifying is the free half. If you are the photographer, the newsroom or the team that has to prove its own content, Trusteddit, from the same publisher, issues the certificates and signs the Content Credentials this extension reads. It also covers organisations that need to document content provenance for regulatory or compliance reasons, with enterprise PKI and Chrome enterprise policy deployment across managed fleets.


ABOUT

Free and open source, MIT licensed. Source code, issue tracker and full release history at github.com/Sanmarcsoft/verifieddit-extension.

Published by SanMarcSoft LLC as an independent fork of Microsoft's open source C2PA validator, built on the Content Authenticity Initiative's c2pa toolkit. SanMarcSoft is not affiliated with, endorsed by, or partnered with Microsoft, Adobe, or the Content Authenticity Initiative.
```

---

## Why this is built the way it is

**The honesty is the marketing.** The strongest line here is `NO BADGE: nothing signed was found here. That means unverified, not clean.` Every competitor hides the fourth state. Naming it is what makes the other three believable, and it is what a professional picture desk actually needs before it trusts a tool.

**Nothing claims more than the code performs.** No "detects AI", no "detects deepfakes", no "proves authenticity". Those phrases would rank, and they would be false on unsigned media, which is most media. The AI section converts that limitation into a differentiator instead.

**SEO, honestly.** The terms people actually search sit in the first two lines and recur naturally: C2PA, Content Credentials, content authenticity, verify, signed, altered, provenance, AI. Plus long-tail phrasing throughout ("who signed a file", "certificate chain", "trusted timestamp", "image provenance", "trust list"). The Chrome Web Store ranks mainly on the name and description, so the keyword weight is front-loaded without stuffing.

**Audience terms are a section, not a sprinkle.** "WHO THIS IS FOR" captures journalist, newsroom, photographer, picture desk, researcher, moderator and archivist as search terms while doing real persuasive work.
