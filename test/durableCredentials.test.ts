/*
 *  Unit tests for the Durable Content Credentials "3 pillars" detector.
 *  Run with:  bun test test/durableCredentials.test.ts
 *  (Playwright only scans ./test/e2e, so this file is ignored by `npm test`.)
 */
import { describe, it, expect } from 'bun:test'
import { detectDurablePillars, hasSoftBinding } from '../src/durableCredentials'

describe('hasSoftBinding', () => {
  it('returns false for null / empty', () => {
    expect(hasSoftBinding(null)).toBe(false)
    expect(hasSoftBinding(undefined)).toBe(false)
    expect(hasSoftBinding([])).toBe(false)
  })

  it('matches both the underscore and hyphen spellings', () => {
    expect(hasSoftBinding(['c2pa.soft_binding'])).toBe(true)
    expect(hasSoftBinding(['c2pa.soft-binding'])).toBe(true)
    expect(hasSoftBinding(['c2pa.hash.data', 'c2pa.soft_binding'])).toBe(true)
  })

  it('ignores unrelated assertion labels', () => {
    expect(hasSoftBinding(['c2pa.hash.data', 'c2pa.actions', 'stds.schema-org.CreativeWork'])).toBe(false)
  })
})

describe('detectDurablePillars', () => {
  it('unsigned asset → no pillars', () => {
    const p = detectDurablePillars({ signed: false, hasTimestamp: false, assertionLabels: [] })
    expect(p).toMatchObject({ signedAndTimestamped: false, trustmark: false, manifestStore: false, durable: false, count: 0, embedOnly: false })
  })

  it('signed + timestamped, no soft binding → embed-only (P1 only)', () => {
    const p = detectDurablePillars({ signed: true, hasTimestamp: true, assertionLabels: ['c2pa.hash.data', 'c2pa.actions'] })
    expect(p.signedAndTimestamped).toBe(true)
    expect(p.trustmark).toBe(false)
    expect(p.manifestStore).toBe(false)
    expect(p.durable).toBe(false)
    expect(p.count).toBe(1)
    expect(p.embedOnly).toBe(true)
  })

  it('signed + timestamped + soft binding → fully durable (3/3)', () => {
    const p = detectDurablePillars({ signed: true, hasTimestamp: true, assertionLabels: ['c2pa.hash.data', 'c2pa.soft_binding'] })
    expect(p.durable).toBe(true)
    expect(p.count).toBe(3)
    expect(p.embedOnly).toBe(false)
  })

  it('signed but NOT timestamped, with soft binding → P2+P3 only (2/3, not durable)', () => {
    const p = detectDurablePillars({ signed: true, hasTimestamp: false, assertionLabels: ['c2pa.soft_binding'] })
    expect(p.signedAndTimestamped).toBe(false)
    expect(p.trustmark).toBe(true)
    expect(p.manifestStore).toBe(true)
    expect(p.durable).toBe(false)
    expect(p.count).toBe(2)
    expect(p.embedOnly).toBe(false)
  })

  it('timestamp without signature does not light P1', () => {
    const p = detectDurablePillars({ signed: false, hasTimestamp: true, assertionLabels: ['c2pa.soft_binding'] })
    expect(p.signedAndTimestamped).toBe(false)
    expect(p.count).toBe(2)
  })
})
