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

    // Get extension ID by naviging to extension URL
    const page = await context.newPage();
    await page.goto('chrome://extensions/');

    // Extract extension ID from DOM or use a known pattern
    // The extension ID will be visible in the title or URL after load
    let extensionId = '';

    try {
      // Wait for the extension to load and try common patterns
      await page.waitForTimeout(2000);

      // Try to get extension details via chrome.management API
      const extensions = await page.evaluate(() => {
        return new Promise<string>((resolve) => {
          if (typeof (chrome as any) !== 'undefined' && (chrome as any).runtime) {
            (chrome as any).runtime.sendMessage(
              { type: 'GET_EXTENSION_ID' },
              (response: any) => {
                if (response?.extensionId) {
                  resolve(response.extensionId);
                } else {
                  resolve('');
                }
              }
            );
          } else {
            resolve('');
          }
        });
      });

      if (extensions) {
        extensionId = extensions;
      }
    } catch (e) {
      // Extension ID discovery failed, but we can still use empty for relative URLs
      console.warn('Could not auto-detect extension ID, will use chrome-extension:// URLs with wildcards');
    }

    await page.close();

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // Default to a discoverable ID or pattern
    const extensionId = 'unknown';
    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
