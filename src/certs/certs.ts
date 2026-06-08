/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { Certificate, type DistinguishedName as x509DistinguishedName } from '@fidm/x509'
import { Buffer } from 'buffer' // required for polyfill
import { bytesToHex } from '../utils.js'

export interface COSE {
  0: Uint8Array
  1: { x5chain?: Uint8Array[], sigTst?: { tstTokens: Array<{ val: Uint8Array }> } }
  2: null
  3: Uint8Array
}

export interface DistinguishedName {
  CN: string
  C: string
  O: string
  OU: string
  L: string
  ST: string
}

export type isoDateString = string

export interface CertificateInfo {
  issuer: DistinguishedName
  subject: DistinguishedName
  validFrom: isoDateString
  validTo: isoDateString
  isCA: boolean
}

export interface CertificateInfoExtended extends CertificateInfo {
  sha256Thumbprint: string
  signatureAlgorithm: string
  // Base64 DER of the certificate, retained so the trust layer can rebuild a
  // Certificate object and verify chain-path signatures (not just thumbprints).
  // Survives structured-clone messaging where Certificate objects would not.
  der: string
}

export async function calculateSha256CertThumbprintFromDer (der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest({ name: 'SHA-256' }, der)
  const hex = bytesToHex(new Uint8Array(digest))
  return hex
}

export async function calculateSha256CertThumbprintFromX5c (x5c: string): Promise<string> {
  return await calculateSha256CertThumbprintFromDer(Buffer.from(x5c, 'base64'))
}

export async function certificateFromDer (der: Uint8Array): Promise<CertificateInfoExtended> {
  const sha256Thumbprint = await calculateSha256CertThumbprintFromDer(der)
  const pem = DERtoPEM(der)
  const cert = Certificate.fromPEM(Buffer.from(pem, 'utf-8'))

  const certInfo = parseCertificate(cert)

  const certInfoEx = certInfo as CertificateInfoExtended
  certInfoEx.sha256Thumbprint = sha256Thumbprint
  certInfoEx.signatureAlgorithm = cert.signatureAlgorithm
  certInfoEx.der = Buffer.from(der).toString('base64')

  return certInfoEx
}

/**
 * Rebuild an @fidm/x509 Certificate from a base64-DER string. Returns null on
 * any parse error (treated as "cannot verify" by callers — fail closed).
 */
export function certObjectFromDerBase64 (der: string): Certificate | null {
  try {
    const derBytes = Buffer.from(der, 'base64')
    return Certificate.fromPEM(Buffer.from(DERtoPEM(derBytes), 'utf-8'))
  } catch {
    return null
  }
}

/**
 * True iff `parent` actually signed `child` (real signature verification, not
 * a DN/thumbprint heuristic). Both args are base64-DER. Fails closed on any
 * error. This is the primitive that closes the trust-badge spoof: a cert that
 * is merely present in an attacker-controlled chain array does NOT verify a
 * leaf it did not sign.
 */
export function verifyParentSignedChild (parentDer: string, childDer: string): boolean {
  try {
    const parent = certObjectFromDerBase64(parentDer)
    const child = certObjectFromDerBase64(childDer)
    if (parent == null || child == null) return false
    // @fidm checkSignature returns null on success, an Error on failure.
    return parent.checkSignature(child) === null
  } catch {
    return false
  }
}

/**
 * Converts a DER encoded certificate to a PEM encoded certificate.
 */
export function DERtoPEM (der: Uint8Array): string {
  const PEM_HEADER = '-----BEGIN CERTIFICATE-----\n'
  const PEM_FOOTER = '\n-----END CERTIFICATE-----'
  const base64String = Buffer.from(der).toString('base64')
  const formattedBase64 = base64String.match(/.{1,64}/g)?.join('\n')
  return PEM_HEADER + formattedBase64 + PEM_FOOTER
}

/**
 * Converts a PEM encoded certificate to a DER encoded certificate.
 */
export function PEMtoDER (pem: string): Uint8Array {
  const base64String = pem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\r?\n|\r/g, '')
  return Buffer.from(base64String, 'base64')
}

/*
  The x509 lib uses getters to return cert properties that are stripped during serialization.
  This function extracts the properties that are needed for display
*/
function parseCertificate (cert: Certificate): CertificateInfo {
  return {
    issuer: getDistinguishedName(cert.issuer),
    subject: getDistinguishedName(cert.subject),
    validFrom: localDateTime(cert.validFrom.toString()),
    validTo: localDateTime(cert.validTo.toString()),
    isCA: cert.isCA
  }
}

function getDistinguishedName (dn: x509DistinguishedName): DistinguishedName {
  const getShortName = (shortName: string): string => {
    const attr = dn.attributes.find((attr) => attr.shortName === shortName)
    return attr?.value ?? ''
  }
  return {
    CN: getShortName('CN'),
    O: getShortName('O'),
    OU: getShortName('OU'),
    C: getShortName('C'),
    L: getShortName('L'),
    ST: getShortName('ST')
  }
}

export function distinguishedNameToString (dn: DistinguishedName): string {
  // combine the non-empty DN fields
  return [dn.CN, dn.O, dn.OU, dn.C, dn.L, dn.ST].filter((field) => field != null && field.length > 0).join(', ')
}

export function localDateTime (isoDateString: string): string {
  const date = new Date(isoDateString)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    // hour: 'numeric',
    // minute: 'numeric',
    // second: 'numeric',
    // timeZoneName: 'short',
    hour12: true
  }
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date)
  return formattedDate
}
