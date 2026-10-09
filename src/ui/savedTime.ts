// How the time-saved total reads: hours and minutes, never a false precision.

import { formatQuantity } from './format.ts';
import type { Localization } from './i18n.ts';

export function savedTimeText({ t, locale }: Localization, seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return t('savedUnderMinute');
  const hours = Math.floor(minutes / 60);
  const rest = formatQuantity(minutes % 60, 'minute', locale, 'short');
  if (hours < 1) return rest;
  return t('savedHours', formatQuantity(hours, 'hour', locale, 'short'), rest);
}
