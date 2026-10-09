import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJson } from '../../scripts/audit/json.ts';
import { parseManifestPolicy } from '../../scripts/audit/manifest.ts';
import { expect, test } from './fixtures.ts';

// Evaluated callbacks run inside the extension service worker. This declares only the slice of the
// extension API they use, so Node-side type checking stays honest about that boundary.
declare const chrome: {
  runtime: { getManifest(): { permissions?: string[] } };
};

const POLICY_PATH = join(import.meta.dirname, '../../config/manifest-policy.json');
const policy = parseManifestPolicy(
  parseJson(readFileSync(POLICY_PATH, 'utf8'), POLICY_PATH),
  POLICY_PATH,
);

test('the extension loads and its service worker starts', async ({ background }) => {
  expect(background.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  const permissions = await background.evaluate(
    () => chrome.runtime.getManifest().permissions ?? [],
  );
  expect([...permissions].sort()).toEqual([...policy.permissions].sort());
});

test('the CSP blocks network calls from the background', async ({ background, local }) => {
  const canary = `${local.origin}/canary`;
  const outcome = await background.evaluate(async (url) => {
    try {
      // biome-ignore lint/style/noRestrictedGlobals: deliberate violation, the CSP must block it.
      await fetch(url);
      return 'reached';
    } catch {
      return 'blocked';
    }
  }, canary);
  expect(outcome).toBe('blocked');
  // The hit count is the proof: without the CSP the request still leaves and is rejected later by CORS.
  expect(local.hits).not.toContain('/canary');
});

test('browsing a page with the extension loaded makes no extension request', async ({
  context,
  background,
  local,
}) => {
  // `new URL(…).origin` is "null" for the extension scheme in Node: the base comes from the URL.
  const extensionOrigin = background.url().slice(0, background.url().lastIndexOf('/'));
  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));

  const page = await context.newPage();
  await page.goto(`${local.origin}/blank.html`);
  await expect(page.locator('p')).toHaveText('Local fixture page. No media, no network.');

  // The recorder sees page traffic: the fixture request proves it is listening.
  expect(requests).toContain(`${local.origin}/blank.html`);
  const unexpected = requests.filter(
    (url) => !url.startsWith(`${local.origin}/`) && !url.startsWith(`${extensionOrigin}/`),
  );
  expect(unexpected).toEqual([]);
  expect(local.hits.filter((hit) => hit !== '/blank.html' && hit !== '/favicon.ico')).toEqual([]);
});
