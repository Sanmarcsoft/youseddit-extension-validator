/*
 *  The probe must not reach the network unless the user has said yes.
 *  Run with:  bun test test/manifestStoreOptIn.test.ts
 *
 *  This is the test that matters for the privacy claim in the listing. The
 *  probe is the extension's only request not begun by a click, so "off unless
 *  opted in" is a promise made to users and to Chrome Web Store review. If the
 *  gate is ever removed or inverted, this fails.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

let storage: Record<string, unknown> = {}
let fetchCalls: string[] = []
const realFetch = globalThis.fetch

beforeEach(() => {
  storage = {}
  fetchCalls = []
  ;(globalThis as Record<string, unknown>).chrome = {
    storage: { local: { get: async (k: string) => ({ [k]: storage[k] }) } }
  }
  globalThis.fetch = (async (url: string) => {
    fetchCalls.push(String(url))
    return { ok: true, json: async () => ({ matches: [{ manifestId: 'm', similarityScore: 1, algorithm: 'phash' }] }) }
  }) as unknown as typeof fetch
})

afterEach(() => { globalThis.fetch = realFetch })

const loadFresh = async (): Promise<typeof import('../src/manifestStore')> =>
  await import(`../src/manifestStore?t=${Date.now()}${Math.random()}`)

describe('manifest store probe — consent gate', () => {
  it('is OFF when the user has expressed no preference', async () => {
    const { isProbeEnabled } = await loadFresh()
    expect(await isProbeEnabled()).toBe(false)
  })

  it('is OFF when explicitly disabled', async () => {
    storage.manifestStoreProbe = false
    const { isProbeEnabled } = await loadFresh()
    expect(await isProbeEnabled()).toBe(false)
  })

  it('is ON only when explicitly enabled', async () => {
    storage.manifestStoreProbe = true
    const { isProbeEnabled } = await loadFresh()
    expect(await isProbeEnabled()).toBe(true)
  })

  it('fails closed to OFF when storage cannot be read', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      storage: { local: { get: async () => { throw new Error('no storage') } } }
    }
    const { isProbeEnabled } = await loadFresh()
    expect(await isProbeEnabled()).toBe(false)
  })

  it('makes NO network request while opted out — the whole point', async () => {
    const { probeManifestStore } = await loadFresh()
    const result = await probeManifestStore(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    expect(result).toBe(false)
    expect(fetchCalls, 'nothing may be sent before consent').toEqual([])
  })

  it('still sends nothing when opted out even for a decodable-looking blob', async () => {
    storage.manifestStoreProbe = false
    const { probeManifestStore } = await loadFresh()
    await probeManifestStore(new Blob([new Uint8Array(64)], { type: 'image/png' }))
    expect(fetchCalls).toEqual([])
  })
})
