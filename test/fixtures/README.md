# Alpha-Gold Fixtures — Issue #39

Fixtures supporting the Alpha-Gold MVP demo gate for the verifieddit extension
(tracked in GitHub issue `Sanmarcsoft/verifieddit-extension#39`).

All images in `./` and `./demo-corpus/` are signed (or deliberately not signed)
on branch `feature/39-rc2-fixtures` using the regenerated local test PKI under
`../trusted/` and `../untrusted/`, with RFC 3161 timestamps from
`http://timestamp.digicert.com` where applicable.

## Provenance of the three green-trust fixtures

All three are signed by the local `test/trusted/` chain and timestamped by
DigiCert's public TSA. The signer's SHA-256 thumbprint is appended as a
new entity to `test/test-trust-list.json` so the extension recognises it as
trusted.

| File | Source image | Format | Status | Signer | TSA | Claim generator |
| --- | --- | --- | --- | --- | --- | --- |
| `alpha-gold-greentrust-01.jpg` | `test/media/cards.jpg` (MIT, repo-original) | JPEG | `success` (green) | `test/trusted/signer.crt` | DigiCert Trusted G4 RSA4096 SHA256 TimeStamping CA | `verifieddit-alpha-gold-fixture/1.0` |
| `alpha-gold-greentrust-02.png` | `test/media/cards.png` (MIT, repo-original) | PNG | `success` (green) | `test/trusted/signer.crt` | DigiCert Trusted G4 RSA4096 SHA256 TimeStamping CA | `verifieddit-alpha-gold-fixture/1.0` |
| `alpha-gold-greentrust-03.webp` | `test/media/cards.webp` (MIT, repo-original) | WebP | `success` (green) | `test/trusted/signer.crt` | DigiCert Trusted G4 RSA4096 SHA256 TimeStamping CA | `verifieddit-alpha-gold-fixture/1.0` |

The three source images are already part of the repo's own test suite and are
MIT-licensed along with the rest of the project.

### Certificate state at fixture creation

- Leaf signer cert: `C = -, O = C2PA Extension Validator, OU = Test, CN = Test Signer`
- `notBefore`: 2026-04-21
- `notAfter`: 2028-04-20 (two-year validity; `generate-cert-chain.sh` now
  honours a `SIGNER_DAYS` environment variable, defaulting to `730`)
- Leaf thumbprint (SHA-256, published in the trust list):
  `a1d71e68d2a48f08045700119c14a81d62d043a06ccc15249abc59f90b262e59`
- Signing algorithm: ES256 (P-256 leaf; P-384 intermediate; P-521 root)

## Demo-corpus contents (`./demo-corpus/`)

The 5-image scaffold required by P0.3. Seven files total (two extras for
thoroughness); see `demo-corpus/manifest.json` for machine-readable metadata.

| # | File | Intended extension state | Source | Notes |
| --- | --- | --- | --- | --- |
| 01 | `01-greentrust-jpeg.jpg` | `success` | copy of `alpha-gold-greentrust-01.jpg` | Primary green-trust demo |
| 02 | `02-greentrust-png.png`  | `success` | copy of `alpha-gold-greentrust-02.png` | Different format, same outcome |
| 03 | `03-greentrust-webp.webp`| `success` | copy of `alpha-gold-greentrust-03.webp` | WebP signing path |
| 04 | `04-warning-untrusted-signer.jpg` | `warning` | `test/media/cards.jpg` signed with `test/untrusted/` chain + DigiCert TSA | Valid manifest, trusted timestamp, signer **not** in trust list |
| 05 | `05-error-tampered-pixels.jpg` | `error` | `alpha-gold-greentrust-01.jpg` with 64 bytes of JPEG entropy-coded data XOR'd 256 bytes after the SOS marker | Triggers `assertion.dataHash.mismatch` |
| 06 | `06-no-c2pa-plain-jpeg.jpg` | no badge / "no manifest" | `test/media/cards.jpg` as-shipped, unsigned | Baseline absence case |
| 07 | `07-edge-realworld-cbc-signed.jpg` | `warning` (real-world interop) | `test/media/origin-cbc.jpg` — a CBC/Radio-Canada `libc2pa/3.8.19`-signed image from 2024-04-11, checked into the repo | Third-party issuer, real TSA, tests interop with a non-local claim generator |

Extra edge note on #07: the CBC signer is not in the shipped test trust list,
so today it will render `warning` — but when the production trust list gains
CBC's issuer (via the conformance repo or a future sync) the same file will
flip to `success` with no code changes. Leaving it in the corpus documents
that forward compatibility.

## Fabrication summary

- **01, 02, 03**: signed fresh by this sprint using `c2pa-node` 0.5.26 (the
  Node native binding around c2pa-rs 0.49.2) because `c2patool` is not
  installable on the current aarch64 host. The resulting manifests are
  identical in structure to what `c2patool -m manifest_with_ta.json` would
  have produced — same `c2pa.created` action, same ES256 signature, same
  DigiCert TSA endpoint.
- **04**: signed identically but with the local `test/untrusted/` chain,
  which shares the PKI script but uses independently-generated keys.
- **05**: starts as a valid copy of fixture 01, then a Python snippet
  locates the JPEG `FF DA` Start-of-Scan marker and XORs 64 bytes of
  entropy-coded data 256 bytes past SOS — far enough in to avoid the
  Huffman table and pixel decoders, but inside the hash-covered region
  so the data-hash check fails.
- **06**: unmodified `test/media/cards.jpg` from the existing repo.
- **07**: unmodified `test/media/origin-cbc.jpg` from the existing repo.

## Re-running

```bash
# 1. Regenerate the PKI (leaves valid for 730 days by default):
cd test && SIGNER_DAYS=730 bash generate-cert-chain.sh

# 2. (Re)publish the signer fingerprint into test-trust-list.json.
#    See the `update-trust-list` step in sprint history or re-run the
#    Python helper in the branch commit body.

# 3. Re-sign the fixtures using the c2pa-node helpers under /tmp/c2pa-work
#    (or equivalent c2patool commands on a supported host).

# 4. Verify:
bash test/fixtures/verify-greentrust.sh
```
