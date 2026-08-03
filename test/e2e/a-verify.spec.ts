import { test, expect } from './extension-fixture';
import path from 'path';

test.describe('Feature A: C2PA Icon Verification', () => {
  // FIXME(#24): this spec queries `[data-c2pa-icon="true"][data-trust="green"]`,
  // but neither attribute is emitted anywhere in src/ — the badge observability
  // contract was never implemented, so the assertion cannot pass regardless of
  // scanning. It also waits passively for auto-scan, which #86 turned OFF by
  // default; auto-scan-default-off.spec.ts asserts the exact opposite on the
  // same page. Unskip when #24 lands the data-c2pa-status attribute.
  test.fixme('should render cr + G icons on three green-trust fixtures within 5s', async ({
    context,
  }) => {
    const page = await context.newPage();

    // Collect console logs from service worker and content scripts
    const consoleLogs: Array<{ source: string; message: string }> = [];

    page.on('console', (msg) => {
      consoleLogs.push({
        source: msg.location().url,
        message: msg.text(),
      });
    });

    // Navigate to the demo corpus
    await page.goto('http://localhost:3000/demo-corpus/', {
      waitUntil: 'networkidle',
    });

    // Wait for extension to complete scanning (max 5 seconds)
    const timeout = 5000;
    const startTime = Date.now();

    // Poll for the presence of verification icons on green-trust images
    let iconCount = 0;
    while (Date.now() - startTime < timeout) {
      // Look for extension-injected icons (cr + G) on images
      // The extension should add overlay elements with specific classes
      iconCount = await page.evaluate(() => {
        const icons = document.querySelectorAll('[data-c2pa-icon="true"][data-trust="green"]');
        return icons.length;
      });

      if (iconCount >= 3) {
        break;
      }

      await page.waitForTimeout(100);
    }

    // FAILING ASSERTION (RED): No icons present on rc5
    expect(iconCount).toBeGreaterThanOrEqual(3);

    // Also verify on specific image elements
    const greenTrustImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images
        .filter((img) => {
          const src = img.src || '';
          return (
            src.includes('01-greentrust-jpeg') ||
            src.includes('02-greentrust-png') ||
            src.includes('03-greentrust-webp')
          );
        })
        .map((img) => ({
          src: img.src,
          hasIcon: !!img.closest('[data-c2pa-icon]'),
          iconTrust: img.closest('[data-c2pa-icon]')?.getAttribute('data-trust'),
        }));
    });

    // FAILING ASSERTION: Expect all three to have icons with green trust
    expect(greenTrustImages).toHaveLength(3);
    greenTrustImages.forEach((img) => {
      expect(img.hasIcon).toBe(true);
      expect(img.iconTrust).toBe('green');
    });

    // SECURITY: Check for Worker construction errors
    const securityErrors = consoleLogs.filter((log) =>
      log.message.includes("SecurityError: Failed to construct 'Worker'")
    );

    // FAILING ASSERTION (SECURITY): Zero SecurityErrors expected
    expect(securityErrors).toHaveLength(0);

    await page.close();
  });
});
