/*
 * Typed client for the verifieddit.com public API.
 *
 * The extension already does local in-browser C2PA validation via the
 * bundled WASM c2pa-js library. That path is fast but can't help with:
 *   - images with no embedded manifest (Pillar 1 stripped)
 *   - AI-detection classification
 *   - durable-credential recovery via perceptual fingerprint lookup
 *
 * For those we fan out to the upstream REST endpoints published at
 * verifieddit.com. Documented via the live implementations at:
 *   - verifieddit-www/api/routes/validate.js                (/api/v1/validate)
 *   - verifieddit-www/services/stripe-backend/src/index.ts  (/api/ai-detect)
 *
 * Verifieddit.com is NOT a WebMCP site — confirmed 2026-04-24. Rest API only.
 */

/** Default upstream origin. Overridable via chrome.storage.local.apiBaseUrl. */
export const DEFAULT_API_ORIGIN = 'https://www.verifieddit.com'

export type ValidateStatus = 'trusted' | 'valid' | 'invalid' | 'unsigned' | 'recovered'

export interface RecoveredCredential {
  method: 'fingerprint' | 'watermark'
  similarityScore: number
  manifestId: string
  signerCn: string | null
  signedAt: string | null
  originalFileHash: string | null
  originalFilename: string | null
  explanatoryNote: string
}

export interface ValidateApiResponse {
  status: ValidateStatus
  filename: string
  fileHash: string
  fileSize: number
  /** Shape matches the c2pa-js `read()` result, re-serialised by the server. */
  c2pa: unknown | null
  recovery: RecoveredCredential | null
  trustReceipt: { url: string, format: 'image/png', size: number } | null
  processedAt: string
}

export interface AiDetectApiResponse {
  aiDetected: boolean | null
  confidence: number | null
  detectedGenerator: string | null
  analysisDate: string
  fileHash: string
  cached: boolean
  moderation: {
    nudity: number
    gore: number
    offensive: number
    weapon: number
    unsafe: boolean
    categories: string[]
  } | null
  error?: string
}

export interface ApiFailure { error: string, status: number, code?: string }

function apiOrigin (): string {
  // TODO (rc12.1): make this configurable via chrome.storage.local so QA
  // can point the extension at testing.verifieddit.com. For now the ship
  // build always targets production.
  return DEFAULT_API_ORIGIN
}

/**
 * Fetch image bytes from the given URL (service worker context — arbitrary
 * origins allowed) and POST to /api/v1/validate. Returns the structured
 * response or an ApiFailure describing why the call couldn't complete.
 *
 * Call sites:
 *   - background.ts validateUrl(): after local c2pa.read() when the local
 *     result has no manifest, to recover a credential via perceptual hash.
 *   - (planned rc12.1) large-media offload — skip local c2pa entirely for
 *     images above a size threshold and rely on the server.
 */
export async function validateImageUrl (imageUrl: string): Promise<ValidateApiResponse | ApiFailure> {
  try {
    const fetched = await fetch(imageUrl, { credentials: 'omit', cache: 'default' })
    if (!fetched.ok) {
      return { error: `Upstream fetch failed (${fetched.status})`, status: fetched.status }
    }
    const blob = await fetched.blob()
    const fd = new FormData()
    // The backend multer config expects the field name "image" and the
    // MIME-type set by the Blob; name defaults to the tail of the URL.
    const filename = deriveFilename(imageUrl)
    fd.append('image', blob, filename)

    const endpoint = `${apiOrigin()}/api/v1/validate`
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      body: fd
    })
    if (res.status === 429) return { error: 'rate_limit', status: 429, code: 'RATE_LIMIT' }
    if (!res.ok) {
      let code: string | undefined
      try {
        const body = await res.json() as { code?: string, message?: string }
        code = body?.code
      } catch { /* body not JSON */ }
      return { error: `API ${res.status}`, status: res.status, code }
    }
    const body = await res.json() as ValidateApiResponse
    return body
  } catch (err) {
    return { error: (err as Error)?.message ?? 'unknown', status: 0 }
  }
}

/**
 * POST /api/ai-detect with an image URL. The server fetches the image
 * directly (avoids CORS constraints on the extension side). Returns
 * the structured response or an ApiFailure.
 *
 * Current production requires a Clerk session cookie, but the endpoint
 * also responds to anonymous cross-origin calls with a generic result
 * (probed live 2026-04-24) — we include credentials:omit so we never
 * leak the user's verifieddit.com cookie from unrelated tabs.
 */
export async function detectAiForImageUrl (imageUrl: string): Promise<AiDetectApiResponse | ApiFailure> {
  try {
    const endpoint = `${apiOrigin()}/api/ai-detect`
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        mimeType: 'image/jpeg', // backend auto-sniffs from the URL
        filename: deriveFilename(imageUrl),
        origin: 'verifieddit-extension'
      })
    })
    if (res.status === 429) return { error: 'rate_limit', status: 429, code: 'RATE_LIMIT' }
    if (!res.ok) return { error: `API ${res.status}`, status: res.status }
    return await res.json() as AiDetectApiResponse
  } catch (err) {
    return { error: (err as Error)?.message ?? 'unknown', status: 0 }
  }
}

export function isApiFailure<T extends object> (v: T | ApiFailure): v is ApiFailure {
  return 'status' in v && 'error' in v
}

function deriveFilename (url: string): string {
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').pop() ?? 'image'
    return tail.length > 0 ? tail : 'image'
  } catch {
    return 'image'
  }
}
