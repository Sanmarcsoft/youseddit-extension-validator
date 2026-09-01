/*
 *  CAI known-certificate anchors regression test.
 *  Real Photoshop / Firefly / Lightroom output chains through Adobe Product
 *  Services G3/G4 to Adobe Root CA G2, which the C2PA conformance list does
 *  NOT carry (its only Adobe cert is the vault-a-or2 issuing CA). Found live
 *  2026-09-01: every legitimate Adobe-signed asset rendered valid-but-untrusted.
 *  The fix bundles contentcredentials.org/trust/anchors.pem (the list Adobe's
 *  own Verify site trusts) as cai-known-anchors.json.
 *  Chain fixtures in fixtures/adobe-chain/ are extracted from the CAI's own
 *  example assets (github.com/contentauth/example-assets, MIT).
 *  Run: bun test test/caiKnownAnchors.test.ts
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { Buffer } from 'buffer'
import { certificateFromDer, PEMtoDER, type CertificateInfoExtended } from '../src/certs/certs'
import { checkTrustListInclusion } from '../src/trustlist'
import caiKnownAnchors from '../src/trust-anchors/cai-known-anchors.json'
import defaultTL from '../src/trust-anchors/default-trust-list.json'

const FIX = new URL('./fixtures/adobe-chain/', import.meta.url).pathname
const certFromPem = async (p: string): Promise<CertificateInfoExtended> =>
  await certificateFromDer(PEMtoDER(readFileSync(FIX + p, 'utf-8')))

// Populate x5t#S256 thumbprints (normally done by processDownloadedTrustList).
async function withThumbprints (tl: any): Promise<any> {
  const clone = JSON.parse(JSON.stringify(tl))
  for (const e of clone.entities) {
    for (const k of e.jwks.keys) {
      k['x5t#S256'] = (await certificateFromDer(Buffer.from(k.x5c[0], 'base64'))).sha256Thumbprint
    }
  }
  return clone
}

describe('cai-known-anchors.json — legitimate Adobe content must be trusted', () => {
  it('bundles Adobe Root CA G2', () => {
    const names = caiKnownAnchors.entities.map((e: any) => e.display_name)
    expect(names).toContain('Adobe Root CA G2')
  })

  it('trusts a real Firefly chain (leaf -> Product Services G4, root omitted)', async () => {
    const chain = [
      await certFromPem('firefly-leaf.pem'),
      await certFromPem('adobe-product-services-g4.pem')
    ]
    const match = await checkTrustListInclusion(chain, [await withThumbprints(caiKnownAnchors)])
    expect(match).not.toBeNull()
    expect(match?.entity.display_name).toBe('Adobe Root CA G2')
  })

  it('trusts a real Adobe Content Authenticity chain (leaf -> Product Services G3)', async () => {
    const chain = [
      await certFromPem('adobe-ca-leaf.pem'),
      await certFromPem('adobe-product-services-g3.pem')
    ]
    const match = await checkTrustListInclusion(chain, [await withThumbprints(caiKnownAnchors)])
    expect(match).not.toBeNull()
    expect(match?.entity.display_name).toBe('Adobe Root CA G2')
  })

  it('documents the gap: the conformance list alone does NOT trust the Firefly chain', async () => {
    const chain = [
      await certFromPem('firefly-leaf.pem'),
      await certFromPem('adobe-product-services-g4.pem')
    ]
    const match = await checkTrustListInclusion(chain, [await withThumbprints(defaultTL)])
    expect(match).toBeNull()
  })
})
