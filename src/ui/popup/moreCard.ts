// The less used controls: the A–B loop with its help, and the natural voice switch.

import type { EngineState } from '../../core/messages/Protocol.ts';
import { h, setAttr, setDisabled, setHidden } from '../dom.ts';
import { formatTimestamp } from '../format.ts';
import type { Localization } from '../i18n.ts';
import { infoTip } from '../infoTip.ts';
import { button, setLabel } from './buttons.ts';
import type { PopupActions } from './popupActions.ts';

export function moreCard(document: Document, l10n: Localization, actions: PopupActions) {
  const { t } = l10n;
  const loopA = button(document, { className: 'small', onClick: () => actions.loopA() });
  const loopB = button(document, { className: 'small', onClick: () => actions.loopB() });
  const loopToggle = button(document, {
    icon: 'loop',
    className: 'small',
    label: t('loop'),
    attrs: { 'aria-pressed': 'false' },
    onClick: () => actions.loopToggle(loopToggle.getAttribute('aria-pressed') !== 'true'),
  });
  const loopClear = button(document, {
    icon: 'close',
    className: 'small',
    label: t('loopClear'),
    onClick: () => actions.loopClear(),
  });
  const pitch = h(document, 'button', {
    className: 'switch',
    attrs: {
      type: 'button',
      role: 'switch',
      'aria-labelledby': 'pitch-label',
      'aria-describedby': 'pitch-help',
      'aria-checked': 'true',
    },
    on: { click: () => actions.pitch(pitch.getAttribute('aria-checked') !== 'true') },
  });
  const loopHelp = infoTip(document, 'loop-help', t('loopHelpLabel'), [
    t('loopHelp'),
    t('loopHelpSteps'),
    t('loopHelpClear'),
  ]);
  const element = h(document, 'section', { className: 'card more' }, [
    h(document, 'div', { className: 'row' }, [
      h(document, 'span', { className: 'label-help' }, [
        h(document, 'span', { text: t('loopGroup'), attrs: { id: 'loop-label' } }),
        loopHelp.button,
      ]),
      h(
        document,
        'div',
        { className: 'loop', attrs: { role: 'group', 'aria-labelledby': 'loop-label' } },
        [loopA, loopB, loopToggle, loopClear],
      ),
    ]),
    loopHelp.tip,
    h(document, 'div', { className: 'row' }, [
      h(document, 'span', { className: 'label-stack' }, [
        h(document, 'span', { text: t('preservePitch'), attrs: { id: 'pitch-label' } }),
        h(document, 'span', {
          className: 'sublabel muted',
          text: t('pitchHelpShort'),
          attrs: { id: 'pitch-help' },
        }),
      ]),
      pitch,
    ]),
  ]);
  return {
    element,
    render(state: EngineState): void {
      const loopable = state.duration !== null;
      const loop = state.loop;
      const clock = (seconds: number | null) =>
        seconds === null || state.duration === null
          ? null
          : formatTimestamp(seconds, state.duration);
      const a = clock(loop?.a ?? null);
      const b = clock(loop?.b ?? null);
      // The markers show on the timeline; their times are in the buttons' names.
      setLabel(loopA, 'A', a === null ? t('loopA') : t('loopAAt', a));
      setLabel(loopB, 'B', b === null ? t('loopB') : t('loopBAt', b));
      loopA.classList.toggle('marked', a !== null);
      loopB.classList.toggle('marked', b !== null);
      setDisabled(loopA, !loopable);
      setDisabled(loopB, !loopable);
      setDisabled(loopToggle, !loopable || loop === null || loop.b === null);
      setAttr(loopToggle, 'aria-pressed', String(loop?.enabled === true));
      setHidden(loopClear, loop === null);
      setAttr(pitch, 'aria-checked', String(state.preservesPitch));
    },
  };
}
