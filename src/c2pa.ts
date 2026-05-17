/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { createC2pa, selectEditsAndActivity, type C2pa, type C2paReadResult, type ManifestMap, type ManifestStore, type TranslatedDictionaryCategory } from 'c2pa'
import { type CertificateInfoExtended } from './certs/certs.js'
import { decode as coseDecode, type TSTInfo, type COSE_Sign1 } from './certs/cose.js'
import { isContentBox, decode as jumbfDecode } from './certs/jumbf.js'
import { getManifestFromMetadata } from './certs/metadata.js'
import { AWAIT_ASYNC_RESPONSE, MSG_C2PA_VALIDATE_URL, type MSG_PAYLOAD } from './constants.js'
import { type TrustListMatch } from './trustlistProxy.js'
import { blobToDataURL } from './utils.js'

let c2pa: C2pa | null = null

export interface C2paResult extends ExtensionC2paResult {
  url: string
  certChain: CertificateInfoExtended[] | null
  tstTokens: TSTInfo[] | null
  trustList: TrustListMatch | null
  tsaTrustList: TrustListMatch | null
  editsAndActivity: TranslatedDictionaryCategory[] | null
}

export interface C2paError extends Error {
  url: string
}

export async function init (): Promise<void> {
  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  createC2pa({ wasmSrc: wasmUrl, workerSrc: workerUrl })
    .then(
      (newC2pa) => {
        c2pa = newC2pa
      },
      (error: unknown) => {
      }
    )

  chrome.runtime.onMessage.addListener(
    (request: MSG_PAYLOAD, sender, sendResponse) => {
      if (request.action === MSG_C2PA_VALIDATE_URL) {
        void validateUrl(request.data as string).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
    }
  )
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError;
  }

  let c2paReadResult: C2paReadResult | Error;
  try {
    c2paReadResult = await c2pa.read(url);
  } catch (error: any) {
    c2paReadResult = error;
  }

  if (c2paReadResult instanceof Error) {
    return { message: c2paReadResult.message, url, name: c2paReadResult.name } satisfies C2paError;
  }

  if (c2paReadResult.manifestStore?.activeManifest == null) {
    // Log the full c2paReadResult when no manifest is found for further debugging
    return { message: 'No manifest found', url, name: 'No Manifest' } satisfies C2paError;
  }

  const serializedResult = await serializeC2paReadResult(c2paReadResult)

  const sourceBuffer = await c2paReadResult.source.arrayBuffer()

  const cose = await extractC2paManifest(c2paReadResult.source.type, new Uint8Array(sourceBuffer))

  const editsAndActivity = ((c2paReadResult.manifestStore?.activeManifest) != null) ? await selectEditsAndActivity(c2paReadResult.manifestStore?.activeManifest) : null

  const result: C2paResult = {
    ...serializedResult,
    url,
    trustList: null,
    tsaTrustList: null,
    certChain: cose?.unprotected?.x5chain ?? cose?.protected.x5chain ?? null,
    tstTokens: cose?.unprotected?.sigTst?.tstTokens ?? null,
    editsAndActivity
  }

  return result
}

export async function extractC2paManifest (type: string, mediaBuffer: Uint8Array): Promise<COSE_Sign1 | null> {
  const rawManifestBuffer = getManifestFromMetadata(type, mediaBuffer)
  if (rawManifestBuffer == null) {
    return null
  }

  /*
    The manifest buffer is decoded into a JUMBF structure.
  */
  const jumbf = jumbfDecode(rawManifestBuffer)

  /*
    C2PA manifest files are expected to have a jumbf box with a label 'c2pa.signature' containing a cbor box
  */
  const jumbfBox = jumbf.labels['c2pa.signature']
  if (jumbfBox == null || jumbfBox.boxes.length === 0 || jumbfBox.boxes[0].type !== 'cbor') {
    return null
  }

  const contentBox = jumbfBox.boxes[0]

  /*
    The first, and only box, should have a 'cbor' type
  */
  if (contentBox?.type !== 'cbor' || !isContentBox(contentBox)) {
    return null
  }

  const coseData = contentBox.data

  const cose = await coseDecode(coseData)
  if (cose == null) {
  }

  return cose
}

void init()

export type dataUrl = string

export interface ExtensionC2paIngredient {
  title: string
  format: string
  instanceId: string
  thumbnail: {
    type: string
    data: dataUrl
  }
}

export interface ExtensionC2paManifest {
  key: string
  title: string
  format: string
  claimGenerator: string
  signatureInfo: {
    issuer: string
  }
  ingredients: ExtensionC2paIngredient[]
}

export interface ExtensionC2paResult {
  manifestStore: {
    manifests: ExtensionC2paManifest[]
    activeManifest: number
    validationStatus: string[]
  }
  source: {
    thumbnail: {
      type: string
      data: dataUrl
    }
    type: string
    data: dataUrl
    filename: string
  }
}

async function serializeC2paReadResult (result: C2paReadResult): Promise<ExtensionC2paResult> {
  const manifestStore: ManifestStore | null = result.manifestStore
  if (manifestStore == null) {
    throw new Error('Manifest store is null')
  }
  const c2paManifests: ManifestMap = manifestStore.manifests
  const c2paActiveManifest = manifestStore.activeManifest
  const manifests: ExtensionC2paManifest[] = await Promise.all(
    Object.entries(c2paManifests).map(async ([key, value]) => {
      const ingredients = await Promise.all(
        value.ingredients.map(async ingredient => {
          const thumbType = ingredient.thumbnail?.contentType ?? ''
          const thumbData =
            (thumbType.startsWith('image/') && ingredient.thumbnail?.blob != null)
              ? await blobToDataURL(ingredient.thumbnail.blob)
              : ''
          return {
            title: ingredient.title,
            format: ingredient.format,
            instanceId: ingredient.instanceId,
            thumbnail: {
              type: thumbType,
              data: thumbData
            }
          }
        })
      )
      return {
        key,
        title: value.title,
        format: value.format,
        claimGenerator: value.claimGenerator,
        signatureInfo: {
          issuer: value.signatureInfo?.issuer ?? ''
        },
        ingredients
      }
    })
  )

  const activeManifestIndex = Object.values(c2paManifests).indexOf(c2paActiveManifest)

  const thumbnailData =
  !(result.source.thumbnail.contentType?.startsWith('image/') ?? false)
    ? ''
    : result.source.thumbnail.blob != null
      ? await blobToDataURL(result.source.thumbnail.blob)
      : ''

  // Source-blob inlining budget. Raw bytes above this threshold would produce
  // a base64 data URL that is then structured-cloned four times across
  // inject → background → content-script → overlay-iframe, silently saturating
  // chrome.runtime/chrome.tabs/postMessage and leaving the CR overlay click
  // inert on large real-world C2PA-signed media (e.g. the 4.7 MB CBC fixture).
  // Below the threshold we inline as before; above it we emit the empty string
  // and rely on the overlay's existing thumbnail path + the caller's URL.
  const SOURCE_INLINE_MAX_BYTES = 512 * 1024
  const sourceBlobSize = result.source.blob?.size ?? 0
  const sourceData: dataUrl =
    (result.source.type?.startsWith('video/') ?? false)
      ? ''
      : result.source.blob == null
        ? ''
        : sourceBlobSize > SOURCE_INLINE_MAX_BYTES
          ? ''
          : await blobToDataURL(result.source.blob)

  if (result.source.blob != null && sourceBlobSize > SOURCE_INLINE_MAX_BYTES) {
  }

  const serializedResult = {
    manifestStore: {
      manifests,
      activeManifest: activeManifestIndex,
      validationStatus: manifestStore.validationStatus.map(status => status.explanation ?? status.code.toString())
    },
    source: {
      thumbnail: {
        type: result.source.thumbnail.contentType ?? '',
        data: thumbnailData
      },
      type: result.source.type,
      data: sourceData,
      filename: result.source.metadata.filename ?? ''
    }
  };

  return serializedResult;
}
