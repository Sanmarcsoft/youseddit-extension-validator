/*
 *  Trust-path validation tests (issue #112, RedTeam CRITICAL-1).
 *  Proves the "Trusted" badge is granted only on a signature-verified path,
 *  not on mere thumbprint presence in an attacker-controlled chain array.
 *  Run: bun test test/trustPath.test.ts
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { Buffer } from 'buffer'
import { certificateFromDer, PEMtoDER, type CertificateInfoExtended } from '../src/certs/certs'
import { checkTrustListInclusion } from '../src/trustlist'
import trustedditTL from '../src/trust-anchors/trusteddit-trust-list.json'
import defaultTL from '../src/trust-anchors/default-trust-list.json'

const PKI = '/config/workspace/projects/sanmarcsoft/trusteddit-pki-services/certs/'
const certFromPem = async (p: string): Promise<CertificateInfoExtended> =>
  await certificateFromDer(PEMtoDER(readFileSync(PKI + p, 'utf-8')))

// Clone the bundled Trusteddit trust list and populate x5t#S256 thumbprints
// (normally done by processDownloadedTrustList at load time).
async function trustedditList (): Promise<any> {
  const tl = JSON.parse(JSON.stringify(trustedditTL))
  for (const e of tl.entities) {
    for (const k of e.jwks.keys) {
      k['x5t#S256'] = (await certificateFromDer(Buffer.from(k.x5c[0], 'base64'))).sha256Thumbprint
    }
  }
  return tl
}

describe('checkTrustListInclusion — verified path (#112)', () => {
  it('trusts a genuine Trusteddit chain (leaf -> ICA -> root)', async () => {
    const chain = [
      await certFromPem('signing.crt'),
      await certFromPem('intermediate_ca.crt'),
      await certFromPem('root_ca.crt')
    ]
    const match = await checkTrustListInclusion(chain, [await trustedditList()])
    expect(match).not.toBeNull()
    expect(match?.entity.name).toContain('Trusteddit')
  })

  it('trusts a genuine leaf even when the chain omits the root (external anchor)', async () => {
    const chain = [await certFromPem('signing.crt'), await certFromPem('intermediate_ca.crt')]
    const match = await checkTrustListInclusion(chain, [await trustedditList()])
    expect(match).not.toBeNull()
  })

  it('does NOT trust an unrelated leaf even with the Trusteddit CA pasted into the chain', async () => {
    // Attacker leaf: an unrelated cert NOT issued by the Trusteddit CA.
    const attackerLeaf = await certificateFromDer(
      Buffer.from((defaultTL as any).entities[0].jwks.keys[0].x5c[0], 'base64')
    )
    const pastedCa = await certFromPem('intermediate_ca.crt') // public CA, copied verbatim
    const chain = [attackerLeaf, pastedCa]

    // The pasted CA thumbprint IS present in the chain — the OLD code matched here.
    const tl = await trustedditList()
    expect(chain.some((c) => c.sha256Thumbprint === pastedCa.sha256Thumbprint)).toBe(true)

    // The NEW code requires a verified path: the attacker leaf was not signed by
    // the pasted CA, so no trust is granted.
    const match = await checkTrustListInclusion(chain, [tl])
    expect(match).toBeNull()
  })
})
