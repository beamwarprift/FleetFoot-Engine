// Time saved: the total kept on this device, what it means, and a two-step reset.

import { h, setText } from '../dom.ts';
import type { StatsPort } from '../StatsPort.ts';
import { savedTimeText } from '../savedTime.ts';
import type { OptionsSection, SectionDeps } from './section.ts';

export interface SavedTimeDeps extends SectionDeps {
  readonly stats: StatsPort;
}

/** Loads the total first, so the section never shows without it. */
export async function savedTimeSection(deps: SavedTimeDeps): Promise<OptionsSection> {
  const { document, fields, l10n, stats } = deps;
  const { t } = l10n;
  const total = h(document, 'p', { className: 'saved-total' });
  const show = (seconds: number) => setText(total, t('savedTotal', savedTimeText(l10n, seconds)));
  show(await stats.load());
  const stop = stats.watch(show);
  const reset = fields.confirmButton('savedReset', 'savedResetConfirm', () => {
    void stats.reset().then(() => deps.say(t('savedResetDone')));
  });
  return {
    element: fields.section('savedTitle', [
      total,
      h(document, 'p', { className: 'help', text: t('savedHelp') }),
      reset,
    ]),
    refresh() {},
    stop,
  };
}
