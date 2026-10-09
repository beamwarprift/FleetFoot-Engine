// The accessible names of the seek buttons, in the popup and the overlay: the direction and the
// step with its unit in words («Back 5 seconds»).

import { formatQuantity } from './format.ts';
import type { Localization } from './i18n.ts';

export function seekLabels(l10n: Localization, seconds: number): { back: string; forward: string } {
  const step = formatQuantity(seconds, 'second', l10n.locale, 'long');
  return { back: l10n.t('seekBack', step), forward: l10n.t('seekForward', step) };
}
