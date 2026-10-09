// What the overlay shows: a toolbar with the drag handle, slower, the speed, faster and 1×, and
// behind «more» seeking and Picture-in-Picture. Styled inline from a palette, since the page's
// styles must not reach it.

import { type Command, type EngineState, makeCommand } from '../../core/messages/Protocol.ts';
import type { Settings } from '../../core/settings/Settings.ts';
import { h, setAttr, setDisabled, setHidden, setText } from '../../ui/dom.ts';
import { formatRate } from '../../ui/format.ts';
import type { Localization } from '../../ui/i18n.ts';
import { seekLabels } from '../../ui/seekLabels.ts';
import {
  applyStyle,
  bar,
  button,
  focusRing,
  NO_FOCUS_RING,
  type Palette,
  rateText,
} from './styles.ts';

export interface OverlayBarActions {
  step(direction: 1 | -1): void;
  seek(direction: 1 | -1): void;
  send(command: Command): void;
  startDrag(event: PointerEvent, handle: HTMLElement): void;
  keyMove(event: KeyboardEvent): void;
  /** The extra controls opened or closed: the overlay's size changed. */
  resized(): void;
}

export function overlayBar(document: Document, l10n: Localization, actions: OverlayBarActions) {
  const { t, locale } = l10n;
  const buttons: HTMLButtonElement[] = [];
  const control = (label: string, name: string, onClick: () => void): HTMLButtonElement => {
    const element = h(document, 'button', {
      text: label,
      attrs: { type: 'button', 'aria-label': name, title: name },
      on: { click: onClick },
    });
    buttons.push(element);
    return element;
  };
  const send = (command: Command) => () => actions.send(command);

  const handle = control('⠿', t('overlayMove'), () => {});
  handle.addEventListener('pointerdown', (event) =>
    actions.startDrag(event as PointerEvent, handle),
  );
  handle.addEventListener('keydown', (event) => actions.keyMove(event as KeyboardEvent));
  const rate = h(document, 'span');
  const seekBack = control('«', t('seekBack', '…'), () => actions.seek(-1));
  const seekForward = control('»', t('seekForward', '…'), () => actions.seek(1));
  const pip = control('⧉', t('pipEnter'), send(makeCommand('pip-toggle', {})));
  // Seeking follows time, not writing: left to right in every language.
  const extra = h(document, 'span', { attrs: { dir: 'ltr' } }, [seekBack, seekForward, pip]);
  // Closed at first: «more» opens it.
  extra.hidden = true;
  const more = control('⋯', t('overlayMore'), () => {
    const expanded = extra.hidden;
    setHidden(extra, !expanded);
    setAttr(more, 'aria-expanded', String(expanded));
    setAttr(more, 'aria-label', expanded ? t('overlayLess') : t('overlayMore'));
    actions.resized();
  });
  setAttr(more, 'aria-expanded', 'false');
  const element = h(
    document,
    'div',
    {
      // The extension's language and direction, not the page's.
      attrs: { role: 'toolbar', 'aria-label': t('overlayLabel'), lang: locale, dir: l10n.dir },
    },
    [
      handle,
      control('−', t('slower'), () => actions.step(-1)),
      rate,
      control('+', t('faster'), () => actions.step(1)),
      control('1×', t('resetTo', formatRate(1, locale)), send(makeCommand('reset-rate', {}))),
      more,
      extra,
    ],
  );

  return {
    element,
    render(state: EngineState, settings: Settings): void {
      setText(rate, state.rate === null ? '' : formatRate(state.rate, locale));
      const names = seekLabels(l10n, settings.seekStep);
      setAttr(seekBack, 'aria-label', names.back);
      setAttr(seekForward, 'aria-label', names.forward);
      setDisabled(seekBack, !state.seekable);
      setDisabled(seekForward, !state.seekable);
      setHidden(pip, !state.pip.available && !state.pip.active);
      setAttr(pip, 'aria-label', state.pip.active ? t('pipExit') : t('pipEnter'));
    },
    /** Colours from the palette; controls sized for a finger where the pointer is coarse. */
    paint(palette: Palette, coarse: boolean): void {
      applyStyle(element, bar(palette));
      applyStyle(rate, rateText(palette));
      for (const target of buttons) {
        applyStyle(target, button(palette, coarse));
        target.onfocus = () =>
          applyStyle(target, target.matches(':focus-visible') ? focusRing(palette) : NO_FOCUS_RING);
        target.onblur = () => applyStyle(target, NO_FOCUS_RING);
      }
    },
  };
}
