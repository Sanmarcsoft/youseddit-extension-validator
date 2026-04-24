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
  const NODE_W = 180
  const NODE_H = 56
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
  const label = String(node.label).slice(0, 32)
  const sublabel = node.sublabel != null ? String(node.sublabel).slice(0, 36) : ''
  const genChip = node.generator != null && node.generator !== ''
    ? svg`<text x="${pos.x + 8}" y="${pos.y + 14}" font-size="9" fill="#444" font-weight="600">${node.generator}</text>`
    : svg``

  return svg`
    <g class="diagram-node">
      <rect x="${pos.x}" y="${pos.y}" width="${w}" height="${h}" rx="12" ry="12"
            stroke="${stroke}" stroke-width="3" fill="${fill}" />
      ${genChip}
      <text x="${pos.x + w / 2}" y="${pos.y + 30}" text-anchor="middle"
            font-size="12" font-weight="700" fill="#111">${label}</text>
      <text x="${pos.x + w / 2}" y="${pos.y + 46}" text-anchor="middle"
            font-size="10" fill="#555">${sublabel}</text>
    </g>
  `
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
