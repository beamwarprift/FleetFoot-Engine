// Where the player is in time: position and duration (or live), the timeline with the A–B stretch,
// the time left at this speed and at 1×, and the row to seek, copy the time, open
// Picture-in-Picture and skip silences.

import type { EngineState } from '../../core/messages/Protocol.ts';
import type { Settings } from '../../core/settings/Settings.ts';
import { h, setAttr, setDisabled, setHidden, setText } from '../dom.ts';
import { formatRate, formatRemaining, formatTimestamp } from '../format.ts';
import { hoverCard } from '../hoverCard.ts';
import type { Localization } from '../i18n.ts';
import { optionsPlaceHref, SKIP_SILENCE_PLACE } from '../optionsPlaces.ts';
import { seekLabels } from '../seekLabels.ts';
import { button, setLabel } from './buttons.ts';
import type { PopupActions } from './popupActions.ts';

/** A share of the timeline as a width or offset, to a tenth of a percent. */
const percent = (fraction: number) =>
  `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;

export function timeCard(document: Document, l10n: Localization, actions: PopupActions) {
  const { t, locale } = l10n;
  const position = h(document, 'span', { className: 'clock' });
  const duration = h(document, 'span', { className: 'clock muted' });
  const live = h(document, 'span', { className: 'live', text: t('live') });
  const progress = h(document, 'div', { className: 'progress-fill' });
  // The A–B loop on the timeline, where it is in time.
  const loopRange = h(document, 'div', { className: 'loop-range' });
  loopRange.hidden = true;
  const left = h(document, 'p', { className: 'left' });
  const leftNormal = h(document, 'p', { className: 'left-normal muted' });
  const seekBack = button(document, {
    icon: 'back',
    className: 'seek',
    onClick: () => actions.seek(-1),
  });
  const seekForward = button(document, {
    icon: 'forward',
    className: 'seek trailing',
    onClick: () => actions.seek(1),
  });
  const copy = button(document, {
    icon: 'copy',
    className: 'copy',
    label: t('copyTimestamp'),
    onClick: () => actions.copyTimestamp(),
  });
  const pip = button(document, { icon: 'pip', className: 'pip', onClick: () => actions.pip() });
  const skip = button(document, {
    icon: 'skipSilence',
    className: 'pip skip-silence',
    label: t('skipSilenceField'),
    attrs: { 'aria-pressed': 'false' },
    onClick: () => actions.skipSilence(skip.getAttribute('aria-pressed') !== 'true'),
  });
  const skipCard = hoverCard(
    document,
    skip,
    'skip-silence-card',
    [{ term: t('skipSilenceField'), text: t('skipSilenceHelp') }],
    { text: t('skipSilenceSettings'), href: optionsPlaceHref(SKIP_SILENCE_PLACE) },
  );
  // It sits in the time row, which runs left to right; its text follows the language.
  skipCard.dir = l10n.dir;
  const element = h(document, 'section', { className: 'card time' }, [
    // The timeline follows time, not writing: left to right in every language.
    h(document, 'div', { className: 'clocks', attrs: { dir: 'ltr' } }, [position, live, duration]),
    h(document, 'div', { className: 'progress', attrs: { 'aria-hidden': 'true', dir: 'ltr' } }, [
      progress,
      loopRange,
    ]),
    left,
    leftNormal,
    h(document, 'div', { className: 'seek-row', attrs: { dir: 'ltr' } }, [
      seekBack,
      copy,
      pip,
      skip,
      skipCard,
      seekForward,
    ]),
  ]);

  /** The loop's stretch as a share of the duration; A defaults to the start. */
  const renderLoopRange = (state: EngineState): void => {
    const { loop, duration: total } = state;
    const shown = loop !== null && total !== null && total > 0 && loop.b !== null;
    setHidden(loopRange, !shown);
    if (!shown) return;
    const start = (loop.a ?? 0) / total;
    const end = (loop.b ?? total) / total;
    // The timeline is left to right in every language, so physical sides are meant here.
    loopRange.style.left = percent(start);
    loopRange.style.width = percent(end - start);
  };

  return {
    element,
    render(state: EngineState, settings: Settings): void {
      const rate = (value: number) => formatRate(value, locale);
      const isLive = state.duration === null;
      const at =
        state.currentTime === null
          ? null
          : formatTimestamp(state.currentTime, state.duration ?? Number.NaN);
      setText(position, at ?? '—');
      setHidden(live, !isLive);
      setHidden(duration, isLive);
      const total =
        state.duration === null ? null : formatTimestamp(state.duration, state.duration);
      setText(duration, total ?? '');
      const fraction =
        state.currentTime === null || state.duration === null
          ? 0
          : state.currentTime / state.duration;
      progress.style.width = percent(fraction);
      const remaining = state.remaining;
      const atRate = remaining?.atRate ?? null;
      const leftAtRate = atRate === null ? null : formatRemaining(atRate, state.duration);
      setText(left, leftAtRate === null ? '' : t('timeLeftAt', leftAtRate, rate(state.rate ?? 1)));
      setHidden(left, leftAtRate === null);
      const normal =
        remaining === null ? null : formatRemaining(remaining.original, state.duration);
      const showNormal = normal !== null && state.rate !== 1;
      setText(leftNormal, showNormal ? t('timeLeftNormal', normal) : '');
      setHidden(leftNormal, !showNormal);

      // The number inside the seek arrows, as players show it; the unit is in the name.
      const step = new Intl.NumberFormat(locale).format(settings.seekStep);
      const names = seekLabels(l10n, settings.seekStep);
      setLabel(seekBack, step, names.back);
      setLabel(seekForward, step, names.forward);
      setDisabled(seekBack, !state.seekable);
      setDisabled(seekForward, !state.seekable);
      setLabel(copy, at ?? '', t('copyTimestamp'));
      setDisabled(copy, at === null);

      renderLoopRange(state);
      setHidden(pip, !state.pip.available && !state.pip.active);
      setLabel(pip, '', state.pip.active ? t('pipExit') : t('pipEnter'));
      setAttr(pip, 'aria-pressed', String(state.pip.active));
      // What Skip Silence cannot do is a notice; while it speeds through a silence, it glows.
      const silence = state.skipSilence.status;
      setAttr(skip, 'aria-pressed', String(silence !== 'off'));
      skip.classList.toggle('skipping', silence === 'skipping');
    },
  };
}
