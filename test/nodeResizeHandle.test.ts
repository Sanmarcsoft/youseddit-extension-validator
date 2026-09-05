/*
 * Regression tests for the node resize handle being unreachable.
 *
 * `.node.expanded` carries `resize: both`, so Chromium paints a gripper in the
 * bottom-right corner of an expanded node. Dragging it never resized anything.
 *
 * The cause is in `onPointerDown` in src/provenanceDiagram.ts. The #141 fix
 * made a press anywhere on `.node` start a node DRAG and call
 * setPointerCapture on the frame, which redirects the rest of the gesture away
 * from the element the UA resizer lives on. The exemption list at the top of
 * that handler names `.controls, button, a, input, select, textarea`. The
 * resizer is none of those, because it is not an element at all: it is a
 * UA-painted corner of the node's own box. So drag shadowed resize and the CSS
 * was dead from the day it landed.
 *
 * The fix needs geometry, not a selector. These tests pin that geometry.
 *
 * Scale matters and is the part a naive fix gets wrong. The node sits inside a
 * `transform: scale(zoom)` viewport, so a getBoundingClientRect is in screen
 * pixels while the gripper is painted in the element's own coordinate space.
 * Its on-screen size is therefore `RESIZER_SIZE_PX * zoom`. The node-drag path
 * already divides pointer travel by `this.zoom` for the same reason.
 */

import { describe, expect, it } from 'bun:test'
import { isResizeHandlePress, RESIZER_SIZE_PX } from '../src/nodeResizeHandle'

/** A 200x120 node whose bottom-right corner sits at (300, 220). */
const rect = { left: 100, top: 100, right: 300, bottom: 220 }

describe('RESIZER_SIZE_PX', () => {
  it('matches the Chromium gripper, which is scrollbar-sized', () => {
    expect(RESIZER_SIZE_PX).toBe(15)
  })
})

describe('isResizeHandlePress', () => {
  it('is a hit exactly on the bottom-right corner', () => {
    expect(isResizeHandlePress({ rect, clientX: 300, clientY: 220 })).toBe(true)
  })

  it('is a hit just inside the gripper', () => {
    expect(isResizeHandlePress({ rect, clientX: 294, clientY: 214 })).toBe(true)
  })

  it('is a miss just outside the gripper', () => {
    // 16px in from each edge, gripper is 15px at zoom 1.
    expect(isResizeHandlePress({ rect, clientX: 284, clientY: 204 })).toBe(false)
  })

  it('is a miss in the middle of the node, where a drag must still work', () => {
    expect(isResizeHandlePress({ rect, clientX: 200, clientY: 160 })).toBe(false)
  })

  it('is a miss on the other three corners', () => {
    expect(isResizeHandlePress({ rect, clientX: 100, clientY: 100 })).toBe(false)
    expect(isResizeHandlePress({ rect, clientX: 300, clientY: 100 })).toBe(false)
    expect(isResizeHandlePress({ rect, clientX: 100, clientY: 220 })).toBe(false)
  })

  it('is a miss outside the node entirely', () => {
    expect(isResizeHandlePress({ rect, clientX: 320, clientY: 240 })).toBe(false)
    expect(isResizeHandlePress({ rect, clientX: 50, clientY: 50 })).toBe(false)
  })

  it('grows the hit band with the viewport zoom', () => {
    // At zoom 2 the gripper covers 30 screen px, so 20px in is a hit.
    expect(isResizeHandlePress({ rect, clientX: 280, clientY: 200, zoom: 2 })).toBe(true)
    // The same press at zoom 1 is a miss. This is the assertion a fix that
    // ignores the transform fails.
    expect(isResizeHandlePress({ rect, clientX: 280, clientY: 200, zoom: 1 })).toBe(false)
  })

  it('shrinks the hit band with the viewport zoom', () => {
    // At zoom 0.5 the gripper covers 7.5 screen px, so 10px in is a miss.
    expect(isResizeHandlePress({ rect, clientX: 290, clientY: 210, zoom: 0.5 })).toBe(false)
    // 4px in is still a hit at that zoom.
    expect(isResizeHandlePress({ rect, clientX: 296, clientY: 216, zoom: 0.5 })).toBe(true)
  })

  it('treats a non-positive zoom as 1 rather than inverting the band', () => {
    expect(isResizeHandlePress({ rect, clientX: 294, clientY: 214, zoom: 0 })).toBe(true)
    expect(isResizeHandlePress({ rect, clientX: 294, clientY: 214, zoom: -2 })).toBe(true)
  })

  it('is a miss on a degenerate rect rather than swallowing every press', () => {
    const zero = { left: 0, top: 0, right: 0, bottom: 0 }
    expect(isResizeHandlePress({ rect: zero, clientX: 0, clientY: 0 })).toBe(false)
  })

  it('is a miss when a coordinate is not finite', () => {
    expect(isResizeHandlePress({ rect, clientX: NaN, clientY: 214 })).toBe(false)
    expect(isResizeHandlePress({ rect, clientX: 294, clientY: Infinity })).toBe(false)
  })
})
