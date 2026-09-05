/*
 *  Unit tests for CSV / clipboard export of provenance nodes.
 *  Run with:  bun test test/provenanceCsv.test.ts
 *  (Playwright only scans ./test/e2e, so this file is ignored by `npm test`.)
 *
 *  The escaping cases are the reason this module is pure. C2PA manifest strings
 *  are attacker-controlled (a signature proves who signed, not what the strings
 *  say), and the extension renders untrusted and failed manifests on purpose,
 *  so hostile values reach the exporter by design. The guard is deliberately
 *  narrow: block what a spreadsheet would evaluate, and leave plain numbers
 *  alone so exported telemetry stays arithmetic instead of text.
 */
import { describe, it, expect } from 'bun:test'
import { csvCell, nodeToCsv, nodeToText, graphToCsv, exportSlug, CSV_HEADER, exportFilename } from '../src/provenanceCsv'
import type { ProvenanceGraph, ProvenanceNode } from '../src/provenanceTypes'

function node (over: Partial<ProvenanceNode> = {}): ProvenanceNode {
  return {
    id: 'n0',
    manifestKey: 'urn:active',
    kind: 'manifest',
    validationState: 'valid',
    label: 'final.jpg',
    title: 'final.jpg',
    format: 'image/jpeg',
    formatLabel: 'JPEG image',
    relationship: null,
    isActive: true,
    hasManifest: true,
    claimGenerator: 'Adobe Photoshop 25.0',
    claimGeneratorTool: 'Adobe Photoshop',
    signer: null,
    assertions: [],
    validationStatus: [],
    ...over
  } as ProvenanceNode
}

describe('csvCell', () => {
  it('leaves an ordinary value untouched', () => {
    expect(csvCell('Adobe Photoshop 25.0')).toBe('Adobe Photoshop 25.0')
  })

  it('returns empty string for null and undefined', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('neutralises a leading = and still RFC 4180 quotes it', () => {
    expect(csvCell('=HYPERLINK("http://evil","ok")'))
      .toBe('"\'=HYPERLINK(""http://evil"",""ok"")"')
  })

  it('neutralises @, + and tab leads', () => {
    expect(csvCell('@SUM(1)')).toBe("'@SUM(1)")
    expect(csvCell('+WEBSERVICE("x")')).toBe('"\'+WEBSERVICE(""x"")"')
    expect(csvCell('\tcmd')).toBe("'\tcmd")
  })

  it('does not mangle plain numbers, including negatives', () => {
    // GPS latitude, heading and rotation channels are full of these, and they
    // are exactly the fields someone exports in order to do arithmetic on them.
    expect(csvCell('-33.8688')).toBe('-33.8688')
    expect(csvCell('-1.4e-7')).toBe('-1.4e-7')
    expect(csvCell('+42')).toBe('+42')
    expect(csvCell('0')).toBe('0')
  })

  it('still guards a minus lead that is not a plain number', () => {
    expect(csvCell('-33.8688,151.2093')).toBe('"\'-33.8688,151.2093"')
    expect(csvCell('-1+cmd')).toBe("'-1+cmd")
  })

  it('quotes delimiters and line breaks without guarding them', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('nodeToCsv', () => {
  it('emits the shared header then one row per field', () => {
    const csv = nodeToCsv(node())
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(CSV_HEADER.join(','))
    expect(lines.length).toBeGreaterThan(1)
    expect(csv).toContain('Adobe Photoshop 25.0')
  })

  it('carries a hostile claim generator through neutralised', () => {
    const csv = nodeToCsv(node({ claimGenerator: '=cmd|\'/c calc\'!A0' }))
    expect(csv).toContain("'=cmd")
    expect(csv).not.toMatch(/(^|,)=cmd/m)
  })
})

describe('graphToCsv', () => {
  it('emits one header and rows for every node', () => {
    const graph = { nodes: [node(), node({ id: 'n1', label: 'source.jpg' })], edges: [] } as unknown as ProvenanceGraph
    const csv = graphToCsv(graph)
    expect(csv.split('\r\n').filter((l) => l === CSV_HEADER.join(',')).length).toBe(1)
    expect(csv).toContain('final.jpg')
    expect(csv).toContain('source.jpg')
  })
})

describe('nodeToText', () => {
  it('is human readable and does not carry the CSV apostrophe guard', () => {
    // Clipboard text lands in a document or a chat, never in a formula engine,
    // so guarding it there would corrupt the value for no benefit.
    const text = nodeToText(node({ claimGenerator: '=SUM(A1)' }))
    expect(text).toContain('=SUM(A1)')
    expect(text).not.toContain("'=SUM(A1)")
  })
})

describe('exportSlug', () => {
  it('produces a filename-safe slug', () => {
    expect(exportSlug('final.jpg')).toMatch(/^[a-z0-9._-]+$/i)
    expect(exportSlug('a/b\\c:d*e?f')).not.toMatch(/[/\\:*?]/)
  })

  it('caps length', () => {
    expect(exportSlug('x'.repeat(200)).length).toBeLessThanOrEqual(48)
  })
})

/*
 * A per-node CSV must arrive as a FILE, matching the toolbar's chain export.
 * The node button used to copy to the clipboard while the toolbar button next
 * to it downloaded, so "CSV" meant two different things one control apart.
 * Naming is shared so a chain export and a step export sort together in the
 * downloads folder instead of looking unrelated.
 */
describe('exportFilename', () => {
  const day = new Date('2026-09-05T11:00:00.000Z')

  it('names a chain export from the asset, dated', () => {
    expect(exportFilename('Origin capture', 'provenance', day)).toBe('origin-capture-provenance-2026-09-05.csv')
  })

  it('names a single-step export the same way, with its own suffix', () => {
    expect(exportFilename('This asset', 'step', day)).toBe('this-asset-step-2026-09-05.csv')
  })

  it('falls back to a usable name when the label slugs to nothing', () => {
    expect(exportFilename('!!!', 'step', day)).toBe('node-step-2026-09-05.csv')
  })

  it('always ends in .csv so the OS opens it as a spreadsheet', () => {
    expect(exportFilename('Any label', 'provenance', day).endsWith('.csv')).toBe(true)
  })
})
