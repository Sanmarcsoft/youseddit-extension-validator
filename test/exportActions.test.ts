/*
 * Tests for the copy and download primitives behind the provenance export
 * controls.
 *
 * Why these are a separate module rather than inline handlers: both are
 * permission-sensitive. `navigator.clipboard.writeText` is unavailable in some
 * contexts (older Gecko, a non-secure origin, a frame without transient user
 * activation) and rejects rather than throwing synchronously; the historical
 * `document.execCommand('copy')` path still works there. The download path uses
 * a Blob object URL and a synthetic anchor click, which needs no `downloads`
 * permission at all.
 *
 * The manifest gains NOTHING for either feature. That is the constraint these
 * tests exist to hold: `clipboardWrite` and `downloads` were both considered
 * and rejected, so a future change that reintroduces a permission-requiring
 * API should fail here first.
 */

import { describe, expect, it } from 'bun:test'
import { copyText, downloadText } from '../src/exportActions'

function anchorSpy (): { made: Array<{ href: string, download: string, clicks: number }>, createAnchor: () => { href: string, download: string, click: () => void } } {
  const made: Array<{ href: string, download: string, clicks: number }> = []
  return {
    made,
    createAnchor: () => {
      const rec = { href: '', download: '', clicks: 0 }
      made.push(rec)
      return {
        get href () { return rec.href },
        set href (v: string) { rec.href = v },
        get download () { return rec.download },
        set download (v: string) { rec.download = v },
        click: () => { rec.clicks++ }
      }
    }
  }
}

describe('copyText', () => {
  it('uses the async clipboard API when it is available', async () => {
    let got: string | null = null
    const ok = await copyText('hello', { writeText: async (t) => { got = t } })
    expect(ok).toBe(true)
    expect(got).toBe('hello')
  })

  it('falls back to execCommand when the clipboard API rejects', async () => {
    let fallback: string | null = null
    const ok = await copyText('hello', {
      writeText: async () => { throw new Error('NotAllowedError') },
      execCopy: (t) => { fallback = t; return true }
    })
    expect(ok).toBe(true)
    expect(fallback).toBe('hello')
  })

  it('falls back when the clipboard API is absent entirely', async () => {
    let fallback: string | null = null
    const ok = await copyText('hello', { execCopy: (t) => { fallback = t; return true } })
    expect(ok).toBe(true)
    expect(fallback).toBe('hello')
  })

  it('reports failure rather than throwing when both paths fail', async () => {
    const ok = await copyText('hello', {
      writeText: async () => { throw new Error('nope') },
      execCopy: () => false
    })
    expect(ok).toBe(false)
  })

  it('reports failure when there is no path at all', async () => {
    expect(await copyText('hello', {})).toBe(false)
  })
})

describe('downloadText', () => {
  it('clicks an anchor pointed at a blob URL and revokes it', () => {
    const spy = anchorSpy()
    const revoked: string[] = []
    const ok = downloadText('a,b\n1,2\n', 'chain.csv', 'text/csv', {
      createObjectURL: () => 'blob:fake-url',
      revokeObjectURL: (u) => { revoked.push(u) },
      createAnchor: spy.createAnchor
    })
    expect(ok).toBe(true)
    expect(spy.made.length).toBe(1)
    expect(spy.made[0].href).toBe('blob:fake-url')
    expect(spy.made[0].download).toBe('chain.csv')
    expect(spy.made[0].clicks).toBe(1)
    expect(revoked).toEqual(['blob:fake-url'])
  })

  it('revokes the object URL even when the click throws', () => {
    const revoked: string[] = []
    const ok = downloadText('x', 'f.csv', 'text/csv', {
      createObjectURL: () => 'blob:leaky',
      revokeObjectURL: (u) => { revoked.push(u) },
      createAnchor: () => ({ href: '', download: '', click: () => { throw new Error('blocked') } })
    })
    expect(ok).toBe(false)
    // A leaked object URL pins the whole blob in memory for the page lifetime.
    expect(revoked).toEqual(['blob:leaky'])
  })

  it('reports failure rather than throwing when object URLs are unavailable', () => {
    const spy = anchorSpy()
    const ok = downloadText('x', 'f.csv', 'text/csv', {
      createObjectURL: () => { throw new Error('unsupported') },
      revokeObjectURL: () => {},
      createAnchor: spy.createAnchor
    })
    expect(ok).toBe(false)
    expect(spy.made.length).toBe(0)
  })
})
