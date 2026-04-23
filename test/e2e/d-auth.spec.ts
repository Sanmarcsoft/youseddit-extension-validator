import { test, expect, Page } from './extension-fixture';

test.describe('Feature D: Verifieddit Login Integration', () => {
  test('should display "Sign in with Verifieddit" button in Options tab and navigate to login endpoint', async ({
    context,
  }) => {
    // Open extension popup
    const popupPage = await context.newPage();

    let actualExtId = '';

    try {
      // Try generic extension URL first
      const response = await popupPage.goto('chrome-extension://*/popup.html', {
        waitUntil: 'domcontentloaded',
      });

      if (!response?.ok()) {
        throw new Error('Wildcard URL failed');
      }
    } catch (e) {
      // Fallback: get actual extension ID from chrome://extensions
      const extPage = await context.newPage();
      await extPage.goto('chrome://extensions/');

      actualExtId = await extPage.evaluate(() => {
        // Look for extension item in DOM
        const item = document.querySelector('[data-id]');
        const id = item?.getAttribute('data-id');
        return id || '';
      });

      await extPage.close();

      if (!actualExtId) {
        throw new Error('Could not determine extension ID from chrome://extensions');
      }

      await popupPage.goto(`chrome-extension://${actualExtId}/popup.html`, {
        waitUntil: 'domcontentloaded',
      });
    }

    // Navigate to popup if not already there
    if (!popupPage.url().includes('popup.html')) {
      const extPage = await context.newPage();
      await extPage.goto('chrome://extensions/');

      actualExtId = await extPage.evaluate(() => {
        const item = document.querySelector('[data-id]');
        return item?.getAttribute('data-id') || '';
      });

      await extPage.close();

      if (actualExtId) {
        await popupPage.goto(`chrome-extension://${actualExtId}/popup.html`, {
          waitUntil: 'domcontentloaded',
        });
      }
    }

    // Click on Options/Settings tab
    const optionsTabSelector = '[data-tab="options"], [role="tab"][aria-label*="Options"], [role="tab"][aria-label*="Settings"], .tab-options, .tab-settings';
    const optionsTab = popupPage.locator(optionsTabSelector).first();

    // FAILING ASSERTION: Options tab should exist
    await expect(optionsTab).toBeVisible({ timeout: 2000 });
    await optionsTab.click();

    // Give UI time to render Options content
    await popupPage.waitForTimeout(500);

    // Look for "Sign in with Verifieddit" button
    const signInButtonSelector = '[data-test="verifieddit-signin"], [aria-label*="Sign in"], button:has-text("Sign in"), button:text("Sign in with Verifieddit"), .btn-verifieddit-signin';
    const signInButton = popupPage.locator(
      'button:text("Sign in with Verifieddit"), button:text("Sign in"), [data-auth="verifieddit"]'
    ).first();

    // FAILING ASSERTION: Sign in button should be visible in Options
    await expect(signInButton).toBeVisible({ timeout: 2000 });

    // Set up listener for new page (tab) opening
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      signInButton.click(),
    ]);

    // Give the new tab time to load
    await newPage.waitForLoadState('load').catch(() => {
      // It's OK if page doesn't fully load (e.g., if it's the auth endpoint)
    });

    const newPageUrl = newPage.url();

    // FAILING ASSERTION: Should navigate to Verifieddit login
    expect(newPageUrl).toMatch(/verifieddit\.com.*login/i);

    // FAILING ASSERTION: Should include extension callback parameter
    expect(newPageUrl).toMatch(/extension-callback/i);

    // Verify the callback includes the extension ID
    if (actualExtId) {
      expect(newPageUrl).toContain(actualExtId);
    }

    await newPage.close();
    await popupPage.close();
  });
});
