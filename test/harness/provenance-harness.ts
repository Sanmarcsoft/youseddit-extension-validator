/*
 * Rendering harness for <c2pa-provenance-graph>.
 *
 * Playwright's extension suite needs a headed Chromium with the full GTK/X
 * stack, which the dev container does not have. This harness mounts the real
 * diagram component against the same synthetic manifest stores the unit tests
 * use, so the rendering path can be exercised in a real browser (via the
 * Interceptor workflow) without loading the whole extension.
 *
 * Build:  bun build test/harness/provenance-harness.ts --outfile <dir>/harness.js
 * Serve:  any static server; open harness.html and screenshot.
 */

import '../../src/provenanceDiagram'
import { buildProvenanceGraph } from '../../src/provenanceGraph'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 3-generation chain + assertions, mirroring the shared test fixture. */
const multiGenStore: any = {
  active_manifest: 'urn:active',
  manifests: {
    'urn:active': {
      label: 'urn:active',
      title: 'final.jpg',
      format: 'image/jpeg',
      claim_generator: 'Adobe Photoshop 25.0 c2pa-rs/0.49.2',
      claim_generator_info: [{ name: 'Adobe Photoshop', version: '25.0' }],
      signature_info: { issuer: 'Trusteddit-Journalist-Issuer-CA', alg: 'Es256', time: '2026-03-07T08:57:18Z' },
      assertions: [
        { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.edited', softwareAgent: 'Photoshop' }] } },
        { label: 'stds.schema-org.CreativeWork', data: { author: [{ name: 'M' }] } },
        {
          label: 'com.phenom.sensor.telemetry',
          data: {
            gyroscope: { x: 0.01, y: -0.2, z: 9.8 },
            gps: { lat: 48.2082, lon: 16.3738, accuracyM: 4.5 },
            captureDevice: 'Pixel 9 Pro'
          }
        }
      ],
      ingredients: [
        {
          title: 'edited.jpg',
          format: 'image/jpeg',
          relationship: 'parentOf',
          active_manifest: 'urn:parent',
          instance_id: 'xmp:iid:1'
        },
        {
          title: 'overlay.png',
          format: 'image/png',
          relationship: 'componentOf',
          instance_id: 'xmp:iid:2',
          validation_results: { activeManifest: { failure: [{ code: 'assertion.dataHash.mismatch', explanation: 'Pixel data does not match the signed hash' }] } }
        }
      ]
    },
    'urn:parent': {
      label: 'urn:parent',
      title: 'edited.jpg',
      format: 'image/jpeg',
      claim_generator: 'Lightroom 7 c2pa-rs/0.49.2',
      signature_info: { issuer: 'Trusteddit-Journalist-Issuer-CA', alg: 'Es256', time: '2026-03-06T08:00:00Z' },
      assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.color_adjustments' }] } }],
      ingredients: [
        { title: 'IMG_0001.dng', format: 'image/x-adobe-dng', relationship: 'parentOf', instance_id: 'xmp:iid:0' }
      ]
    }
  }
}

const graph = buildProvenanceGraph(multiGenStore, 'final.jpg')
const el = document.createElement('c2pa-provenance-graph')
;(el as unknown as { graph: unknown }).graph = graph
document.getElementById('mount')?.appendChild(el)

// Expose for assertions driven from the browser console / interceptor eval.
;(window as unknown as Record<string, unknown>).__graph = graph
