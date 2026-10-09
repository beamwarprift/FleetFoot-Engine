// A message filling the popup in place of the controls: connecting, no media, a page that does
// not allow extensions, with a retry where it can help; and, when the player is in a frame from
// another site, that site by name with the access that would reach it.

import { h, setHidden, setText } from '../dom.ts';
import type { Localization, MessageKey } from '../i18n.ts';
import { button } from './buttons.ts';

export interface MessageActions {
  retry(): void;
  allowSite(site: string): void;
  allowAllSites(): void;
}

export function messagePanel(document: Document, l10n: Localization, actions: MessageActions) {
  const { t } = l10n;
  const title = h(document, 'p', { className: 'message-title' });
  const hint = h(document, 'p', { className: 'message-hint' });
  const retryButton = button(document, { text: t('retry'), onClick: () => actions.retry() });
  // The framed site the choices are for; a refusal is told until another site is shown.
  let framed: string | null = null;
  let declined = false;
  const allowSite = button(document, {
    className: 'accent',
    onClick: () => {
      if (framed !== null) actions.allowSite(framed);
    },
  });
  const allowAll = button(document, {
    text: t('framedAllowAll'),
    onClick: () => actions.allowAllSites(),
  });
  const choices = h(document, 'div', { className: 'message-actions' }, [allowSite, allowAll]);
  choices.hidden = true;
  const element = h(document, 'section', { className: 'message' }, [
    title,
    hint,
    retryButton,
    choices,
  ]);
  return {
    element,
    show(titleKey: MessageKey, hintKey: MessageKey | null, canRetry: boolean): void {
      framed = null;
      setText(title, t(titleKey));
      setText(hint, hintKey === null ? '' : t(hintKey));
      setHidden(hint, hintKey === null);
      setHidden(retryButton, !canRetry);
      setHidden(choices, true);
      setHidden(element, false);
    },
    /** The player may be in a frame from `site`: name it, and offer that site or every site. */
    showFramed(site: string): void {
      if (site !== framed) declined = false;
      framed = site;
      setText(title, t('framedTitle', site));
      setText(hint, t(declined ? 'accessDeclined' : 'framedHint'));
      setHidden(hint, false);
      setText(allowSite.querySelector('.text') ?? allowSite, t('framedAllowSite', site));
      setHidden(retryButton, true);
      setHidden(choices, false);
      setHidden(element, false);
    },
    /** The browser did not give the access asked for. */
    declined(): void {
      declined = true;
      setText(hint, t('accessDeclined'));
    },
    hide(): void {
      setHidden(element, true);
    },
  };
}
