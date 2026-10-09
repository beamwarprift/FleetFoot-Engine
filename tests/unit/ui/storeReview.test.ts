// The review page of the store the extension was installed from, recognised by the update address
// that store writes into the installed manifest, and nothing for any other install.

import { describe, expect, it } from 'vitest';
import { storeReviewUrl } from '../../../src/ui/storeReview.ts';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('the store review page', () => {
  it('is the Chrome Web Store page of this ID for a Chrome Web Store install', () => {
    expect(storeReviewUrl('https://clients2.google.com/service/update2/crx', ID)).toBe(
      `https://chromewebstore.google.com/detail/${ID}`,
    );
  });

  it('is the Edge Add-ons page of this ID for an Edge Add-ons install', () => {
    expect(storeReviewUrl('https://edge.microsoft.com/extensionwebstorebase/v1/crx', ID)).toBe(
      `https://microsoftedge.microsoft.com/addons/detail/${ID}`,
    );
  });

  it.each([
    ['no update address (unpacked, or a store that writes none)', undefined],
    ['an update address that is not text', 42],
    ['an update address that is not an address', 'not a url'],
    ['an empty update address', ''],
    ['an unknown store', 'https://updates.example.com/crx'],
    ['a look-alike host', 'https://clients2.google.com.example.com/service/update2/crx'],
    ['a known host under plain http', 'http://clients2.google.com/service/update2/crx'],
    ['a known host on another port', 'https://clients2.google.com:8443/service/update2/crx'],
  ])('is none for %s', (_case, updateUrl) => {
    expect(storeReviewUrl(updateUrl, ID)).toBeUndefined();
  });

  it.each([
    ['empty', ''],
    ['too short', 'abcdefghijklmnop'],
    ['outside a to p', 'qbcdefghijklmnopabcdefghijklmnop'],
    ['an add-on address of another kind', 'fleetfoot-engine@ffe'],
    ['a path', `../${ID}`],
  ])('is none for an extension ID that is %s', (_case, id) => {
    expect(storeReviewUrl('https://clients2.google.com/service/update2/crx', id)).toBeUndefined();
  });
});
