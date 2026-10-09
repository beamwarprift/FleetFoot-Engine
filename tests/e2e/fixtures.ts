// Shared E2E fixtures: Chromium with an extension build loaded (production unless a test asks for
// the E2E build), and the local server of `server.ts`.

import { join } from 'node:path';
import {
  type BrowserContext,
  test as base,
  chromium,
  type LaunchOptions,
  type Worker,
} from '@playwright/test';
import { type LocalServer, startServer } from './server.ts';

const ROOT = join(import.meta.dirname, '../..');
const EXTENSION_DIR = join(ROOT, '.output/chrome-mv3');
/** The production build plus host access to 127.0.0.1 only (`pnpm build:e2e`). */
export const E2E_EXTENSION_DIR = join(ROOT, '.output-e2e/chrome-mv3');
export const PRODUCTION_DIR = EXTENSION_DIR;

/**
 * How every E2E Chromium starts with an extension: the full browser (`channel`), which loads
 * extensions where the headless shell does not; Chromium by default, FFE_E2E_CHANNEL=msedge runs
 * the same build in Edge (`pnpm test:edge`).
 */
export function chromiumWithExtension(extensionDir: string): LaunchOptions {
  const executablePath = process.env['FFE_CHROMIUM_PATH'];
  const channel = process.env['FFE_E2E_CHANNEL'] ?? 'chromium';
  return {
    channel,
    ...(executablePath === undefined || channel !== 'chromium' ? {} : { executablePath }),
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      // Branded builds ignore --load-extension unless this feature is turned off.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      // localhost is the same local server under another origin, one the extension is not given.
      '--host-resolver-rules=MAP localhost 127.0.0.1',
    ],
  };
}

export const test = base.extend<{
  /** The unpacked extension the context loads. */
  extensionDir: string;
  context: BrowserContext;
  background: Worker;
  local: LocalServer;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
  local: async ({}, use) => {
    const { server, local } = await startServer();
    await use(local);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  },
  extensionDir: [EXTENSION_DIR, { option: true }],
  context: async ({ extensionDir }, use) => {
    const context = await chromium.launchPersistentContext('', chromiumWithExtension(extensionDir));
    await use(context);
    await context.close();
  },
  background: async ({ context }, use) => {
    const worker =
      context.serviceWorkers().find((sw) => sw.url().startsWith('chrome-extension://')) ??
      (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
});

export const expect = test.expect;
