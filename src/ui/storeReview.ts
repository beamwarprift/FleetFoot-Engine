// The review page of the store this install came from, opened by the heart in the popup: a plain
// link, opened only on the user's click, whose bases are listed in config/network-allowlist.json.

/**
 * Where a review is left, for the stores the extension can come from. A store is recognised by the
 * update address it writes into the manifest it installs (`update_url`), a datum the browser
 * hands over, never by the browser's name; its review page is the extension's own page there.
 * An install without such an address (unpacked, or a store not listed) has no review page.
 */
interface ReviewStore {
  readonly updateHost: string;
  readonly detailBase: string;
}

const REVIEW_STORES: readonly ReviewStore[] = [
  { updateHost: 'clients2.google.com', detailBase: 'https://chromewebstore.google.com/detail/' },
  {
    updateHost: 'edge.microsoft.com',
    detailBase: 'https://microsoftedge.microsoft.com/addons/detail/',
  },
];

/** A Chromium extension ID: 32 letters from a to p. */
const STORE_EXTENSION_ID = /^[a-p]{32}$/;

/** The store page for a review of this install, if it came from a known store. */
export function storeReviewUrl(updateUrl: unknown, extensionId: string): string | undefined {
  if (typeof updateUrl !== 'string' || !STORE_EXTENSION_ID.test(extensionId)) return undefined;
  let host: string;
  try {
    const url = new URL(updateUrl);
    if (url.protocol !== 'https:') return undefined;
    host = url.host;
  } catch {
    return undefined;
  }
  const store = REVIEW_STORES.find((candidate) => candidate.updateHost === host);
  return store === undefined ? undefined : new URL(extensionId, store.detailBase).href;
}
