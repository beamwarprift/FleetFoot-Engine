import { defineConfig } from 'wxt';
import { ALL_SITES } from './src/core/settings/Access.ts';
import { actionMessageName, BROWSER_COMMAND_ACTIONS } from './src/core/settings/Shortcuts.ts';

// Every value below is audited against config/manifest-policy.json by `pnpm audit:manifest`.
// Changing a permission here without updating the policy (and docs/PERMISSIONS.md) fails CI.

// Extension pages (background, popup, options) may not open any network connection.
// Content scripts run under the page CSP instead: the bundle scan and the E2E tests cover them.
const EXTENSION_PAGES_CSP =
  "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";

// Stable Firefox add-on ID: immutable once published on AMO.
const GECKO_ID = 'fleetfoot-engine@ffe';

// The end-to-end build only (`pnpm build:e2e`): the production manifest plus host access to the
// local test server, written to its own folder. The production build never sees the flag, and the
// E2E suite checks that this is the only difference.
const E2E_BUILD = process.env['FFE_E2E_BUILD'] === '1';
const E2E_HOST = 'http://127.0.0.1/*';

export default defineConfig({
  manifestVersion: 3,
  ...(E2E_BUILD ? { outDir: '.output-e2e' } : {}),
  // Explicit imports only: every dependency of a module is visible in its source.
  imports: false,
  manifest: ({ browser }) => ({
    name: 'FleetFoot Engine',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    // No suggested keys: the user assigns them in the browser (checked by audit:manifest).
    commands: Object.fromEntries(
      BROWSER_COMMAND_ACTIONS.map((action) => [
        action,
        { description: `__MSG_${actionMessageName(action)}__` },
      ]),
    ),
    permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
    optional_host_permissions: [...ALL_SITES],
    ...(E2E_BUILD ? { host_permissions: [E2E_HOST] } : {}),
    content_security_policy: {
      extension_pages: EXTENSION_PAGES_CSP,
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              strict_min_version: '142.0',
              data_collection_permissions: { required: ['none'] },
            },
            // Same floor as desktop: data_collection_permissions needs 142 on both.
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
  // The release records (scripts/release.ts) are written after the source archive is made, so they
  // stay out of it: otherwise recording a release would change the archive it records.
  zip: { excludeSources: ['releases/**'] },
  vite: () => ({
    build: {
      // The modulepreload polyfill ships a fetch() call into extension pages.
      modulePreload: { polyfill: false },
    },
  }),
});
