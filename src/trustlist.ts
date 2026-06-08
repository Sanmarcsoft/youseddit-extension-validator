/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type CertificateInfoExtended, calculateSha256CertThumbprintFromX5c, PEMtoDER, certificateFromDer, distinguishedNameToString, verifyParentSignedChild } from './certs/certs';
import { AWAIT_ASYNC_RESPONSE, MSG_ADD_TRUSTLIST, MSG_GET_TRUSTLIST_INFOS, MSG_REMOVE_TRUSTLIST, type MSG_PAYLOAD, LOCAL_TRUST_ANCHOR_LIST_NAME, MSG_TRUSTLIST_UPDATE, LOCAL_TRUST_TSA_LIST_NAME, MSG_ADD_TRUSTFILE, MSG_ADD_TSA_TRUSTFILE } from './constants';
import { bytesToBase64, sendMessageToAllTabs } from './utils';

// Directly import the JSON files (bundled into the JS by Rollup; not shipped
// as separate files in dist/, so they cannot be enumerated by web pages).
// #125: production trust anchors live under src/trust-anchors/ (NOT test/), so
// fixtures and real roots-of-trust can never be confused or swapped.
import defaultTestTrustList from './trust-anchors/default-trust-list.json';
import defaultAiTrustList from './trust-anchors/ai-trust-list.json';
// Trusteddit.com anchors: the CA chain (signing) + the TSA chain (timestamps).
// Trusting the Trusteddit-Journalist-Issuer-CA trusts every leaf it issues.
import trustedditTrustList from './trust-anchors/trusteddit-trust-list.json';
import trustedditTsaTrustList from './trust-anchors/trusteddit-tsa-trust-list.json';

// valid JWK key types (to adhere to C2PA cert profile: https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html#_certificate_profile)
type ValidKeyTypes = 'RSA' /* sha*WithRSAEncryption and id-RSASSA-PSS */ | 'EC' /* ecdsa-with-* */ | 'OKP' /* id-Ed25519 */

// JWKS format (https://www.rfc-editor.org/rfc/rfc7517#section-4.6)
interface JWK {
  kty: string
  'x5t#S256'?: string
  x5c?: string[]
}

interface JWKS {
  keys: JWK[]
}

export interface TrustedEntity {
  name: string
  display_name: string
  contact: string
  isCA: boolean
  jwks: JWKS
}

export interface TrustList {
  // version of the trust list schema
  version?: string
  // name of the trust list
  name?: string
  // description of the trust list
  description: string
  // download url of the trust list
  download_url: string
  // website of the trust list
  website: string
  // last updated date of the trust list (ISO 8601 format)
  last_updated: string
  // logo of the trust list (optional)
  logo_icon?: string
  // list of trusted entities
  entities: TrustedEntity[]
}

// trust list info (subset of the trust list data)
export interface TrustListInfo {
  version?: string
  name?: string
  description: string
  download_url: string
  website: string
  last_updated: string
  logo_icon?: string
  entities_count: number
}

/**
 * Information about a trust list match
 */
export interface TrustListMatch {
  // trust list info
  tlInfo: TrustListInfo
  // trusted entity that matched the certificate chain
  entity: TrustedEntity
  // certificate that matched the trust list
  cert: CertificateInfoExtended
}

let globalTrustLists: TrustList[] = []

// Hosts permitted to serve auto-refreshed trust lists (#124). A custom list's
// download_url is only re-fetched if its host is on (or a subdomain of) this set.
const ALLOWED_REFRESH_HOSTS = ['contentcredentials.org', 'c2pa.org', 'trusteddit.com', 'verifieddit.com']

function isAllowedRefreshHost (urlString: string): boolean {
  let host: string
  try {
    host = new URL(urlString).hostname.toLowerCase()
  } catch {
    return false
  }
  return ALLOWED_REFRESH_HOSTS.some((h) => host === h || host.endsWith('.' + h))
}

/**
 * Structural validation of untrusted trust-list JSON before it is accepted into
 * the trust store (#124). Rejects malformed shapes before they reach the x509
 * parser via processDownloadedTrustList.
 */
export function validateTrustListShape (tl: unknown): tl is TrustList {
  if (typeof tl !== 'object' || tl === null) return false
  const t = tl as Record<string, unknown>
  if (typeof t.description !== 'string') return false
  if (!Array.isArray(t.entities)) return false
  for (const e of t.entities) {
    if (typeof e !== 'object' || e === null) return false
    const ent = e as Record<string, unknown>
    if (typeof ent.name !== 'string' || typeof ent.isCA !== 'boolean') return false
    const jwks = ent.jwks as Record<string, unknown> | undefined
    if (jwks == null || !Array.isArray(jwks.keys)) return false
  }
  return true
}

const getInfoFromTrustList = (tl: TrustList): TrustListInfo => {
  const tli: TrustListInfo = {
    description: tl.description,
    download_url: tl.download_url,
    website: tl.website,
    last_updated: tl.last_updated,
    entities_count: tl.entities.length
  }
  if (tl.version != null) {
    tli.version = tl.version
  }
  if (tl.name != null) {
    tli.name = tl.name
  }
  if (tl.logo_icon != null) {
    tli.logo_icon = tl.logo_icon
  }
  return tli
}

/**
 * Retrieves the trust list infos.
 * @returns The trust list infos if available, otherwise undefined.
 */
export async function getTrustListInfos (): Promise<TrustListInfo[]> {
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    return await Promise.resolve(globalTrustLists.map(tl => getInfoFromTrustList(tl)))
  } else {
    return await Promise.resolve([])
  }
}

/**
 * Process a downloaded trust list before storing it
 */
async function processDownloadedTrustList (tl: TrustList): Promise<void> {
  // make sure each certificate has a thumbprint, if not, calculate it
  for (const entity of tl.entities) {
    for (const jwk of entity.jwks.keys) {
      if ((jwk['x5t#S256'] == null) && (jwk.x5c != null) && jwk.x5c.length > 0) {
        // calculate the thumbprint of the first cert in the chain
        try {
          jwk['x5t#S256'] = await calculateSha256CertThumbprintFromX5c(jwk.x5c[0])
        } catch (error) {
          // log the error, ignore the cert
        }
      }
    }
  }
}

/**
 * Returns the JWK key type `kty` corresponding to a supported signature alg
 */
function sigAlgToKeyType (sigAlg: string): ValidKeyTypes {
  const sigAlgLC = sigAlg.toLowerCase().replace('-', '')
  if (sigAlgLC === 'sha256withrsaencryption' || sigAlgLC === 'sha384withrsaencryption' || sigAlgLC === 'sha512withrsaencryption' || sigAlgLC === 'idrsassapss') {
    return 'RSA'
  } else if (sigAlgLC === 'ecdsawithsha256' || sigAlgLC === 'ecdsawithsha384' || sigAlgLC === 'ecdsawithsha512') {
    return 'EC'
  } else if (sigAlgLC === 'ided25519') {
    return 'OKP'
  } else {
    throw new Error(`Unsupported C2PA sig alg: ${sigAlg}`)
  }
}

/**
 * Stores the updated trust lists and notify the tab of the update
 */
async function storeUpdatedTrustLists (message?: string): Promise<void> {
  await chrome.storage.local.set({ trustList: globalTrustLists })
  void notifyTabsOfTrustListUpdate()
}

/**
 * Adds a trust anchor to the built-in trust anchors list, returns the corresponding trust list info or throws an error
 */
export async function addTrustAnchor (pemCert: string, tsa = false): Promise<void> {
  if (pemCert == null || typeof pemCert !== 'string') {
    throw new Error('Invalid trust anchor')
  }

  const derCert = PEMtoDER(pemCert)
  const cert = await certificateFromDer(derCert)
  const x5c = bytesToBase64(derCert)

  // create an entity to add to the built-in trust anchor list
  const DN = distinguishedNameToString(cert.subject)
  const kty = sigAlgToKeyType(cert.signatureAlgorithm)
  const entity: TrustedEntity = {
    name: DN,
    display_name: DN,
    contact: '', // n/a
    isCA: true,
    jwks: {
      keys: [
        {
          kty,
          x5c: [
            x5c
          ],
          'x5t#S256': cert.sha256Thumbprint
        }
      ]
    }
  }

  // find the local trust anchor list
  const listName = tsa ? LOCAL_TRUST_TSA_LIST_NAME : LOCAL_TRUST_ANCHOR_LIST_NAME
  const anchorTL = globalTrustLists.find(tl => tl.name === listName)
  if (anchorTL == null) {
    // list doesn't exist; create it
    const tl: TrustList = {
      name: listName,
      description: listName,
      download_url: '', // n/a
      website: '', // n/a
      last_updated: '', // unused for non-downloadable trust lists
      entities: [entity]
    }
    globalTrustLists.push(tl)
  } else {
    // add the entity to the list
    // add or replace the entity in the list
    const existingEntity = anchorTL.entities.find(e => e.name === entity.name)
    if (existingEntity != null) {
      const index = anchorTL.entities.indexOf(existingEntity)
      anchorTL.entities[index] = entity
    } else {
      anchorTL?.entities.push(entity)
    }
    // update the global trust list
    const index = globalTrustLists.indexOf(anchorTL)
    globalTrustLists[index] = anchorTL
  }

  await storeUpdatedTrustLists(`Trust anchor added to the ${listName} list: ${entity.name}`)
}

/**
 * Adds a trust list, returns the corresponding trust list info or throws an error
 */
export async function addTrustList (tl: TrustList): Promise<void> {

  // #124: validate the structure of an imported (untrusted) trust list before
  // it reaches the x509 parser, rather than the previous `typeof tl` no-op.
  if (!validateTrustListShape(tl)) {
    throw new Error('Invalid trust list')
  }

  await processDownloadedTrustList(tl)

  // set the global trust list
  globalTrustLists.push(tl)

  void storeUpdatedTrustLists(`Trust list stored: ${tl.name}`)
}

/**
 * Adds a trust file, either a trust list or a single certificate
 * @param content file content
 */
export async function addTrustFile (content: string): Promise<void> {
  if (content.startsWith('{')) {
    const json = JSON.parse(content) as TrustList
    await addTrustList(json)
  } else {
    await addTrustAnchor(content)
  }
}

/**
 * Adds a TSA trust file, either a trust list or a single certificate
 * @param content file content
 */
export async function addTSATrustFile (content: string): Promise<void> {
  await addTrustAnchor(content, true)
}

/**
 * Removes a trust list from the trust list array.
 * @param index index of the trust list to remove
 */
export async function removeTrustList (index: number): Promise<void> {

  const name = globalTrustLists[index].name

  // remove the trust list
  globalTrustLists.splice(index, 1)

  await storeUpdatedTrustLists(`Trust list removed, index: ${index}, name: ${name}`)
}

/**
 * Retrieves the trust lists from storage.
 */
export async function loadTrustLists (): Promise<void> {
  // load the trust lists from storage
  const trustListStore = await chrome.storage.local.get('trustList') as { trustList: TrustList[] }
  const storedTrustList = trustListStore.trustList
  if (storedTrustList != null) {
    globalTrustLists = storedTrustList
  } else {
  }
}

/**
 * Checks if a certificate chain is included in a trust list (either the leaf certificate or one of the CA anchors)
 * @param certChain a certificate chain
 * @returns a trust list match object if found, otherwise null
 */
/**
 * Build the signature-VERIFIED certificate path starting from the signing leaf
 * (certChain[0]) and walking upward: at each step we look for a cert in the
 * supplied chain that *actually signed* the current cert (real signature check,
 * not DN/thumbprint matching). A cert merely present in the array but which did
 * not sign anything on the path is never added.
 *
 * This is the heart of the trust-spoof fix (issue #112): an attacker can paste
 * a trusted CA cert into the COSE x5chain, but it will not appear on the
 * verified path because it did not sign the attacker's leaf.
 */
function buildVerifiedPath (certChain: CertificateInfoExtended[]): CertificateInfoExtended[] {
  const leaf = certChain[0]
  const path: CertificateInfoExtended[] = [leaf]
  const used = new Set<string>([leaf.sha256Thumbprint])
  let current = leaf
  // Bounded by the chain length; each iteration adds at most one cert.
  for (let i = 0; i < certChain.length; i++) {
    let next: CertificateInfoExtended | null = null
    for (const candidate of certChain) {
      if (used.has(candidate.sha256Thumbprint)) continue
      if (candidate.der != null && current.der != null && verifyParentSignedChild(candidate.der, current.der)) {
        next = candidate
        break
      }
    }
    if (next == null) break
    path.push(next)
    used.add(next.sha256Thumbprint)
    current = next
  }
  return path
}

/**
 * Match a single certificate against the trust lists by SHA-256 thumbprint and
 * CA flag.
 */
function matchCertToTrustLists (cert: CertificateInfoExtended, trustLists: TrustList[]): TrustListMatch | null {
  for (const trustList of trustLists) {
    for (const entity of trustList.entities) {
      for (const jwkCert of entity.jwks.keys) {
        if ((jwkCert['x5t#S256'] != null) && jwkCert['x5t#S256'].toLowerCase() === cert.sha256Thumbprint && entity.isCA === cert.isCA) {
          return { tlInfo: getInfoFromTrustList(trustList), entity, cert }
        }
      }
    }
  }
  return null
}

/**
 * Checks whether the signing certificate chains, via a signature-VERIFIED path,
 * to a trusted anchor. Replaces the previous "any thumbprint present in the
 * chain" logic, which trusted a cert merely co-located in an attacker-supplied
 * array (issue #112, CRITICAL-1).
 *
 * Trust is granted only when EITHER:
 *  (a) a trusted entity sits on the verified path from the leaf, OR
 *  (b) a trusted CA anchor we hold actually signed the top of the verified path
 *      (covers chains that omit the root and embed only leaf+intermediates).
 */
export function checkTrustListInclusion (certChain: CertificateInfoExtended[], trustLists: TrustList[] = globalTrustLists): TrustListMatch | null {
  if (certChain == null || certChain.length === 0) return null
  if (trustLists == null || trustLists.length === 0) return null

  // 1. Verified path from the signing leaf upward.
  const path = buildVerifiedPath(certChain)

  // 2. A trusted entity that sits ON the verified path (leaf or any verified CA).
  for (const cert of path) {
    const match = matchCertToTrustLists(cert, trustLists)
    if (match != null) return match
  }

  // 3. A trusted CA anchor we hold that actually signed the top of the path,
  //    even if that anchor was not embedded in the chain.
  const top = path[path.length - 1]
  if (top.der != null) {
    for (const trustList of trustLists) {
      for (const entity of trustList.entities) {
        if (!entity.isCA) continue
        for (const jwk of entity.jwks.keys) {
          const anchorDer = jwk.x5c?.[0]
          if (anchorDer != null && verifyParentSignedChild(anchorDer, top.der)) {
            return { tlInfo: getInfoFromTrustList(trustList), entity, cert: top }
          }
        }
      }
    }
  }

  return null
}

/**
 * Checks if a certificate chain is included in the TSA trust list (either the leaf certificate or one of the CA anchors)
 * @param certChain a certificate chain
 * @returns a trust list match object if found, otherwise null
 */
export function checkTSATrustListInclusion (certChain: CertificateInfoExtended[]): TrustListMatch | null {
  return checkTrustListInclusion(certChain, globalTrustLists.filter(tl => tl.name === LOCAL_TRUST_TSA_LIST_NAME))
}

// update the trust lists if they are outdated
export async function refreshTrustLists (): Promise<void> {
  let trustListsUpdated = false
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    const fetchPromises = globalTrustLists.map(async (trustList, index) => {
      if (trustList.download_url !== '') {
        // #124: only refresh from an allowlisted host, with credentials omitted.
        if (!isAllowedRefreshHost(trustList.download_url)) {
          throw new Error(`Trust list refresh for ${trustList.name}: host not allowlisted`)
        }
        const response = await fetch(trustList.download_url, { credentials: 'omit' })
        // Guard against captive portals / 5xx returning HTML 200; without this
        // the next .json() throws and the outer catch silently keeps the user
        // on a stale trust list (security degradation invisible to user).
        if (!response.ok) {
          throw new Error(`Trust list refresh failed for ${trustList.name}: HTTP ${response.status}`)
        }
        const raw: unknown = await response.json()
        // #124: validate the untrusted shape before it reaches the x509 parser.
        if (!validateTrustListShape(raw)) {
          throw new Error(`Trust list refresh for ${trustList.name}: malformed schema`)
        }
        const freshTrustList = raw
        if (freshTrustList.last_updated > trustList.last_updated) {
          await processDownloadedTrustList(freshTrustList)
          globalTrustLists[index] = freshTrustList
          trustListsUpdated = true
        }
      } else {
        await Promise.resolve()
      }
    })

    await Promise.all(fetchPromises)

    if (trustListsUpdated) {
      await storeUpdatedTrustLists('Trust lists refreshed')
    }
  }
}

async function notifyTabsOfTrustListUpdate (): Promise<void> {
  void sendMessageToAllTabs({ action: MSG_TRUSTLIST_UPDATE, data: null })
}

/*
 *  Initialize the trust list module and message listeners
 *  Other modules import functions from this module, but they don't want the listeners
 *  So the init function needs to be called explicitly
 */
async function loadDefaultTrustLists (): Promise<void> {

  let defaultLoaded = 0
  let lastError: unknown = null

  try {
    const testTrustList = defaultTestTrustList as TrustList;
    await processDownloadedTrustList(testTrustList);
    globalTrustLists.push(testTrustList);
    defaultLoaded += 1
  } catch (error) {
    lastError = error
  }

  try {
    const aiTrustList = defaultAiTrustList as TrustList;
    await processDownloadedTrustList(aiTrustList);
    globalTrustLists.push(aiTrustList);
    defaultLoaded += 1
  } catch (error) {
    lastError = error
  }

  try {
    const tdTrustList = trustedditTrustList as TrustList;
    await processDownloadedTrustList(tdTrustList);
    globalTrustLists.push(tdTrustList);
    defaultLoaded += 1
  } catch (error) {
    lastError = error
  }

  try {
    // Named 'Local TSA Anchors' so checkTSATrustListInclusion picks it up.
    const tdTsaTrustList = trustedditTsaTrustList as TrustList;
    await processDownloadedTrustList(tdTsaTrustList);
    globalTrustLists.push(tdTsaTrustList);
    defaultLoaded += 1
  } catch (error) {
    lastError = error
  }

  // If BOTH default lists fail to load, every signed image renders untrusted
  // and the user has no idea why. Throw so init() can surface it instead of
  // silently persisting an empty trust list.
  if (defaultLoaded === 0) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`No default trust lists loaded: ${msg}`)
  }

  await storeUpdatedTrustLists('Default trust lists loaded.');
}

export async function init (): Promise<void> {
  await loadTrustLists(); // Attempt to load existing trust lists first
  if (globalTrustLists.length === 0) {
    try {
      await loadDefaultTrustLists();
      // Clear any prior error so the popup banner reflects current state.
      void chrome.storage.session?.remove('trustListsInitError')
    } catch (error) {
      // Surface the failure via chrome.storage.session so the popup can
      // render a banner, but keep init alive so the message handlers
      // below still register. A SW that cannot answer GET_TRUSTLIST_INFOS
      // is worse than one that answers with the explicit error state.
      const message = error instanceof Error ? error.message : String(error)
      void chrome.storage.session?.set({ trustListsInitError: message })
    }
  } else {
  }

  chrome.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (request: MSG_PAYLOAD, sender, sendResponse) => {
      if (request.action === MSG_GET_TRUSTLIST_INFOS) {
        void getTrustListInfos().then(sendResponse);
        return AWAIT_ASYNC_RESPONSE;
      }
      if (request.action === MSG_ADD_TRUSTLIST) {
        void addTrustList(request.data as TrustList).then(sendResponse);
        return AWAIT_ASYNC_RESPONSE;
      }
      if (request.action === MSG_ADD_TRUSTFILE) {
        void addTrustFile(request.data as string).then(sendResponse);
        return AWAIT_ASYNC_RESPONSE;
      }
      if (request.action === MSG_ADD_TSA_TRUSTFILE) {
        void addTSATrustFile(request.data as string).then(sendResponse);
        return AWAIT_ASYNC_RESPONSE;
      }
      if (request.action === MSG_REMOVE_TRUSTLIST) {
        void removeTrustList(request.data as number).then(sendResponse);
        return AWAIT_ASYNC_RESPONSE;
      }
    }
  );
}
