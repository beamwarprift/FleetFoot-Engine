import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { cataloguesPlugin } from './scripts/catalogues.ts';

// Integration tests run in real browsers. CI runs both; an environment that cannot install one
// narrows the list with FFE_TEST_BROWSERS, and the narrowed run is reported as such.
const browsers = (process.env['FFE_TEST_BROWSERS'] ?? 'chromium,firefox')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name === 'chromium' || name === 'firefox');
const chromiumPath = process.env['FFE_CHROMIUM_PATH'];
// The catalogue modules the build makes, made the same way for the tests.
const plugins = [cataloguesPlugin(import.meta.dirname)];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            // A desktop window: the selection logic compares visible areas.
            viewport: { width: 1280, height: 900 },
            instances: browsers.map((browser) => ({
              browser,
              provider: playwright(
                browser === 'chromium' && chromiumPath !== undefined
                  ? { launchOptions: { executablePath: chromiumPath } }
                  : {},
              ),
            })),
          },
        },
      },
      {
        // A phone: narrow, touch, a coarse pointer. Playwright emulates a phone only in Chromium,
        // so this project runs there; the product code reads capabilities, never the browser.
        plugins,
        test: {
          name: 'phone',
          include: ['tests/phone/**/*.test.ts'],
          browser: {
            enabled: browsers.includes('chromium'),
            headless: true,
            screenshotFailures: false,
            viewport: { width: 360, height: 780 },
            instances: [
              {
                browser: 'chromium',
                provider: playwright({
                  contextOptions: { isMobile: true, hasTouch: true },
                  ...(chromiumPath === undefined
                    ? {}
                    : { launchOptions: { executablePath: chromiumPath } }),
                }),
              },
            ],
          },
        },
      },
    ],
  },
});
