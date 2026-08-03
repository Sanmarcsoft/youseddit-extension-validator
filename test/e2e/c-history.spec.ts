import { test, expect } from './extension-fixture';

test.describe('Feature C: Validation History Persistence', () => {
  // FIXME(#50): validation history is not persisted — there is no store for the
  // popup to re-read across tabs or navigations. This spec describes the feature
  // #50 is meant to build, not a regression. Unskip when that lands.
  test.fixme('should persist validation history across tabs and page navigations without re-scanning', async ({
    context,
  }) => {
    // First pass: validate images on corpus page
    const page1 = await context.newPage();
    await page1.goto('http://localhost:3000/demo-corpus/', {
      waitUntil: 'networkidle',
    });

    // Wait for extension to complete initial validation scan
    await page1.waitForTimeout(3000);

    // Capture initial validation count from extension storage
    const initialValidationCount = await page1.evaluate(() => {
      return new Promise<number>((resolve) => {
        if (typeof (chrome as any) !== 'undefined' && (chrome as any).storage) {
          (chrome as any).storage.local.get('validationHistory', (result: any) => {
            const count = result.validationHistory ? Object.keys(result.validationHistory).length : 0;
            resolve(count);
          });
        } else {
          resolve(0);
        }
      });
    });

    // FAILING ASSERTION: Should have recorded validations
    expect(initialValidationCount).toBeGreaterThanOrEqual(3);

    // Close the popup (if open)
    await page1.close();

    // Second step: open new tab and navigate away
    const page2 = await context.newPage();
    await page2.goto('https://example.com', {
      waitUntil: 'domcontentloaded',
    });
    await page2.close();

    // Third step: go back to corpus in a fresh tab
    const page3 = await context.newPage();
    await page3.goto('http://localhost:3000/demo-corpus/', {
      waitUntil: 'networkidle',
    });

    // Wait briefly (but NOT the full scanning duration)
    await page3.waitForTimeout(1000);

    // Check validation count again - should be same without re-scan
    const finalValidationCount = await page3.evaluate(() => {
      return new Promise<number>((resolve) => {
        if (typeof (chrome as any) !== 'undefined' && (chrome as any).storage) {
          (chrome as any).storage.local.get('validationHistory', (result: any) => {
            const count = result.validationHistory ? Object.keys(result.validationHistory).length : 0;
            resolve(count);
          });
        } else {
          resolve(0);
        }
      });
    });

    // FAILING ASSERTION: History should be preserved
    expect(finalValidationCount).toEqual(initialValidationCount);

    // Fourth step: open popup and verify prior entries still visible
    // (This confirms history was loaded from storage, not re-scanned)
    const popupPage = await context.newPage();

    try {
      await popupPage.goto('chrome-extension://*/popup.html', {
        waitUntil: 'domcontentloaded',
      });
    } catch (e) {
      // Retry with actual extension ID if needed
      const extPage = await context.newPage();
      await extPage.goto('chrome://extensions/');

      const actualExtId = await extPage.evaluate(() => {
        const item = document.querySelector('[data-id]');
        return item?.getAttribute('data-id') || 'unknown';
      });

      await extPage.close();

      if (actualExtId !== 'unknown') {
        await popupPage.goto(`chrome-extension://${actualExtId}/popup.html`, {
          waitUntil: 'domcontentloaded',
        });
      }
    }

    // Click history tab if available
    const historyTabSelector = '[data-tab="history"], [role="tab"][aria-label*="History"], .tab-history';
    const historyTab = popupPage.locator(historyTabSelector).first();

    // Try to find history entries
    const historyEntriesSelector = '#historyEntries, [data-test="history-entries"], .history-list';
    const historyEntries = popupPage.locator(historyEntriesSelector);

    // Check if tab exists and click it
    try {
      await expect(historyTab).toBeVisible({ timeout: 1000 });
      await historyTab.click();
      await popupPage.waitForTimeout(500);
    } catch {
      // Tab might not exist in current UI, skip
    }

    // FAILING ASSERTION: Prior entries should still be present (not re-scanned)
    const entriesCount = await historyEntries.count();
    expect(entriesCount).toBeGreaterThanOrEqual(initialValidationCount);

    // Fifth step: verify no new WASM invocations occurred
    // Check extension storage for timestamp of last validation per image
    const lastValidationTimes = await page3.evaluate(() => {
      return new Promise<Record<string, number>>((resolve) => {
        if (typeof (chrome as any) !== 'undefined' && (chrome as any).storage) {
          (chrome as any).storage.local.get('validationTimestamps', (result: any) => {
            resolve(result.validationTimestamps || {});
          });
        } else {
          resolve({});
        }
      });
    });

    // FAILING ASSERTION: Timestamps should not have been updated (no re-scan)
    // All timestamps should be from the initial scan (within a 3-second window)
    const timestampValues = Object.values(lastValidationTimes);
    const uniqueTimestamps = new Set(
      timestampValues.map((ts) => Math.floor(ts / 1000)) // Group by second
    );

    // Should have validations from only the initial scan, not the second visit
    expect(uniqueTimestamps.size).toBeLessThanOrEqual(2); // Allow 1-2 second range

    await page3.close();
    await popupPage.close();
  });
});
