# E2E Testing — TDD RED-First Pass

This directory contains end-to-end (E2E) test suites for the Verifieddit Extension, using **Playwright** to test the fully-built Chrome extension against a live test corpus.

## TDD Contract: RED → GREEN → REFACTOR

**THIS REPOSITORY PRACTICES TEST-DRIVEN DEVELOPMENT (TDD).** The tests in this directory are currently **FAILING** (RED state) by design.

The workflow is:

1. **RED PHASE** (this commit): Write failing tests that describe desired behavior
2. **GREEN PHASE** (follow-up PR): Implement minimal source code changes to make tests pass
3. **REFACTOR PHASE** (optional follow-up): Clean up code and improve design

**Do NOT skip or stub the failing tests.** Do NOT modify these tests to make them pass without implementing the corresponding feature. Failing tests are the specification.

## Running Tests Locally

### Prerequisites

- Node.js 18+ with npm
- A built extension in `dist/chrome/` (run `npm run build` first)
- Playwright browsers installed (auto-installed on first run)

### Build & Test

```bash
# 1. Install dependencies
npm ci

# 2. Build the extension
npm run build

# 3. Install Playwright browsers (one-time)
npx playwright install chromium

# 4. Run all E2E tests
npx playwright test

# 5. View test report (after run completes)
npx playwright show-report
```

### Run Single Test File

```bash
# Test Feature A only (icon verification)
npx playwright test a-verify.spec.ts

# Test Feature B only (popup display)
npx playwright test b-popup-display.spec.ts

# Test Feature C only (history persistence)
npx playwright test c-history.spec.ts

# Test Feature D only (auth integration)
npx playwright test d-auth.spec.ts
```

### Debug Mode

```bash
# Run with interactive Playwright Inspector
npm run test:debug

# Or with a specific test file
npx playwright test --debug a-verify.spec.ts
```

## Test Fixtures & Demo Corpus

All tests use the **demo corpus** — a collection of 7 test images with various C2PA credential states:

- **01-greentrust-jpeg.jpg** — Valid C2PA, trusted signer (green)
- **02-greentrust-png.png** — Valid C2PA, trusted signer (green)
- **03-greentrust-webp.webp** — Valid C2PA, trusted signer (green)
- **04-warning-untrusted-signer.jpg** — C2PA present, untrusted signer (warning)
- **05-error-tampered-pixels.jpg** — C2PA indicates tampering (error)
- **06-no-c2pa-plain-jpeg.jpg** — No C2PA metadata (neutral)
- **07-edge-realworld-cbc-signed.jpg** — Real-world complex manifest

These are served at `http://localhost:3000/demo-corpus/` during test runs via the **Playwright webServer block** in `playwright.config.ts`.

## Test Structure

### File: `extension-fixture.ts`

Custom Playwright fixture that handles loading the extension via `chromium.launchPersistentContext` with:
- `--load-extension=dist/chrome`
- `--disable-extensions-except=dist/chrome`

This ensures the built extension is loaded into the test browser context.

### File: `a-verify.spec.ts` — Feature A: Icon Verification

**Spec:** Icons (cr + G) should render on images with green-trust C2PA credentials within 5 seconds.

**Current Status:** FAILING ❌ — No icons rendered on rc5

**Expected Behavior:**
- Navigate to demo corpus
- Extension scans visible images
- Images 01, 02, 03 (green-trust) get visual overlays
- No `SecurityError: Failed to construct 'Worker'` in console

**Failure Mode:** Icons not appearing; console errors for Worker construction.

### File: `b-popup-display.spec.ts` — Feature B: Popup & Validation Entries

**Spec:** Extension popup should display validation entries in a grid; clicking an entry opens an overlay with ingredient thumbnails.

**Current Status:** FAILING ❌ — Popup grid not populated

**Expected Behavior:**
- Navigate to demo corpus
- Open extension popup → click Validation tab
- `#validationEntries` grid shows ≥3 items
- Click first entry → overlay opens
- Overlay displays ingredient thumbnails

**Failure Mode:** Grid is empty or missing; overlay doesn't open.

### File: `c-history.spec.ts` — Feature C: History Persistence

**Spec:** Validation results should persist in extension storage; navigating away and back should NOT re-scan images.

**Current Status:** FAILING ❌ — History not persisted

**Expected Behavior:**
- Scan images on demo corpus → validations stored
- Navigate to different page → close tab → return
- Open popup → prior validation entries still visible
- No new WASM invocations on second visit (verified via timestamp check)

**Failure Mode:** History lost on navigation; images re-scanned on return visit.

### File: `d-auth.spec.ts` — Feature D: Verifieddit Login

**Spec:** Extension Options tab should have a "Sign in with Verifieddit" button that navigates to `https://www.verifieddit.com/login?extension-callback=...`

**Current Status:** FAILING ❌ — No auth button exists

**Expected Behavior:**
- Open extension popup → click Options tab
- "Sign in with Verifieddit" button visible
- Click → new tab opens to `verifieddit.com/login?extension-callback=...`
- Callback includes extension ID

**Failure Mode:** Button not found; navigation URL incorrect.

## CI Integration

All E2E tests run in GitHub Actions on every PR to `main` via `.github/workflows/e2e.yml`:

1. Installs dependencies: `npm ci`
2. Builds extension: `npm run build`
3. Installs Playwright: `npx playwright install chromium`
4. Runs tests: `npx playwright test`
5. Uploads report on failure

**Expected Result on this PR:** All 4 tests FAIL (RED state)

**Expected Result on follow-up PRs:** Tests pass one-by-one as features are implemented

## Diagnosing Test Failures

### Test fails with "Extension not found"
- Ensure `npm run build` completed without errors
- Check that `dist/chrome/` directory exists and contains `manifest.json`

### Test hangs on popup navigation
- The extension ID discovery may timeout. Check the actual ID in `chrome://extensions` and update the test URL manually.

### "Worker construction" errors in test A
- This is the expected security issue being tested. The fix should silence these by properly initializing Web Workers in a service worker context.

### Images not loading (404 errors)
- Verify the `test/e2e/fixtures/` directory contains all 7 demo corpus images
- Check that `npm run serve:fixtures` is running (Playwright starts it automatically)

## Next Steps

Once this PR is approved:

1. **#50.1 (Feature A):** Implement icon rendering for green-trust images
2. **#50.2 (Feature B):** Populate validation grid and ingredient overlay
3. **#50.3 (Feature C):** Implement history persistence to Chrome storage
4. **#50.4 (Feature D):** Add Verifieddit login button and authentication flow

Each follow-up PR will fix ONE feature's failing tests and may add additional coverage.

## Playwright Configuration

See `playwright.config.ts` for details:
- Tests run in headless mode by default (set `headless: false` for debugging)
- Screenshots/videos captured on failure
- Reports generated in `test/e2e/results/`
- Demo corpus server starts automatically

## Troubleshooting

### Port 3000 already in use
```bash
# Kill existing process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Extension crashes on startup
- Check for TypeScript compilation errors: `npx tsc --noEmit`
- Check console output for import/module errors
- Ensure all dependencies are installed: `npm ci`

### Tests timeout waiting for extension
- The extension may be slow to initialize in headless mode
- Try running with `headless: false` in `playwright.config.ts` for debugging
- Check background service worker logs via `chrome://extensions` (enable Developer mode)

## Questions?

Refer to:
- Playwright docs: https://playwright.dev
- Chrome Extension API: https://developer.chrome.com/docs/extensions
- C2PA Toolkit: https://github.com/contentauth/c2patool
