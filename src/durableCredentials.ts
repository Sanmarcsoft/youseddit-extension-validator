/*
 *  Durable Content Credentials — the "3 pillars" detection.
 *
 *  Ported from the validated implementations in trusteddit-www
 *  (detectDurablePillars) and verifieddit-www (detectDurableCredentials).
 *
 *  Pure, offline, dependency-free. It works entirely from data the C2PA read
 *  pipeline already produces:
 *    - `signed`        — the asset carries a COSE signature / cert chain
 *    - `hasTimestamp`  — an RFC 3161 timestamp token is embedded
 *    - `assertionLabels` — labels harvested from the manifest JUMBF
 *
 *  The three pillars (matching the trusteddit.com verifier):
 *    P1 — Signed & timestamped : C2PA signature + RFC 3161 timestamp
 *    P2 — Durable watermark    : a c2pa.soft_binding assertion (TrustMark)
 *    P3 — Cloud-recoverable    : registered in the manifest store (soft binding)
 *
 *  P2 and P3 are both satisfied by the presence of the signed
 *  `c2pa.soft_binding` assertion: the binding key it carries is the watermark
 *  (P2) and the value registered in the manifest store for byBinding recovery
 *  (P3). A credential with only P1 is "embed-only" — valid, but lost when the
 *  file is re-encoded or its metadata is stripped.
 */

export interface DurablePillars {
  /** P1 — signed AND carries an RFC 3161 timestamp. */
  signedAndTimestamped: boolean
  /** P2 — durable watermark: a c2pa.soft_binding assertion is present. */
  trustmark: boolean
  /** P3 — cloud-recoverable: registered in the manifest store (soft binding). */
  manifestStore: boolean
  /** All three pillars present. */
  durable: boolean
  /** Pillars achieved, 0–3. */
  count: number
  /** True when only P1 holds — signature valid but no durable binding. */
  embedOnly: boolean
}

/**
 * Assertion labels that indicate a soft binding (TrustMark watermark or
 * perceptual fingerprint). C2PA stores these as a `c2pa.soft_binding`
 * assertion box; tooling has historically emitted both the underscore and
 * hyphen spellings, so we match either.
 */
const SOFT_BINDING_PATTERN = /soft[_-]?binding/i

/**
 * True when any of the supplied assertion labels denotes a soft binding.
 */
export function hasSoftBinding (assertionLabels: readonly string[] | null | undefined): boolean {
  if (assertionLabels == null) return false
  return assertionLabels.some((label) => SOFT_BINDING_PATTERN.test(label ?? ''))
}

/**
 * Classify the durability of a credential into the three pillars.
 */
export function detectDurablePillars (opts: {
  /** Manifest is signed (a COSE signature / cert chain is present). */
  signed: boolean
  /** An RFC 3161 timestamp token is embedded in the signature. */
  hasTimestamp: boolean
  /** Assertion labels harvested from the manifest JUMBF. */
  assertionLabels?: readonly string[] | null
}): DurablePillars {
  const softBinding = hasSoftBinding(opts.assertionLabels)

  const signedAndTimestamped = opts.signed && opts.hasTimestamp
  const trustmark = softBinding
  const manifestStore = softBinding

  const count =
    (signedAndTimestamped ? 1 : 0) +
    (trustmark ? 1 : 0) +
    (manifestStore ? 1 : 0)

  return {
    signedAndTimestamped,
    trustmark,
    manifestStore,
    durable: signedAndTimestamped && trustmark && manifestStore,
    count,
    embedOnly: signedAndTimestamped && count === 1
  }
}
