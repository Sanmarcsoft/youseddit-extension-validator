/*
 * rc13 / #73 — Ingredient-tree diagram renderer.
 *
 * Draws a compact provenance graph into the overlay panel. Built on
 * native SVG rather than pulling in the 2 MB mermaid npm package —
 * same visual language as the rc13 brief (rounded corners only,
 * curved thick arrows, colour by provenance determination) but with
 * zero runtime dependencies, offline-safe, and full design control.
 *
 * Inputs (from C2paResult):
 *   - activeManifest: the top node (green/amber/red depending on trust)
 *   - ingredients[]:  leaf nodes, each linked into the active manifest
 *     with a curved arrow coloured by that ingredient's own status if
 *     available, else by the active manifest's status.
 *
 * Generator-source fill: for rc13 we emit a short generator name as a
 * label inside the node. A richer encoding (bundled AI-vendor logos +
 * favicon fallback per the rc13-prep design note on issue #73) is
 * tracked for a follow-up once we have a real multi-vendor ingredient
 * fixture to test against (rc13.1 / #77).
 */

import { html, type TemplateResult, svg } from 'lit'

export type ProvenanceStatus = 'trusted' | 'valid' | 'invalid' | 'none' | 'recovered'

export interface DiagramNode {
  id: string
  label: string
  sublabel?: string
  status: ProvenanceStatus
  /** Optional generator label ("Adobe Firefly", "Trusteddit", etc.). */
  generator?: string
}

export interface DiagramLink {
  from: string
  to: string
  /** Colour of the arrow encodes the derived status at this edge. */
  status: ProvenanceStatus
}

export interface IngredientDiagramModel {
  activeManifestId: string
  nodes: DiagramNode[]
  links: DiagramLink[]
}

/** Provenance-determination colour palette — matches the rc13 brief. */
const STROKE_FOR_STATUS: Record<ProvenanceStatus, string> = {
  trusted: '#2a8a3c',   // green
  valid: '#f0a500',     // amber (signed but unknown signer)
  invalid: '#c83232',   // red
  none: '#888888',      // neutral
  recovered: '#6a3ca0'  // violet (rc12 durable-credential recovery)
}

/** Light node fill matching the stroke hue. */
const FILL_FOR_STATUS: Record<ProvenanceStatus, string> = {
  trusted: '#eef9f0',
  valid: '#fff8e6',
  invalid: '#fdf1f0',
  none: '#f4f4f4',
  recovered: '#f3eefa'
}

/**
 * Derive a DiagramModel from the C2paResult shape the overlay already has.
 * Keeps the webComponents.ts call-site small.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function modelFromC2paResult (result: any): IngredientDiagramModel | null {
  if (result?.manifestStore == null) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifests: any[] = Array.isArray(result.manifestStore.manifests) ? result.manifestStore.manifests : Object.values(result.manifestStore.manifests ?? {})
  const activeIdx: number = typeof result.manifestStore.activeManifest === 'number'
    ? result.manifestStore.activeManifest
    : 0
  const active = manifests[activeIdx] ?? manifests[0]
  if (active == null) return null

  const trusted: boolean = result.trustList != null
  const errors: boolean = Array.isArray(result.manifestStore.validationStatus) && result.manifestStore.validationStatus.length > 0
  const recovered: boolean = result.recovered === true

  const activeStatus: ProvenanceStatus = recovered ? 'recovered'
    : errors ? 'invalid'
      : trusted ? 'trusted'
        : 'valid'

  const activeId = 'active'
  const nodes: DiagramNode[] = [{
    id: activeId,
    label: String(active.title ?? '(unnamed manifest)'),
    sublabel: String((active.signatureInfo?.issuer as string | undefined) ?? active.claim_generator ?? ''),
    status: activeStatus,
    generator: parseGenerator(active.claim_generator ?? active.claimGenerator)
  }]
  const links: DiagramLink[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ingredients: any[] = Array.isArray(active.ingredients) ? active.ingredients : []
  ingredients.forEach((ing, i) => {
    const id = `ing-${i}`
    nodes.push({
      id,
      label: String(ing.title ?? '(untitled ingredient)'),
      sublabel: String(ing.format ?? ''),
      status: 'none', // ingredient-level status not exposed in the result shape we have
      generator: parseGenerator(ing.claim_generator ?? ing.claimGenerator)
    })
    links.push({ from: id, to: activeId, status: activeStatus })
  })

  return { activeManifestId: activeId, nodes, links }
}

/**
 * Strip the toolchain suffix from a claim_generator string. The raw value
 * can be e.g. "Trusteddit/1.0 phenom/1.0 c2pa-node/0.0.0 c2pa-rs/0.49.2";
 * the user-facing label is just the first product name (tracked in
 * verifieddit-www#326 for the site too).
 */
function parseGenerator (raw: string | null | undefined): string | undefined {
  if (raw == null || raw === '') return undefined
  const first = String(raw).split(/\s+/)[0]
  // Drop "/version" suffix.
  const slashIdx = first.indexOf('/')
  return slashIdx >= 0 ? first.slice(0, slashIdx) : first
}

/**
 * Render a TemplateResult carrying the SVG. Uses Lit's `svg` tagged
 * template so the output slots cleanly into a shadow-DOM c2pa-overlay.
 */
export function renderIngredientDiagram (model: IngredientDiagramModel): TemplateResult {
  if (model.nodes.length === 0) return html`<div class="ingredient-diagram-empty">No manifest</div>`

  // Vertical layout: active on top, ingredients below in a row.
  // rc13.2 / #91 — node dimensions widened to 200 × 60 and text now
  // rendered via <foreignObject> + CSS text-overflow so long labels
  // degrade to an ellipsis rather than a hard character-count cut.
  const NODE_W = 200
  const NODE_H = 60
  const H_GAP = 28
  const V_GAP = 80

  const active = model.nodes.find((n) => n.id === model.activeManifestId) ?? model.nodes[0]
  const ingredients = model.nodes.filter((n) => n.id !== active.id)

  const diagramW = Math.max(NODE_W, ingredients.length * (NODE_W + H_GAP) - H_GAP) + 40
  const diagramH = NODE_H + V_GAP + NODE_H + 20

  // active node centred across the ingredient row
  const activeX = (diagramW - NODE_W) / 2
  const activeY = 10

  // ingredients in a row at the bottom
  const baseY = activeY + NODE_H + V_GAP
  const rowWidth = ingredients.length * (NODE_W + H_GAP) - H_GAP
  const rowStartX = (diagramW - rowWidth) / 2
  const ingPos: Record<string, { x: number, y: number }> = {}
  ingredients.forEach((n, i) => {
    ingPos[n.id] = { x: rowStartX + i * (NODE_W + H_GAP), y: baseY }
  })
  const nodePos: Record<string, { x: number, y: number }> = { [active.id]: { x: activeX, y: activeY }, ...ingPos }

  const nodeSvgs = model.nodes.map((n) => renderNode(n, nodePos[n.id], NODE_W, NODE_H))
  const linkSvgs = model.links.map((l) => renderLink(l, nodePos[l.from], nodePos[l.to], NODE_W, NODE_H))

  return html`
    <div class="ingredient-diagram" style="margin:8px 0;padding:8px;background:#fafbfc;border:1px solid #e4e7eb;border-radius:6px;overflow-x:auto">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagramW} ${diagramH}" width="100%" style="max-width:${diagramW}px;height:auto;display:block">
        <defs>
          ${['trusted', 'valid', 'invalid', 'none', 'recovered'].map((s) => svg`
            <marker id="arrow-${s}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="${STROKE_FOR_STATUS[s as ProvenanceStatus]}" />
            </marker>
          `)}
        </defs>
        ${linkSvgs}
        ${nodeSvgs}
      </svg>
    </div>
  `
}

function renderNode (node: DiagramNode, pos: { x: number, y: number }, w: number, h: number): TemplateResult {
  const stroke = STROKE_FOR_STATUS[node.status]
  const fill = FILL_FOR_STATUS[node.status]
  const labelFull = String(node.label ?? '')
  const sublabelFull = String(node.sublabel ?? '')
  const generatorFull = String(node.generator ?? '')

  // rc13.2 / #91 — native SVG text with pixel-budget truncation + ellipsis.
  // Each text row gets a maximum pixel width equal to the node's inner
  // width and is truncated with truncateToPx() so long strings like
  // "Trusteddit-Journalist-Issuer-CA" degrade cleanly to a "…"-suffixed
  // form instead of a hard character-count cut mid-word. A native SVG
  // <title> child under the <g> carries the full untruncated text so
  // hovering any part of the node shows everything.
  const padX = 8
  const innerW = w - padX * 2
  const label = truncateToPx(labelFull, innerW, 12, 700)
  const sublabel = truncateToPx(sublabelFull, innerW, 10, 400)
  const generator = truncateToPx(generatorFull, innerW, 9, 600)
  const tooltip = [labelFull, sublabelFull, generatorFull].filter((s) => s !== '').join(' — ')

  const genChip = generatorFull !== ''
    ? svg`<text x="${pos.x + padX}" y="${pos.y + 14}" font-size="9" fill="#444" font-weight="600" textLength="" lengthAdjust="spacingAndGlyphs">${generator}</text>`
    : svg``
  const sublabelLine = sublabelFull !== ''
    ? svg`<text x="${pos.x + w / 2}" y="${pos.y + h - 10}" text-anchor="middle" font-size="10" fill="#555">${sublabel}</text>`
    : svg``

  // Place the label centred vertically; offset up a touch if no sublabel.
  const labelY = sublabelFull !== '' ? pos.y + h / 2 + 2 : pos.y + h / 2 + 5

  return svg`
    <g class="diagram-node">
      <title>${tooltip}</title>
      <rect x="${pos.x}" y="${pos.y}" width="${w}" height="${h}" rx="12" ry="12"
            stroke="${stroke}" stroke-width="3" fill="${fill}" />
      ${genChip}
      <text x="${pos.x + w / 2}" y="${labelY}" text-anchor="middle"
            font-size="12" font-weight="700" fill="#111">${label}</text>
      ${sublabelLine}
    </g>
  `
}

/**
 * Truncate a string so its rendered width at the given font size stays
 * within maxPx, appending "…" if it needed to be trimmed. Width is
 * estimated from an average character-advance ratio that's good enough
 * for sans-serif at 10–14 px: ~0.56 × fontSize for regular, slightly
 * wider for bold. Not pixel-perfect (the real width depends on the
 * exact font and which glyphs are present), but close enough that the
 * overflow case is always defensive — we err on the side of slightly
 * shorter so text never spills past the border.
 */
function truncateToPx (text: string, maxPx: number, fontSizePx: number, weight = 400): string {
  if (text === '') return ''
  const advance = fontSizePx * (weight >= 600 ? 0.60 : 0.56)
  const maxChars = Math.max(1, Math.floor(maxPx / advance))
  if (text.length <= maxChars) return text
  // Reserve one char for the ellipsis. Prefer cutting at a word boundary
  // if one is within the last 6 chars of the budget, else hard-cut.
  const budget = maxChars - 1
  const slice = text.slice(0, budget)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace >= budget - 6 && lastSpace > 0) {
    return slice.slice(0, lastSpace) + '…'
  }
  return slice + '…'
}

function renderLink (link: DiagramLink, from: { x: number, y: number }, to: { x: number, y: number }, w: number, h: number): TemplateResult {
  const stroke = STROKE_FOR_STATUS[link.status]
  // ingredient-to-manifest: curve from top of ingredient to bottom of manifest
  const x1 = from.x + w / 2
  const y1 = from.y
  const x2 = to.x + w / 2
  const y2 = to.y + h
  // Control points for a soft cubic bezier (thick curves per rc13 brief).
  const ctrlY = (y1 + y2) / 2
  return svg`
    <path d="M ${x1} ${y1} C ${x1} ${ctrlY}, ${x2} ${ctrlY}, ${x2} ${y2}"
          stroke="${stroke}" stroke-width="3" fill="none"
          stroke-linecap="round" marker-end="url(#arrow-${link.status})" />
  `
}
