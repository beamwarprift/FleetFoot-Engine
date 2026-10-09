// Last and quiet: one line, a question and a plain link. A notice takes its place while
// it shows: the height never grows, and no support is asked as something fails.

import type { EngineState } from '../../core/messages/Protocol.ts';
import { h, setText } from '../dom.ts';
import { formatQuantity } from '../format.ts';
import type { Localization } from '../i18n.ts';
import { externalLink, SUPPORT_URL } from '../links.ts';
import { NOTICE_PLACES, stateNotices } from '../notices.ts';
import { optionsPlaceHref } from '../optionsPlaces.ts';

/** Below an hour the total is too small to name next to a request for support. Chosen bound. */
const SAVED_INVITE_SECONDS = 3600;

export function bottomBar(document: Document, l10n: Localization) {
  const { t } = l10n;
  const invite = h(document, 'span', { className: 'muted', text: t('supportQuestion') });
  const notices = h(document, 'div', {
    className: 'notices',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const element = h(document, 'footer', { className: 'bottom' }, [
    notices,
    h(document, 'p', { className: 'invite' }, [
      invite,
      externalLink(document, t('supportDevelopment'), SUPPORT_URL, 'support'),
    ]),
  ]);
  return {
    element,
    /** From the first hour, the support line asks about the time saved. */
    showSaved(seconds: number): void {
      const hours = Math.floor(seconds / 3600);
      setText(
        invite,
        seconds < SAVED_INVITE_SECONDS
          ? t('supportQuestion')
          : t('supportSaved', formatQuantity(hours, 'hour', l10n.locale, 'short')),
      );
    },
    /** The state's notices, after the message about the last action if there is one. */
    renderNotices(state: EngineState, transient: string | null): void {
      const shown = stateNotices(state).map((key) => {
        const place = NOTICE_PLACES[key];
        return {
          text: t(key),
          link: place === undefined ? null : { text: t(place.label), place: place.place },
        };
      });
      if (transient !== null) shown.unshift({ text: transient, link: null });
      const key = shown.map(({ text, link }) => `${text}\n${link?.text ?? ''}`).join('\n');
      if (notices.dataset['shown'] === key) return;
      notices.dataset['shown'] = key;
      notices.replaceChildren(
        ...shown.map(({ text, link }) =>
          h(
            document,
            'p',
            {},
            link === null
              ? [text]
              : [
                  text,
                  ' ',
                  h(document, 'a', {
                    text: link.text,
                    attrs: { href: optionsPlaceHref(link.place), target: '_blank' },
                  }),
                ],
          ),
        ),
      );
    },
  };
}
