/*
 * Regression tests for the expired-signing-certificate verdict.
 *
 * The case that drove this module: `07-edge-realworld-cbc-signed.jpg`, a real
 * CBC/Radio-Canada photograph signed through Truepic Lens on 2024-04-11. Its
 * leaf certificate expired on 2025-04-11. c2pa-rs reports the asset as
 * `validation_state: Valid` with a single `signingCredential.untrusted`
 * warning, and confirms `timeStamp.validated` plus `timeStamp.trusted`.
 *
 * v1.2.4 shipped #160, which added the CAI known-certificate anchors. Those
 * carry a Truepic RootCA entity, so the signer began matching a trust list.
 * That moved the asset past the `trustList == null` early return in
 * getC2PAStatus and into the expired-certificate branch, which returned
 * 'error' because the Truepic Lens TSA is not among the 21 C2PA conformance
 * timestamp authorities the extension bundles. A trust-list improvement turned
 * an intact, correctly signed news photograph red.
 *
 * Red must mean the bytes do not match what was signed. An expired certificate
 * is never evidence of that, which is what NON_FATAL_VALIDATION_CODE already
 * says about `signingCredential.expired`. These tests pin the badge to amber.
 */

import { describe, expect, it } from 'bun:test'
import {
  buildExpiryEvidence,
  classifyExpiry,
  expiryDegradesTo,
  expiryReason,
  type ExpiryEvidence
} from '../src/signatureValidity'

/** The CBC asset's real dates, read out of the shipped fixture with openssl. */
const CBC_VALID_FROM = new Date('2024-04-11T20:02:29Z')
const CBC_VALID_TO = new Date('2025-04-11T20:02:28Z')
const CBC_SIGNED_AT = new Date('2024-04-11T20:26:53Z')
const TODAY = new Date('2026-09-04T12:00:00Z')

function evidence (over: Partial<ExpiryEvidence> = {}): ExpiryEvidence {
  return {
    validFrom: CBC_VALID_FROM,
    validTo: CBC_VALID_TO,
    timestampTimes: [CBC_SIGNED_AT],
    tsaTrusted: false,
    now: TODAY,
    ...over
  }
}

describe('classifyExpiry', () => {
  it('reports a certificate still inside its window as not expired', () => {
    const v = classifyExpiry(evidence({ now: new Date('2024-06-01T00:00:00Z') }))
    expect(v.kind).toBe('not-expired')
  })

  it('treats an unknown validity window as not expired rather than guessing', () => {
    const v = classifyExpiry(evidence({ validTo: null }))
    expect(v.kind).toBe('not-expired')
  })

  it('reports the CBC case as covered by an untrusted timestamp authority', () => {
    const v = classifyExpiry(evidence())
    expect(v.kind).toBe('covered-untrusted-tsa')
  })

  it('reports a trusted TSA covering the signature as fully covered', () => {
    const v = classifyExpiry(evidence({ tsaTrusted: true }))
    expect(v.kind).toBe('covered-trusted')
  })

  it('reports an expired certificate with no timestamp as uncovered', () => {
    const v = classifyExpiry(evidence({ timestampTimes: [] }))
    expect(v.kind).toBe('uncovered')
  })

  it('does not accept a timestamp made after the certificate expired', () => {
    const v = classifyExpiry(evidence({
      timestampTimes: [new Date('2025-08-01T00:00:00Z')],
      tsaTrusted: true
    }))
    expect(v.kind).toBe('uncovered')
  })

  it('does not accept a timestamp made before the certificate was issued', () => {
    const v = classifyExpiry(evidence({
      timestampTimes: [new Date('2020-01-01T00:00:00Z')],
      tsaTrusted: true
    }))
    expect(v.kind).toBe('uncovered')
  })

  it('accepts the covering timestamp when several are present', () => {
    const v = classifyExpiry(evidence({
      timestampTimes: [new Date('2025-08-01T00:00:00Z'), CBC_SIGNED_AT]
    }))
    expect(v.kind).toBe('covered-untrusted-tsa')
  })

  it('ignores an unparseable timestamp instead of throwing', () => {
    const v = classifyExpiry(evidence({ timestampTimes: [new Date('nonsense')] }))
    expect(v.kind).toBe('uncovered')
  })
})

describe('expiryDegradesTo', () => {
  it('never returns error, because expiry is not an integrity failure', () => {
    const kinds = ['not-expired', 'covered-trusted', 'covered-untrusted-tsa', 'uncovered'] as const
    for (const kind of kinds) {
      expect(expiryDegradesTo({ kind })).not.toBe('error')
    }
  })

  it('keeps a covered, trusted signature green', () => {
    expect(expiryDegradesTo({ kind: 'covered-trusted' })).toBe('success')
  })

  it('keeps an unexpired certificate green', () => {
    expect(expiryDegradesTo({ kind: 'not-expired' })).toBe('success')
  })

  it('degrades the CBC case to amber, not red', () => {
    expect(expiryDegradesTo(classifyExpiry(evidence()))).toBe('warning')
  })

  it('degrades an uncovered expired certificate to amber, not red', () => {
    expect(expiryDegradesTo({ kind: 'uncovered' })).toBe('warning')
  })
})

describe('expiryReason', () => {
  it('says nothing when there is nothing to say', () => {
    expect(expiryReason({ kind: 'not-expired' })).toBeNull()
    expect(expiryReason({ kind: 'covered-trusted' })).toBeNull()
  })

  it('names the unrecognised authority rather than implying tampering', () => {
    const reason = expiryReason({ kind: 'covered-untrusted-tsa' }) ?? ''
    expect(reason).toContain('expired')
    expect(reason.toLowerCase()).not.toContain('altered')
    expect(reason.toLowerCase()).not.toContain('tamper')
  })

  it('is explicit that an uncovered expiry is not an integrity finding', () => {
    const reason = expiryReason({ kind: 'uncovered' }) ?? ''
    expect(reason).toContain('expired')
    expect(reason.toLowerCase()).not.toContain('altered')
  })
})

// ---------------------------------------------------------------------------
// buildExpiryEvidence — the adapter from wire shapes to the pure decision.
//
// The hazard it exists to contain: CertificateInfo.validFrom/validTo carry the
// `isoDateString` type alias but hold a LOCALISED en-US display string
// ("Apr 11, 2025"), because certs.ts runs them through Intl.DateTimeFormat
// before they ever reach a consumer. Anything comparing them as instants is
// reading a string that has already lost its time of day.
// ---------------------------------------------------------------------------

describe('buildExpiryEvidence', () => {
  it('prefers the ISO notAfter over the localised display string', () => {
    const e = buildExpiryEvidence(
      [{ notBefore: '2024-04-11T20:02:29Z', notAfter: '2025-04-11T20:02:28Z', validFrom: 'Apr 11, 2024', validTo: 'Apr 11, 2025' }],
      [],
      false,
      TODAY
    )
    expect(e.validTo?.toISOString()).toBe('2025-04-11T20:02:28.000Z')
    expect(e.validFrom?.toISOString()).toBe('2024-04-11T20:02:29.000Z')
  })

  it('falls back to the localised string when no ISO field is present', () => {
    const e = buildExpiryEvidence(
      [{ validFrom: 'Apr 11, 2024', validTo: 'Apr 11, 2025' }],
      [],
      false,
      TODAY
    )
    // Parsed, not discarded: a cached pre-upgrade result must still classify.
    expect(e.validTo).not.toBeNull()
    expect(Number.isNaN(e.validTo!.getTime())).toBe(false)
  })

  it('reads genTime from every timestamp token, skipping absent ones', () => {
    const e = buildExpiryEvidence(
      [{ notAfter: '2025-04-11T20:02:28Z' }],
      [{ genTime: '2024-04-11T20:26:53Z' }, { genTime: undefined }, { genTime: '' }],
      false,
      TODAY
    )
    expect(e.timestampTimes.length).toBe(1)
    expect(e.timestampTimes[0].toISOString()).toBe('2024-04-11T20:26:53.000Z')
  })

  it('an empty cert chain yields an unreadable window, never a false expiry', () => {
    const e = buildExpiryEvidence([], [], false, TODAY)
    expect(e.validTo).toBeNull()
    expect(classifyExpiry(e).kind).toBe('not-expired')
  })

  it('null inputs do not throw', () => {
    const e = buildExpiryEvidence(null, null, false, TODAY)
    expect(e.timestampTimes).toEqual([])
    expect(expiryDegradesTo(classifyExpiry(e))).toBe('success')
  })

  it('end to end on the real CBC shape: amber, never red', () => {
    const e = buildExpiryEvidence(
      [{ notBefore: '2024-04-11T20:02:29Z', notAfter: '2025-04-11T20:02:28Z' }],
      [{ genTime: '2024-04-11T20:26:53Z' }],
      false,
      TODAY
    )
    const v = classifyExpiry(e)
    expect(v.kind).toBe('covered-untrusted-tsa')
    expect(expiryDegradesTo(v)).toBe('warning')
  })

  it('the same CBC shape with a recognised TSA is green', () => {
    const e = buildExpiryEvidence(
      [{ notBefore: '2024-04-11T20:02:29Z', notAfter: '2025-04-11T20:02:28Z' }],
      [{ genTime: '2024-04-11T20:26:53Z' }],
      true,
      TODAY
    )
    expect(expiryDegradesTo(classifyExpiry(e))).toBe('success')
  })

  it('an unparseable date string degrades to unreadable, not to expired', () => {
    const e = buildExpiryEvidence([{ notAfter: 'not a date at all' }], [], false, TODAY)
    expect(e.validTo).toBeNull()
    expect(classifyExpiry(e).kind).toBe('not-expired')
  })
})
