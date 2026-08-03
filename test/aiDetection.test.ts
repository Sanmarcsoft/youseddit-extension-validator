/*
 *  Unit tests for AI-generation detection.
 *  Run with:  bun test test/aiDetection.test.ts
 *  (Playwright only scans ./test/e2e, so this file is ignored by `npm test`.)
 *
 *  The rule these pin down: only media that DECLARES trained-model generation
 *  may be labelled AI-generated. Everything else — including files signed by
 *  companies whose main business is AI — must not be.
 */
import { describe, it, expect } from 'bun:test'
import { detectAiGeneration } from '../src/aiDetection'

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/'

/** A manifest carrying one actions assertion with the given actions. */
const withActions = (actions: unknown[], label = 'c2pa.actions.v2'): unknown => ({
  assertions: [{ label, data: { actions } }]
})

describe('detectAiGeneration — positive cases', () => {
  it('reports full generation for trainedAlgorithmicMedia', () => {
    const r = detectAiGeneration(withActions([
      { action: 'c2pa.created', digitalSourceType: `${IPTC}trainedAlgorithmicMedia` }
    ]))
    expect(r.generation).toBe('full')
    expect(r.digitalSourceType).toBe(`${IPTC}trainedAlgorithmicMedia`)
  })

  it('reports partial generation for compositeWithTrainedAlgorithmicMedia', () => {
    const r = detectAiGeneration(withActions([
      { action: 'c2pa.created', digitalSourceType: `${IPTC}compositeWithTrainedAlgorithmicMedia` }
    ]))
    expect(r.generation).toBe('partial')
  })

  it('takes the strongest claim when a composite declares several actions', () => {
    const r = detectAiGeneration(withActions([
      { action: 'c2pa.opened', digitalSourceType: `${IPTC}compositeWithTrainedAlgorithmicMedia` },
      { action: 'c2pa.created', digitalSourceType: `${IPTC}trainedAlgorithmicMedia` }
    ]))
    expect(r.generation).toBe('full')
  })

  it('accepts the v1 actions label and an https vocabulary URI', () => {
    const r = detectAiGeneration(withActions(
      [{ digitalSourceType: `https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia` }],
      'c2pa.actions'
    ))
    expect(r.generation).toBe('full')
  })
})

describe('detectAiGeneration — must NOT label non-AI media', () => {
  it('a plain camera capture is not AI', () => {
    const r = detectAiGeneration(withActions([
      { action: 'c2pa.created', digitalSourceType: `${IPTC}digitalCapture` }
    ]))
    expect(r.generation).toBe('none')
    expect(r.digitalSourceType).toBeNull()
  })

  it('procedural/algorithmic media is not AI-generated', () => {
    // algorithmicMedia is a computed image (a chart, a gradient). Treating it
    // as AI would label ordinary generated graphics as machine-authored.
    const r = detectAiGeneration(withActions([
      { action: 'c2pa.created', digitalSourceType: `${IPTC}algorithmicMedia` }
    ]))
    expect(r.generation).toBe('none')
  })

  it('an asset that declares nothing is not AI', () => {
    expect(detectAiGeneration(withActions([{ action: 'c2pa.created' }])).generation).toBe('none')
    expect(detectAiGeneration({ assertions: [] }).generation).toBe('none')
  })

  it('a non-actions assertion mentioning the code is ignored', () => {
    // Only a signed c2pa.actions assertion may make this claim; arbitrary
    // metadata must not be able to flip the verdict.
    const r = detectAiGeneration({
      assertions: [{ label: 'stds.schema-org.CreativeWork', data: { digitalSourceType: `${IPTC}trainedAlgorithmicMedia` } }]
    })
    expect(r.generation).toBe('none')
  })

  it('the regression this replaced: signer identity cannot imply AI', () => {
    // The old implementation returned AI for anything whose signer matched the
    // "AI trust list" (Microsoft as a CA, and OpenAI). A photograph signed
    // under such a CA carries no digitalSourceType and must read as not-AI.
    const photographSignedByAnAiCompany = withActions([
      { action: 'c2pa.created', digitalSourceType: `${IPTC}digitalCapture`, softwareAgent: 'OpenAI' }
    ])
    expect(detectAiGeneration(photographSignedByAnAiCompany).generation).toBe('none')
  })
})

describe('detectAiGeneration — hostile and malformed input', () => {
  it('never throws on junk, and never yields a false positive', () => {
    for (const junk of [null, undefined, 42, 'string', [], {}, { assertions: 'no' },
      { assertions: [null, 7, { label: 'c2pa.actions', data: null }] }]) {
      expect(detectAiGeneration(junk).generation).toBe('none')
    }
  })

  it('does not recurse without bound on deeply nested payloads', () => {
    let deep: Record<string, unknown> = { digitalSourceType: `${IPTC}trainedAlgorithmicMedia` }
    for (let i = 0; i < 40; i++) deep = { nested: deep }
    // Beyond the depth cap the claim is simply not seen — bounded, not thrown.
    expect(() => detectAiGeneration({ assertions: [{ label: 'c2pa.actions', data: deep }] })).not.toThrow()
  })
})
