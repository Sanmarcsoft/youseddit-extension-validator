import { test as base, Browser, BrowserContext, chromium } from '@playwright/test';
import path from 'path';

export type ExtensionTestContext = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionTestContext>({
  context: async ({ }, use) => {
    const extensionPath = path.resolve(
      __dirname,
      '../../dist/chrome'
    );

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
      ],
      ignoreHTTPSErrors: true,
    });

    await use(context);
    await context.close();
  },

  // Under MV3 the extension's identity is the host of its service-worker URL
  // (chrome-extension://<id>/background.js). Read it off the worker.
  //
  // The previous implementation opened chrome://extensions/ and called
  // `chrome.runtime.sendMessage` from the page world, where `chrome.runtime` is
  // not exposed to page scripts — so it always threw, the catch swallowed it,
  // and the fixture then handed every spec the literal string 'unknown'. That
  // is why b-popup-display and d-auth failed with "Could not determine
  // extension ID": a harness defect, not a product defect.
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }
    const extensionId = new URL(worker.url()).host;
    if (!extensionId) {
      throw new Error(`Could not derive extension ID from worker URL: ${worker.url()}`);
    }
    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
