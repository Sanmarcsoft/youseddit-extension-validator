/*
 *  Unit tests for deciding HOW "Full screen" should behave in a given host.
 *  Run with:  bun test test/fullscreenStrategy.test.ts
 *
 *  This exists because the same <c2pa-provenance-graph> is mounted in two very
 *  different hosts, and the Fullscreen API is only useful in one of them.
 *
 *  In the in-page overlay the diagram lives in an iframe carrying
 *  allow="fullscreen", so requestFullscreen() promotes it to the top layer and
 *  the button does what it says. In the toolbar popup the diagram is mounted
 *  straight into popup.html. There, requestFullscreen() is refused, the catch
 *  applies the CSS fallback, and `inset: 0; height: 100vh` resolves against the
 *  popup window itself, a box the diagram already filled. Nothing moves. That
 *  is the "Full Screen does nothing" report: not a dead listener, but a
 *  fallback whose geometry had nowhere to expand into.
 *
 *  So the decision is pulled out of the component and made explicit here.
 */
import { describe, it, expect } from 'bun:test'
import { resolveFullscreenStrategy } from '../src/fullscreenStrategy'

describe('resolveFullscreenStrategy', () => {
  it('uses the Fullscreen API when the host allows it', () => {
    expect(resolveFullscreenStrategy({ fullscreenEnabled: true })).toBe('element')
  })

  it('opens a tab when the host forbids fullscreen', () => {
    // document.fullscreenEnabled is false in a context with no permission to
    // enter it. Retrying the API there is what produced a dead-looking button.
    expect(resolveFullscreenStrategy({ fullscreenEnabled: false })).toBe('tab')
  })

  it('honours an explicit host request for a tab even where fullscreen works', () => {
    // The popup is the case: fullscreen may well be "enabled", but a transient
    // 380px window is not somewhere a provenance chain is worth expanding into.
    expect(resolveFullscreenStrategy({ fullscreenEnabled: true, requested: 'tab' })).toBe('tab')
  })

  it('honours an explicit host request for the element', () => {
    expect(resolveFullscreenStrategy({ fullscreenEnabled: false, requested: 'element' })).toBe('element')
  })

  it('defaults to the element when the host says nothing at all', () => {
    // Unknown capability must not silently start opening tabs; the overlay is
    // the common case and its behaviour is already correct.
    expect(resolveFullscreenStrategy({})).toBe('element')
  })

  it('ignores a nonsense requested value rather than trusting it', () => {
    expect(resolveFullscreenStrategy({ requested: 'sideways' as never, fullscreenEnabled: false })).toBe('tab')
  })
})
