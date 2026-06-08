/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { LitElement, html, css, type TemplateResult, type PropertyValues, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { type ExtensionC2paIngredient, type C2paResult } from './c2pa'
import { type CertificateInfoExtended } from './certs/certs'
import { type DurablePillars } from './durableCredentials'
import { MSG_L3_INSPECT_URL, MSG_SAVE_BOOKMARK } from './constants'
import { modelFromC2paResult, renderIngredientDiagram } from './ingredientDiagram'

/*
  The C2pa library does not export all its types, we extract them from
  the types that are exported
*/
type Activity = Exclude<C2paResult['editsAndActivity'], null>[number]

interface IconTextItem {
  icon: string | null
  text: string[]
}

type StatusTone = 'verified' | 'authentic' | 'invalid' | 'unsigned'

/*
 * Dark "frosted glass" theme tokens shared across every custom element in this
 * module. The verifier panel is rebuilt to match the trusteddit.com
 * verification aesthetic: a translucent slate pane, monospace type, an
 * emerald/cyan accent palette and a staged + typewriter reveal.
 */
const sharedStyles = css`
    :host {
        --glass-bg: rgba(15, 23, 42, 0.86);
        --glass-bg-soft: rgba(30, 41, 59, 0.45);
        --border-color: rgba(148, 163, 184, 0.18);
        --border-strong: rgba(148, 163, 184, 0.28);
        --text: #cbd5e1;
        --text-bright: #e2e8f0;
        --text-dim: #64748b;
        --accent: #7dd3fc;        /* sky-300 */
        --accent-bright: #38bdf8; /* sky-400 */
        --ok: #86efac;            /* emerald-300 */
        --ok-glow: rgba(52, 211, 153, 0.5);
        --bad: #fda4af;           /* rose-300 */
        --warn: #fcd34d;          /* amber-300 */
        --radius: 14px;
        --font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
        --font-size: 12px;
        --font-bold: 600;
    }`

/* The c2pa-overlay host is transparent; the #card inside is the glass pane.
 * Padding leaves room for the card's drop-shadow inside the iframe. */
const overlayHostStyles = css`
    :host {
        display: block;
        background: transparent;
        padding: 12px;
        box-sizing: border-box;
        min-height: 168px;
    }`

const innerHostStyles = css`
    :host {
        display: block;
    }`

@customElement('c2pa-overlay')
export class C2paOverlay extends LitElement {
  static styles = [
    sharedStyles,
    overlayHostStyles,
    css`
      * {
          font-family: var(--font-family);
          font-size: var(--font-size);
          box-sizing: border-box;
      }

      /* ── The frosted-glass card ─────────────────────────────────── */
      #card {
          position: relative;
          color: var(--text);
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          box-shadow:
              0 20px 48px -16px rgba(2, 6, 23, 0.75),
              0 0 0 1px rgba(15, 23, 42, 0.6),
              inset 0 1px 0 rgba(148, 163, 184, 0.08);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          padding: 16px 16px 14px;
          overflow: hidden;
      }

      /* Soft cyan/emerald sheen so the pane reads as glass even over an
       * opaque host element where backdrop-filter has nothing to blur. */
      #card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
              radial-gradient(120% 80% at 0% 0%, rgba(56, 189, 248, 0.10), transparent 55%),
              radial-gradient(120% 90% at 100% 0%, rgba(52, 211, 153, 0.08), transparent 55%);
      }

      #card > * { position: relative; }

      /* ── Header ─────────────────────────────────────────────────── */
      .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-color);
      }

      .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
      }

      .brand {
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-size: 10px;
          font-weight: var(--font-bold);
          color: var(--text-dim);
          white-space: nowrap;
      }

      .status-badge {
          flex: none;
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 10px;
          font-weight: var(--font-bold);
          letter-spacing: 0.1em;
          text-transform: uppercase;
      }
      .status-badge.verified  { background: rgba(16, 185, 129, 0.14); color: var(--ok); }
      .status-badge.authentic { background: rgba(56, 189, 248, 0.14); color: var(--accent); }
      .status-badge.invalid   { background: rgba(244, 63, 94, 0.14);  color: var(--bad); }
      .status-badge.unsigned  { background: rgba(245, 158, 11, 0.14); color: var(--warn); }

      /* ── Title row (thumbnail + media) ──────────────────────────── */
      .title {
          display: grid;
          grid-template-columns: 44px 1fr;
          gap: 10px;
          align-items: center;
          margin-top: 12px;
      }
      .thumbnailFrame {
          width: 44px;
          height: 44px;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: var(--glass-bg-soft);
      }
      .thumbnail { max-width: 100%; max-height: 100%; object-fit: cover; }
      .media-line { color: var(--text-bright); font-weight: var(--font-bold); }
      .media-sub { color: var(--text-dim); font-size: 11px; margin-top: 2px; }

      /* ── Monospace verification log ─────────────────────────────── */
      .log {
          margin-top: 12px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 12px;
          font-size: 11px;
          line-height: 1.5;
      }
      .log .k { color: var(--text-dim); white-space: nowrap; }
      .log .k::before { content: '▸ '; color: var(--accent); }
      .log .v { color: var(--text); word-break: break-word; }
      .log .v.ok  { color: var(--ok); }
      .log .v.bad { color: var(--bad); }
      .log .v.dim { color: var(--text-dim); }

      /* ── Validation errors ──────────────────────────────────────── */
      .errors {
          margin-top: 12px;
          border: 1px solid rgba(244, 63, 94, 0.3);
          background: rgba(244, 63, 94, 0.08);
          border-radius: 8px;
          padding: 10px 12px;
      }
      .errors .eh { color: var(--bad); font-weight: var(--font-bold); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .errors ul { margin: 6px 0 0; padding-left: 18px; }
      .errors li { color: #fecdd3; font-size: 11px; margin-bottom: 2px; }

      /* ── Footer (inspect link + save) ───────────────────────────── */
      .footer {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-dim);
      }
      .link {
          color: var(--accent);
          text-decoration: none;
          cursor: pointer;
          border-bottom: 1px dotted rgba(125, 211, 252, 0.5);
      }
      .link:hover { color: var(--accent-bright); }

      .saveBtn {
          margin-left: auto;
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text-bright);
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 6px;
          cursor: pointer;
      }
      .saveBtn:hover { background: rgba(56, 189, 248, 0.2); }
      .saveBtn:disabled { opacity: 0.6; cursor: default; }

      .more {
          display: inline-block;
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text);
          background: transparent;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          cursor: pointer;
      }
      .more:hover { background: var(--glass-bg-soft); }

      .additional-info {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.3s ease-in-out;
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 8px;
      }

      .bold { font-weight: var(--font-bold); color: var(--text-bright); }

      /* ── Staged reveal animation ────────────────────────────────── */
      .reveal {
          opacity: 0;
          animation: revealIn 0.36s ease forwards;
      }
      @keyframes revealIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; animation: none; transform: none; }
          #card { backdrop-filter: none; -webkit-backdrop-filter: none; }
      }
  `]

  private _c2paResult: C2paResult | undefined

  private thumbprintUrl?: string

  private signer?: string

  private trustList?: string

  private status?: { errors: boolean, trusted: boolean, tone: StatusTone }

  @property({ type: Boolean })
    additionalInfoCollapsed = true

  toggleAdditionalInfo = (): void => {
    this.additionalInfoCollapsed = !this.additionalInfoCollapsed

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const additionalInfoEl = this.shadowRoot!.querySelector('.additional-info')!
    const div: HTMLDivElement = additionalInfoEl as HTMLDivElement
    if (this.additionalInfoCollapsed) {
      C2paCollapsible.close()
      div.style.maxHeight = div.scrollHeight + 'px'
      void div.offsetHeight
      div.style.maxHeight = '0'
    } else {
      div.style.maxHeight = 'none'
      const height = div.scrollHeight + 'px'
      div.style.maxHeight = '0'
      void div.offsetHeight
      div.style.maxHeight = height
      const onTransitionEnd = (): void => {
        div.style.maxHeight = 'none'
        div.removeEventListener('transitionend', onTransitionEnd)
      }
      div.addEventListener('transitionend', onTransitionEnd)
    }
  }

  @property({ type: Object })
  get c2paResult (): C2paResult | undefined {
    return this._c2paResult
  }

  set c2paResult (newValue: C2paResult | undefined) {
    if (newValue === this._c2paResult || newValue == null) {
      return
    }
    const oldValue = this._c2paResult
    this._c2paResult = newValue
    this.status = this.setStatus(newValue)
    this.requestUpdate('c2paResult', oldValue)
    this.thumbprintUrl = newValue?.source?.thumbnail.data
    if (this.thumbprintUrl === '' && newValue?.source?.type.startsWith('video/')) {
      this.thumbprintUrl = chrome.runtime.getURL('icons/video.svg')
    }
    if (this.thumbprintUrl === '' && newValue?.source?.type.startsWith('audio/')) {
      this.thumbprintUrl = chrome.runtime.getURL('icons/audio.svg')
    }
    const activeManifest = newValue?.manifestStore?.manifests[newValue.manifestStore.activeManifest]
    this.signer = activeManifest?.signatureInfo.issuer ?? 'unknown entity'
    this.trustList = newValue?.trustList?.tlInfo.name ?? 'unknown'
  }

  private setStatus (c2paResult: C2paResult): { errors: boolean, trusted: boolean, tone: StatusTone } {
    const errors = (c2paResult.manifestStore?.validationStatus ?? []).length > 0
    const trusted = c2paResult.trustList != null
    const signed = (c2paResult.certChain?.length ?? 0) > 0 ||
      (c2paResult.manifestStore?.manifests?.length ?? 0) > 0
    const tone: StatusTone = errors
      ? 'invalid'
      : !signed
          ? 'unsigned'
          : trusted ? 'verified' : 'authentic'
    return { errors, trusted, tone }
  }

  private readonly handleClick = (): void => {
    void chrome.runtime.sendMessage({
      action: MSG_L3_INSPECT_URL,
      data: this.c2paResult?.url
    })
  }

  @property({ attribute: false }) saveState: 'idle' | 'saving' | 'saved' | 'exists' | 'error' = 'idle'
  private readonly handleSaveBookmark = (): void => {
    const result = this.c2paResult
    if (result == null) return
    this.saveState = 'saving'
    const name = result.source?.filename ?? 'verification'
    const statusLabel = (this.status?.errors === true)
      ? 'Invalid'
      : (this.status?.trusted === true ? 'Trusted' : 'Signer unknown')
    const signer = (this._c2paResult?.manifestStore?.manifests[this._c2paResult.manifestStore.activeManifest]?.signatureInfo?.issuer as string | undefined) ?? ''
    const signerSuffix = signer !== '' ? ` (${signer})` : ''
    const title = `Verifieddit · ${decodeURIComponent(name)} · ${statusLabel}${signerSuffix}`
    chrome.runtime.sendMessage(
      { action: MSG_SAVE_BOOKMARK, data: { imageUrl: result.url, title } },
      (resp: { status?: 'created' | 'already-exists' | 'error', error?: string }) => {
        if (chrome.runtime.lastError != null) {
          this.saveState = 'error'
          return
        }
        this.saveState = resp?.status === 'created' ? 'saved'
          : resp?.status === 'already-exists' ? 'exists'
            : 'error'
      }
    )
  }

  private renderSaveButton (): TemplateResult {
    const label = this.saveState === 'saving' ? 'Saving…'
      : this.saveState === 'saved' ? '✓ Saved'
        : this.saveState === 'exists' ? '✓ Already saved'
          : this.saveState === 'error' ? 'Save failed'
            : 'Save verification'
    const disabled = this.saveState === 'saving'
    return html`
      <button class="saveBtn" @click="${this.handleSaveBookmark}" ?disabled="${disabled}">${label}</button>
    `
  }

  /* Build the staged + typewritten monospace verification log. */
  private renderLog (c2paResult: C2paResult): TemplateResult {
    const trusted = this.status?.trusted === true
    const errors = this.status?.errors === true
    const manifestMap = c2paResult.manifestStore?.manifests
    const manifestCount = manifestMap === undefined ? 0 : manifestMap.length
    const tstTokens = c2paResult.tstTokens ?? []
    const tsaTrusted = c2paResult.tsaTrustList != null
    const tsLabel = tstTokens.length === 0
      ? 'none'
      : tsaTrusted ? 'RFC 3161 · trusted' : 'RFC 3161'

    // [key, value, valueClass, typeSpeed]
    const rows: Array<[string, string, string, number]> = [
      ['signer', this.signer ?? 'unknown', trusted ? 'ok' : '', 12],
      ['trust', trusted ? (this.trustList ?? 'trust list') : 'not in trust list', trusted ? 'ok' : 'dim', 10],
      ['timestamp', tsLabel, tstTokens.length === 0 ? 'dim' : (tsaTrusted ? 'ok' : ''), 14],
      ['manifests', String(manifestCount), 'dim', 24]
    ]
    if (errors) {
      rows.push(['result', 'validation errors present', 'bad', 14])
    }

    return html`
      <div class="log">
        ${rows.map(([k, v, cls, speed], i) => html`
          <div class="k reveal" style="animation-delay:${i * 110}ms">${k}</div>
          <div class="v ${cls} reveal" style="animation-delay:${i * 110}ms">
            <c2pa-typewriter .text=${v} .speed=${speed} .startDelay=${i * 110 + 60}></c2pa-typewriter>
          </div>
        `)}
      </div>
    `
  }

  private renderErrors (validation: string[]): TemplateResult | typeof nothing {
    if (this.status?.errors !== true) return nothing
    return html`
      <div class="errors reveal" style="animation-delay:560ms">
        <div class="eh">⚠ Validation errors</div>
        <ul>${validation.map((v) => html`<li>${v}</li>`)}</ul>
      </div>
    `
  }

  render (): TemplateResult {
    const c2paResult = this._c2paResult
    if (c2paResult == null) {
      return html`<div id="card">No c2pa result</div>`
    }
    const tone = this.status?.tone ?? 'authentic'
    const activeManifest = c2paResult.manifestStore.manifests[c2paResult.manifestStore.activeManifest]
    let mediaType = (c2paResult.source?.type ?? 'unknown/unknown').split('/')[0]
    mediaType = mediaType.charAt(0).toUpperCase() + mediaType.slice(1)
    const format = c2paResult.source?.type ?? ''
    const thumbnailUrl = this.thumbprintUrl ?? chrome.runtime.getURL('icons/video.svg')
    const pillars = c2paResult.durablePillars ?? null

    // Pillars reveal after the log rows + a small beat.
    const pillarsDelay = 4 * 110 + 200

    return html`
    <div id="card">
      <div class="header reveal" style="animation-delay:0ms">
        <div class="header-left">
          <span class="brand">Content Credentials</span>
        </div>
        <span class="status-badge ${tone}">${tone}</span>
      </div>

      <div class="title reveal" style="animation-delay:80ms">
        <div class="thumbnailFrame">
          <img class="thumbnail" src="${thumbnailUrl}" alt="">
        </div>
        <div>
          <div class="media-line">${mediaType}${activeManifest?.title != null && activeManifest.title !== '' ? html` · ${activeManifest.title}` : ''}</div>
          <div class="media-sub">${format}</div>
        </div>
      </div>

      ${this.renderLog(c2paResult)}

      ${pillars != null
        ? html`<c2pa-pillars class="reveal" style="animation-delay:${pillarsDelay}ms; display:block" .pillars=${pillars}></c2pa-pillars>`
        : nothing}

      ${this.renderErrors(c2paResult.manifestStore.validationStatus)}

      <div class="footer reveal" style="animation-delay:${pillarsDelay + 160}ms">
        <span>Inspect on <span class="link" @click="${this.handleClick}">Verifieddit</span></span>
        ${this.renderSaveButton()}
      </div>

      <div class="additional-info">
        <c2pa-collapsible>
          <span slot="header">Edits and Activity</span>
          <div slot="content"><c2pa-grid-display .items="${activityItems(this.c2paResult?.editsAndActivity ?? undefined)}"></c2pa-grid-display></div>
        </c2pa-collapsible>
        <c2pa-collapsible>
          <span slot="header">Ingredients</span>
          <div slot="content">
            ${(() => {
              const model = modelFromC2paResult(c2paResult)
              return model != null
                ? renderIngredientDiagram(model)
                : html`<c2pa-grid-display .items="${ingredientItems(activeManifest.ingredients)}"></c2pa-grid-display>`
            })()}
            ${activeManifest.ingredients != null && activeManifest.ingredients.length > 0
              ? html`<c2pa-grid-display .items="${ingredientItems(activeManifest.ingredients)}"></c2pa-grid-display>`
              : ''}
          </div>
        </c2pa-collapsible>
        <c2pa-collapsible>
          <span slot="header">Signature</span>
          <div slot="content"><c2pa-grid-display .items="${signatureItems(activeManifest.signatureInfo ?? null)}"></c2pa-grid-display></div>
        </c2pa-collapsible>
        <c2pa-collapsible>
          <span slot="header">Certificates</span>
          <div slot="content"><c2pa-grid-display .items="${certificateItems(this.c2paResult?.certChain ?? [])}"></c2pa-grid-display></div>
        </c2pa-collapsible>
      </div>

      <button class="more" @click="${this.toggleAdditionalInfo}">
        ${this.additionalInfoCollapsed ? 'View more' : 'View less'}
      </button>
    </div>
    `
  }

  public close (): void {
    if (!this.additionalInfoCollapsed) {
      this.toggleAdditionalInfo()
    }
  }
}

/* ── Typewriter ─────────────────────────────────────────────────────────────
 * Character-by-character reveal of a monospace value. Ported from the
 * trusteddit.com verifier. Respects prefers-reduced-motion (renders instantly).
 */
@customElement('c2pa-typewriter')
export class C2paTypewriter extends LitElement {
  @property({ type: String }) text = ''
  @property({ type: Number }) speed = 14
  @property({ type: Number }) startDelay = 0
  @property({ type: Boolean }) caret = true

  @state() private shown = 0
  @state() private done = false

  private interval?: ReturnType<typeof setInterval>
  private starter?: ReturnType<typeof setTimeout>

  static styles = css`
    :host { display: inline; }
    .caret {
      margin-left: 1px;
      display: inline-block;
      width: 0.5ch;
      color: #7dd3fc;
      animation: blink 1s steps(1, end) infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
  `

  private prefersReducedMotion (): boolean {
    return typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  }

  private clearTimers (): void {
    if (this.interval != null) clearInterval(this.interval)
    if (this.starter != null) clearTimeout(this.starter)
    this.interval = undefined
    this.starter = undefined
  }

  private run (): void {
    this.clearTimers()
    if (this.prefersReducedMotion() || this.text === '') {
      this.shown = this.text.length
      this.done = true
      return
    }
    this.shown = 0
    this.done = false
    this.starter = setTimeout(() => {
      this.interval = setInterval(() => {
        this.shown += 1
        if (this.shown >= this.text.length) {
          this.clearTimers()
          this.done = true
        }
      }, this.speed)
    }, this.startDelay)
  }

  firstUpdated (): void {
    this.run()
  }

  willUpdate (changed: PropertyValues): void {
    if (changed.has('text') && this.hasUpdated) {
      this.run()
    }
  }

  disconnectedCallback (): void {
    super.disconnectedCallback()
    this.clearTimers()
  }

  render (): TemplateResult {
    return html`<span>${this.text.slice(0, this.shown)}</span>${this.caret && !this.done ? html`<span class="caret">▋</span>` : ''}`
  }
}

/* ── Durable Content Credentials — the 3 pillars ────────────────────────────
 * Three cells: Signed & timestamped, Durable watermark, Cloud-recoverable.
 * Active pillars glow emerald; inactive ones dim. Mirrors trusteddit.com.
 */
const PILLAR_DEFS: Array<{ key: keyof DurablePillars, label: string, sub: string, icon: TemplateResult }> = [
  {
    key: 'signedAndTimestamped',
    label: 'Signed & timestamped',
    sub: 'C2PA + RFC 3161',
    icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`
  },
  {
    key: 'trustmark',
    label: 'Durable watermark',
    sub: 'TrustMark soft binding',
    icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11a1.8 1.8 0 0 1 1.8 1.8c0 1.9-.2 3.6-.9 5.2"/><path d="M9.2 11.6a3 3 0 0 1 5.6 1.2c0 2.6-.3 4.6-1.1 6.6"/><path d="M6.6 12a5.4 5.4 0 0 1 10.8 0c0 1.4-.1 2.8-.5 4.1"/><path d="M4.6 13.2a7.4 7.4 0 0 1 14.8-.6"/></svg>`
  },
  {
    key: 'manifestStore',
    label: 'Cloud-recoverable',
    sub: 'manifest store',
    icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>`
  }
]

@customElement('c2pa-pillars')
export class C2paPillars extends LitElement {
  @property({ type: Object }) pillars: DurablePillars | null = null

  static styles = [
    sharedStyles,
    css`
      :host { display: block; }
      .wrap {
        margin-top: 14px;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.4);
        padding: 10px;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .head .label {
        font-size: 10px;
        font-weight: var(--font-bold);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text);
      }
      .chip {
        border-radius: 4px;
        padding: 2px 7px;
        font-size: 9px;
        font-weight: var(--font-bold);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .chip.on  { background: rgba(16, 185, 129, 0.16); color: var(--ok); }
      .chip.off { background: rgba(51, 65, 85, 0.4); color: var(--text-dim); }

      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 10px 6px;
        transition: border-color 0.3s ease, background 0.3s ease, opacity 0.3s ease;
      }
      .cell.on  { border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.06); }
      .cell.off { background: rgba(15, 23, 42, 0.35); opacity: 0.55; }

      .cell svg { width: 22px; height: 22px; }
      .cell.on  svg { color: var(--ok); filter: drop-shadow(0 0 6px var(--ok-glow)); }
      .cell.off svg { color: var(--text-dim); }

      .cell .l { font-size: 9.5px; font-weight: var(--font-bold); line-height: 1.2; }
      .cell.on  .l { color: var(--text-bright); }
      .cell.off .l { color: var(--text-dim); }
      .cell .s { font-size: 8.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }

      .note { margin-top: 8px; font-size: 9.5px; line-height: 1.4; color: var(--text-dim); }
    `]

  render (): TemplateResult | typeof nothing {
    const p = this.pillars
    if (p == null) return nothing
    return html`
      <div class="wrap">
        <div class="head">
          <span class="label">Durable Content Credentials</span>
          <span class="chip ${p.durable ? 'on' : 'off'}">${p.count}/3 pillars</span>
        </div>
        <div class="grid">
          ${PILLAR_DEFS.map((def) => {
            const on = p[def.key] === true
            return html`
              <div class="cell ${on ? 'on' : 'off'}">
                ${def.icon}
                <span class="l">${def.label}</span>
                <span class="s">${def.sub}</span>
              </div>
            `
          })}
        </div>
        ${!p.durable
          ? html`<p class="note">${p.embedOnly
              ? 'Embed-only credential — the signature is valid, but with no durable binding it is lost if the file is re-encoded or stripped.'
              : 'Not all durability pillars are present.'}</p>`
          : nothing}
      </div>
    `
  }
}

@customElement('c2pa-collapsible')
export class C2paCollapsible extends LitElement {
  @property({ type: Boolean }) open = false

  static openCollapsible: C2paCollapsible | null = null

  static styles = [
    sharedStyles,
    innerHostStyles,
    css`
    .collapsible-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: var(--font-bold);
      font-size: 12px;
      color: var(--text);
      padding: 4px 0;
    }
    .collapsible-content {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.3s ease, padding 0.3s ease;
      padding: 0 0 0 14px;
    }
    .collapsible-content.open { max-height: 400px; }
    .icon {
      transition: transform 0.3s ease;
      width: 10px;
      height: 10px;
      transform-origin: center;
      display: inline-block;
      transform: rotate(270deg);
    }
    .icon path { fill: var(--text-dim); }
    .rotated { transform: rotate(180deg); }
  `]

  static close (): void {
    if (C2paCollapsible.openCollapsible != null) {
      C2paCollapsible.openCollapsible.toggle()
    }
  }

  toggle = (): void => {
    if (C2paCollapsible.openCollapsible != null && C2paCollapsible.openCollapsible !== this) {
      C2paCollapsible.openCollapsible.toggle()
    }
    this.open = !this.open
    C2paCollapsible.openCollapsible = this.open ? this : null
  }

  render (): TemplateResult {
    return html`
      <div class="collapsible-container">
        <div class="collapsible-header" @click="${this.toggle}">
          <span class="section-title"><slot name="header">Default Header</slot></span>
          ${this.open ? this.renderIcon('open') : this.renderIcon('closed')}
        </div>
        <div class="collapsible-content ${this.open ? 'open' : ''}">
          <slot name="content">Default Content</slot>
        </div>
      </div>
    `
  }

  renderIcon (state: 'open' | 'closed'): TemplateResult {
    const iconClass = state === 'open' ? 'icon rotated' : 'icon'
    return html`<svg class="${iconClass}" viewBox="0 0 512 512">
      <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
          <g transform="translate(32.000000, 42.666667)">
              <path d="M246.312928,5.62892705 C252.927596,9.40873724 258.409564,14.8907053 262.189374,21.5053731 L444.667042,340.84129 C456.358134,361.300701 449.250007,387.363834 428.790595,399.054926 C422.34376,402.738832 415.04715,404.676552 407.622001,404.676552 L42.6666667,404.676552 C19.1025173,404.676552 7.10542736e-15,385.574034 7.10542736e-15,362.009885 C7.10542736e-15,354.584736 1.93772021,347.288125 5.62162594,340.84129 L188.099293,21.5053731 C199.790385,1.04596203 225.853517,-6.06216498 246.312928,5.62892705 Z"></path>
          </g>
      </g>
    </svg>`
  }
}

@customElement('c2pa-grid-display')
export class C2paGridDisplay extends LitElement {
  @property({ type: Array }) items: IconTextItem[] = []

  static styles = [
    sharedStyles,
    css`
      .grid-container {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 16px;
        align-items: center;
        margin: 8px 0;
      }
      .icon {
        width: 18px;
        height: 18px;
        grid-row: span 1;
        opacity: 0.85;
      }
      img { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
      .text-block { display: flex; flex-direction: column; justify-content: center; }
      .text-line { font-size: 11px; color: var(--text); margin-bottom: 0; }
    `]

  render (): TemplateResult {
    return html`
      <div class="grid-container">
        ${this.items.map((item, index) => html`
          <div class="icon" style="grid-row: ${index + 1};">
            ${item.icon != null ? html`<img src="${item.icon}" alt="Icon">` : ''}
          </div>
          <div class="text-block" style="grid-row: ${index + 1};">
            ${item.text.map(line => html`<div class="text-line">${line}</div>`)}
          </div>
        `)}
      </div>
    `
  }
}

const unknownSvg = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2218%22%20viewBox%3D%220%200%2018%2018%22%20width%3D%2218%22%3E%20%20%3Cdefs%3E%20%20%20%20%3Cstyle%3E%20%20%20%20%20%20.fill%20%7B%20%20%20%20%20%20%20%20fill%3A%20%236E6E6E%3B%20%20%20%20%20%20%7D%20%20%20%20%3C%2Fstyle%3E%20%20%3C%2Fdefs%3E%20%20%3Ctitle%3ES%20AlertCircle%2018%20N%3C%2Ftitle%3E%20%20%3Crect%20id%3D%22Canvas%22%20fill%3D%22%23ff13dc%22%20opacity%3D%220%22%20width%3D%2218%22%20height%3D%2218%22%20%2F%3E%3Cpath%20class%3D%22fill%22%20d%3D%22M7.84555%2C12.88618a1.13418%2C1.13418%2C0%2C0%2C1%2C1.1161-1.15195q.042-.00064.08391.00178a1.116%2C1.116%2C0%2C0%2C1%2C1.2%2C1.15017%2C1.09065%2C1.09065%2C0%2C0%2C1-1.2%2C1.11661%2C1.0908%2C1.0908%2C0%2C0%2C1-1.2-1.11661ZM10.0625%2C4.39771a.20792.20792%2C0%2C0%2C1%2C.09966.183V5.62212c0%2C1.40034-.28322%2C3.98034-.33305%2C4.48067%2C0%2C.04984-.01678.09967-.11695.09967H8.379a.11069.11069%2C0%2C0%2C1-.11695-.09967c-.03305-.46678-.3-3.0305-.3-4.43084V4.6306a.1773.1773%2C0%2C0%2C1%2C.08339-.18306%2C2.88262%2C2.88262%2C0%2C0%2C1%2C1.00017-.20033A3.27435%2C3.27435%2C0%2C0%2C1%2C10.0625%2C4.39771ZM17.50005%2C9A8.50005%2C8.50005%2C0%2C1%2C1%2C9%2C.5H9A8.50008%2C8.50008%2C0%2C0%2C1%2C17.50005%2C9ZM15.67484%2C9A6.67485%2C6.67485%2C0%2C1%2C0%2C9%2C15.6748H9A6.67479%2C6.67479%2C0%2C0%2C0%2C15.67484%2C9Z%22%20%2F%3E%3C%2Fsvg%3E'

const signSvg = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2218%22%20viewBox%3D%220%200%2018%2018%22%20width%3D%2218%22%3E%20%20%3Cdefs%3E%20%20%20%20%3Cstyle%3E%20%20%20%20%20%20.fill%20%7B%20%20%20%20%20%20%20%20fill%3A%20%236E6E6E%3B%20%20%20%20%20%20%7D%20%20%20%20%3C%2Fstyle%3E%20%20%3C%2Fdefs%3E%20%20%3Ctitle%3ES%20Draw%2018%20N%3C%2Ftitle%3E%20%20%3Crect%20id%3D%22Canvas%22%20fill%3D%22%23ff13dc%22%20opacity%3D%220%22%20width%3D%2218%22%20height%3D%2218%22%20%2F%3E%3Cpath%20class%3D%22fill%22%20d%3D%22M10.227%2C4%2C2.542%2C11.686a.496.496%2C0%2C0%2C0-.1255.2105L1.0275%2C16.55c-.057.188.2295.425.3915.425a.15587.15587%2C0%2C0%2C0%2C.031-.003c.138-.032%2C3.9335-1.172%2C4.6555-1.389a.492.492%2C0%2C0%2C0%2C.2075-.125L14%2C7.772ZM5.7%2C14.658c-1.0805.3245-2.431.7325-3.3645%2C1.011L3.34%2C12.304Z%22%20%2F%3E%20%20%3Cpath%20class%3D%22fill%22%20d%3D%22M16.7835%2C4.1%2C13.9%2C1.216a.60751.60751%2C0%2C0%2C0-.433-.1765H13.45a.686.686%2C0%2C0%2C0-.4635.2035l-2.05%2C2.05L14.708%2C7.0645l2.05-2.05a.686.686%2C0%2C0%2C0%2C.2-.4415A.612.612%2C0%2C0%2C0%2C16.7835%2C4.1Z%22%20%2F%3E%3C%2Fsvg%3E'

function certificateItems (certificates: CertificateInfoExtended[]): IconTextItem[] {
  return certificates.map((cert) => {
    return {
      icon: 'icons/seal.svg',
      text: [cert.issuer.CN, cert.issuer.O, `${cert.validFrom} - ${cert.validTo}`]
    }
  })
}

function signatureItems (signature: { issuer: string }): IconTextItem[] {
  if (signature == null) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  return [{
    icon: signSvg,
    text: [
      signature.issuer ?? 'unknown'
    ]
  }]
}

function ingredientItems (ingredients: ExtensionC2paIngredient[] | undefined): IconTextItem[] {
  if (ingredients == null || ingredients.length === 0) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  return ingredients.map((ingredient) => {
    return {
      icon: ingredient.thumbnail.data,
      text: [
        ingredient.title,
        ingredient.format
      ]
    }
  })
}

function activityItems (activities: Activity[] | undefined): IconTextItem[] {
  if (activities == null || activities.length === 0) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  return activities.map((activity) => {
    return {
      icon: activity.icon,
      text: [activity.description]
    }
  })
}
