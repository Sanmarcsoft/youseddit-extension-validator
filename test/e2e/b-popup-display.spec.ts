import { test, expect } from './extension-fixture';

test.describe('Feature B: Popup Display & Validation Entries', () => {
  // FIXME(#50): the popup is a LIVE feed — popup.ts appends an entry as each
  // validation message arrives and reads no persisted store. This spec scans the
  // corpus first and opens the popup afterwards, by which time every message has
  // already been delivered, so #validationEntries is legitimately empty. Unskip
  // when #50 lands per-page history that the popup can read back.
  test.fixme('should display validation entries in popup grid and open ingredient overlay on click', async ({
    context,
    extensionId,
  }) => {
    // #86 turned auto-scan OFF for fresh installs, so simply visiting the
    // corpus records nothing. This spec is about what the popup shows once
    // validations exist, so enable scanning before navigating.
    const sw = context.serviceWorkers()[0];
    if (sw != null) {
      await sw.evaluate(async () => { await chrome.storage.local.set({ autoScan: true }); });
    }

    // First, navigate to demo corpus to trigger validations
    const corpusPage = await context.newPage();
    await corpusPage.goto('http://localhost:3000/demo-corpus/', {
      waitUntil: 'networkidle',
    });

    // Wait for extension to process images
    await corpusPage.waitForTimeout(8000);

    // Now open extension popup. `chrome-extension://*/` is not a wildcard
    // Chrome resolves, and [data-id] on chrome://extensions sits in a closed
    // shadow root — the fixture derives the ID from the MV3 service worker.
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });

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
