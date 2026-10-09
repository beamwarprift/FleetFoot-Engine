// The popup's top: the brand with the time saved under it, the way to leave a review in the store
// the extension came from, and the way to the options.

import { brandMark } from '../brand.ts';
import { h, setHidden, setText } from '../dom.ts';
import type { Localization } from '../i18n.ts';
import { icon } from '../icons.ts';
import { externalLink } from '../links.ts';
import { savedTimeText } from '../savedTime.ts';
import { button } from './buttons.ts';

export function topBar(
  document: Document,
  l10n: Localization,
  openOptions: () => void,
  reviewUrl: string | undefined,
) {
  const { t } = l10n;
  const saved = h(document, 'p', { className: 'saved muted' });
  saved.hidden = true;
  const element = h(document, 'header', { className: 'top' }, [
    h(document, 'div', { className: 'title' }, [brandMark(document, 'h1'), saved]),
    ...(reviewUrl === undefined ? [] : [reviewLink(document, t('reviewStore'), reviewUrl)]),
    button(document, {
      icon: 'settings',
      className: 'ghost',
      label: t('options'),
      onClick: openOptions,
    }),
  ]);
  return {
    element,
    /** The total under the brand, once there is at least a minute to show. */
    showSaved(seconds: number): void {
      setText(saved, t('savedPopup', savedTimeText(l10n, seconds)));
      setHidden(saved, seconds < 60);
    },
  };
}

/** The heart: a plain link to the store's page, opened only by the user's click. */
function reviewLink(document: Document, name: string, href: string): HTMLAnchorElement {
  const link = externalLink(document, '', href, 'ghost review');
  link.setAttribute('aria-label', name);
  link.setAttribute('title', name);
  link.append(icon(document, 'heart'));
  return link;
}
