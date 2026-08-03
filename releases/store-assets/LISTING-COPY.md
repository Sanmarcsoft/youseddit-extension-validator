# Verifieddit v1.1.1 Chrome Web Store listing copy

Every claim checked against the v1.1.1 source. No em-dashes.

---

## Item name (75 max)

```
Verifieddit - C2PA Content Credential Verifier
```

45 characters. Carries the two highest-intent search terms, "C2PA" and "Content Credential", plus the category word "Verifier".

---

## Summary (132 hard cap), already in the shipped manifest

```
Verify content authenticity with C2PA Content Credentials. See who signed a file, whether it was altered, and declared AI origin.
```

129 characters.

---

## Detailed description

```
Most photos and videos online carry no proof of where they came from, or whether they were altered since. Verifieddit checks the ones that do, free, in your browser, with no account.

It does not just repeat what a file says about itself. It rebuilds the signature on the file's C2PA Content Credential and traces the signing certificate back to an issuer you trust, the way your browser checks a padlock before you trust a website. A signed photo that was altered, or whose certificate chain is broken, gets caught here instead of being shown to you as fine.

Browse normally. Media carrying Content Credentials picks up a small badge in the corner.


THE FOUR ANSWERS

GREEN: the signature checks out and the certificate traces back to a trust anchor already loaded, whether we shipped it or you added it yourself.

YELLOW: the manifest is valid, but the signer is in none of your trust lists. Signed by somebody, and you decide whether that somebody counts.

RED: the file was altered after it was signed. The bytes no longer match what was signed.

NO BADGE: nothing signed was found here. That means unverified, not clean, and today that is most of the web.

That fourth answer is the one most verification tools quietly skip. Absence of a warning is not evidence of authenticity, and this extension will not let you read it that way. It is also why you can believe the other three.


WHAT YOU SEE WHEN YOU OPEN IT

Click any badge, or right click any image, video or audio file and choose "Verify with Verifieddit", and you get the whole record:

- who signed it, and which trust list matched
- the signing certificate, and who issued it to whom
- whether an RFC 3161 trusted timestamp is present
- an interactive provenance graph of every ingredient and edit in the file's history, which you can pan, zoom, fit, expand node by node, or open full screen
- and when verification fails, exactly what failed, rather than a bare red mark

The same panel is one click away in the toolbar popup for whatever is on the page you are viewing.


ABOUT THE AI LABEL

The popup shows a row called "AI (declared by signer)". Read that label literally. It reports the IPTC digitalSourceType a signer wrote into their own signed manifest. It does not analyse pixels and it does not guess.

Media carrying no signed manifest, which is most of what you will meet online, reads "not declared" rather than "no", because an absent declaration is not evidence of human authorship. Any AI image detector that claims a verdict on an unsigned JPEG is guessing, and this one will not pretend otherwise.


IT TELLS YOU WHAT IT CANNOT CONFIRM

Content Credentials have more than one layer, and the panel scores three: signed and timestamped, a durable watermark, and cloud recovery if the file is re-encoded or stripped.

Often only the first can be confirmed from what is inside the file, and the panel says so plainly, "1 of 3 verified", instead of handing you a clean result you would discover was fragile later. An embed-only credential is real, but it does not survive a screenshot.


YOUR PRIVACY

Verification runs entirely inside your browser using locally bundled WebAssembly. Media bytes never leave your machine. No analytics, no telemetry, no cookies, no account, and no record of what you inspected.

One optional feature can send anything at all, and it is off until you switch it on. Enable the durable credential check and the extension asks our manifest store whether a credential is registered for an image, sending a short perceptual fingerprint of that picture. Never the image, never the page, and nothing identifying you or your device. You turn it on from the panel itself, which states exactly what would be sent before anything is, and off again whenever you like. Section 2.9 of the privacy policy has the detail.


WHY IT ASKS FOR ACCESS TO ALL SITES

Content Credentials can appear on any page you visit, so the extension has to read the media on the page you are actually looking at. It makes no other use of that access.


TRUST IS YOURS TO SET

Five trust lists ship built in, 56 entities in total: the C2PA Conformance Program anchors, 29 for signing and 21 official timestamp authorities, an AI trust list, and the Trusteddit signing and timestamp anchors.

Add your own trust list from a file or a web address at any time, or remove any list you would rather not rely on. Who counts as trustworthy is configuration you control, not a decision we make for you.


SUPPORTED FORMATS

JPEG, PNG, WebP, AVIF, TIFF, SVG, HEIC, HEIF, DNG, ARW, MP4, AVI, WAV, MP3, M4A and PDF.


WHO USES IT

Journalists and picture desks checking wire photos before publication. Photographers and studios proving their own work is theirs. Researchers, moderators, archivists and legal teams tracing where a file came from. Anyone who has shared something that turned out to be fake and would rather check first.


IF YOU SIGN YOUR OWN WORK

Verifying is the free half. If you are the photographer, the newsroom or the team that has to prove its own content, Trusteddit, from the same publisher, issues the certificates and signs the Content Credentials this extension reads. It also serves organisations documenting content provenance for regulatory or compliance reasons, with enterprise PKI and Chrome enterprise policy deployment across managed fleets.


ABOUT

Free and open source, MIT licensed. Source code, issue tracker and full release history at github.com/Sanmarcsoft/verifieddit-extension.

Published by SanMarcSoft LLC as an independent fork of Microsoft's open source C2PA validator, built on the Content Authenticity Initiative's c2pa toolkit. SanMarcSoft is not affiliated with, endorsed by, or partnered with Microsoft, Adobe, or the Content Authenticity Initiative.
```

---

## How this is engineered

### Persuasion

**The first screen does four jobs.** Problem, mechanism, the objection handler ("free, in your browser, with no account"), and the strongest sentence in the listing: *"gets caught here instead of being shown to you as fine."* That line was buried three paragraphs down in the first draft. A reader who bounces never reaches a differentiator, however good it is.

**The honesty is the marketing.** `NO BADGE: nothing signed was found here. That means unverified, not clean.` Competitors omit the fourth state because it sounds like a limitation. Naming it is what makes the other three credible, and it is the sentence the target professional said turned a maybe into an install.

**Every limitation is converted, not hidden.** The AI section and "IT TELLS YOU WHAT IT CANNOT CONFIRM" both take a constraint and make it the reason to trust the tool. `Any AI image detector that claims a verdict on an unsigned JPEG is guessing` competes directly against the category's biggest overclaim.

### SEO

**Front-loaded, not stuffed.** High-intent terms land in the first two sentences and recur naturally: C2PA, Content Credentials, content authenticity, verify, signed, altered, certificate, provenance, AI.

**Long-tail phrasing throughout**, matching how people actually search: "who signed a photo", "whether it was altered", "certificate chain", "trusted timestamp", "AI image detector", "content provenance", "image metadata", "verify photo authenticity".

**Audience terms earn their place.** "WHO USES IT" captures journalist, picture desk, photographer, studio, researcher, moderator, archivist and legal team as searchable terms while doing real persuasive work rather than sitting as a keyword list.

**Format names are search terms too.** JPEG, PNG, WebP, AVIF, HEIC, DNG, ARW, MP4, PDF each catch "verify [format] C2PA" queries.

**What is deliberately absent:** "detects AI", "deepfake detector", "proves authenticity". They rank, and they are false on unsigned media, which is most media. The AI section turns that into the differentiator instead. A listing that overclaims gets pulled, and this product's entire premise is not overclaiming.
