import { test, expect } from './extension-fixture';

test.describe('Feature B: Popup Display & Validation Entries', () => {
  test('should display validation entries in popup grid and open ingredient overlay on click', async ({
    context,
  }) => {
    // First, navigate to demo corpus to trigger validations
    const corpusPage = await context.newPage();
    await corpusPage.goto('http://localhost:3000/demo-corpus/', {
      waitUntil: 'networkidle',
    });

    // Wait for extension to process images
    await corpusPage.waitForTimeout(3000);

    // Now open extension popup
    const popupUrl = 'chrome-extension://*/popup.html';
    const popupPage = await context.newPage();

    // Try to navigate to popup (extension ID may vary, use wildcard)
    try {
      await popupPage.goto(popupUrl, {
        waitUntil: 'domcontentloaded',
      });
    } catch (e) {
      // If wildcard fails, get the actual extension ID from chrome://extensions
      const extPage = await context.newPage();
      await extPage.goto('chrome://extensions/');

      const actualExtId = await extPage.evaluate(() => {
        // Extract from the first extension's details panel URL
        const url = new URL(window.location.href);
        // Fallback: try to find from DOM
        const item = document.querySelector('[data-id]');
        return item?.getAttribute('data-id') || 'unknown';
      });

      await extPage.close();

      if (actualExtId !== 'unknown') {
        await popupPage.goto(`chrome-extension://${actualExtId}/popup.html`, {
          waitUntil: 'domcontentloaded',
        });
      } else {
        // Skip if we can't find extension ID
        throw new Error('Could not determine extension ID for popup test');
      }
    }

    // Click on Validation tab
    const validationTabSelector = '[data-tab="validation"], [role="tab"][aria-label*="Validation"], .tab-validation';
    const validationTab = popupPage.locator(validationTabSelector).first();

    // FAILING ASSERTION: Tab should exist
    await expect(validationTab).toBeVisible({ timeout: 2000 });
    await validationTab.click();

    // Give UI time to render
    await popupPage.waitForTimeout(500);

    // Query for validation entries grid
    const entriesSelector = '#validationEntries, [data-test="validation-entries"], .validation-grid';
    const entriesContainer = popupPage.locator(entriesSelector).first();

    // FAILING ASSERTION: Entries container should be visible
    await expect(entriesContainer).toBeVisible({ timeout: 2000 });

    // Count entries
    const entryElements = await popupPage.locator(
      `${entriesSelector} > *, ${entriesSelector} [data-entry]`
    ).count();

    // FAILING ASSERTION: At least 3 entries expected (from corpus)
    expect(entryElements).toBeGreaterThanOrEqual(3);

    // Click first entry to open overlay
    const firstEntry = popupPage
      .locator(`${entriesSelector} > *`)
      .first();

    // FAILING ASSERTION: First entry should be clickable
    await expect(firstEntry).toBeVisible();
    await firstEntry.click();

    // Wait for overlay/iframe to open
    await popupPage.waitForTimeout(1000);

    // Check for ingredient thumbnails in overlay
    const ingredientThumbSelector = '[data-ingredient], .ingredient-thumb, img[alt*="ingredient"]';
    const ingredientThumbs = popupPage.locator(ingredientThumbSelector);

    // FAILING ASSERTION: Overlay should have at least one ingredient thumbnail
    const thumbCount = await ingredientThumbs.count();
    expect(thumbCount).toBeGreaterThan(0);

    await corpusPage.close();
    await popupPage.close();
  });
});
