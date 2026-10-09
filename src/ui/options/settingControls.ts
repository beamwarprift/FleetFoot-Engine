// The setting controls more than one section uses: a speed-like field, an on-off switch, a group
// of choices. Each reads strictly, explains a refusal next to itself and saves nothing then.

import { MAX_RATE, MIN_RATE } from '../../core/media/PlaybackRate.ts';
import {
  MAX_RATE_STEP,
  MIN_RATE_STEP,
  type Settings,
  validSetting,
} from '../../core/settings/Settings.ts';
import { h } from '../dom.ts';
import { parseRateIn, toLatinDigits } from '../format.ts';
import type { MessageKey } from '../i18n.ts';
import type { ChoiceExtras } from './fields.ts';
import type { Control, SectionDeps } from './section.ts';

/** «16,00»: the longest valid speed or step in a field. */
export const RATE_FIELD_MAX_LENGTH = 6;
/** Up to the protocol's largest seek, 3600 s: four digits. */
export const SEEK_FIELD_MAX_LENGTH = 4;

/** A typed speed or step inside [min, max], as the setting `key` keeps it; else undefined. */
export function readRate(
  text: string,
  key: 'favoriteRate' | 'holdRate' | 'silenceRate' | 'rateStep',
  min: number,
  max: number,
): number | undefined {
  const parsed = parseRateIn(text, min, max);
  return parsed === null ? undefined : validSetting(key, parsed);
}

/** A typed seek step: whole seconds, four digits at most, inside the settings' range. */
export function readSeekStep(text: string): number | undefined {
  const latin = toLatinDigits(text);
  return /^[0-9]{1,4}$/.test(latin) ? validSetting('seekStep', Number(latin)) : undefined;
}

type SwitchKey =
  | 'preservesPitch'
  | 'skipSilence'
  | 'pageShortcuts'
  | 'overlayEnabled'
  | 'contextMenu';

export function settingControls(deps: SectionDeps) {
  const { document, fields, settings, save } = deps;
  const { t } = deps.l10n;

  /** One speed-like field: strictly read, refused outside its range, never clamped. */
  const rateField = (
    key: 'favoriteRate' | 'holdRate' | 'silenceRate' | 'rateStep',
    label: MessageKey,
    help: MessageKey,
  ): Control => {
    const step = key === 'rateStep';
    const [min, max] = step ? [MIN_RATE_STEP, MAX_RATE_STEP] : [MIN_RATE, MAX_RATE];
    const input = fields.textInput('decimal', RATE_FIELD_MAX_LENGTH);
    input.classList.add('number');
    input.addEventListener('change', () => {
      const valid = readRate(input.value, key, min, max);
      if (valid === undefined) {
        const message = step ? 'stepOutOfRange' : 'rateOutOfRange';
        fields.showError(input, t(message, fields.number(min), fields.number(max)));
        return;
      }
      fields.showError(input, null);
      void save(key, valid);
    });
    return {
      element: fields.field(label, input, help),
      refresh() {
        if (document.activeElement !== input) input.value = fields.number(settings()[key]);
      },
    };
  };

  /** `place`: the id another page links to (`optionsPlaces.ts`). */
  const checkbox = (
    key: SwitchKey,
    label: MessageKey,
    help: MessageKey | null = null,
    place: string | null = null,
  ): Control => {
    const input = h(document, 'input', { attrs: { type: 'checkbox' } });
    input.addEventListener('change', () => void save(key, input.checked));
    const element = h(document, 'div', { className: 'field check' }, [
      fields.field(label, input, help),
    ]);
    if (place !== null) element.id = place;
    return {
      element,
      refresh() {
        input.checked = settings()[key];
      },
    };
  };

  const radios = <T extends string>(
    key: 'ratePolicy' | 'lockFight' | 'silenceMode' | 'target',
    legend: MessageKey,
    options: readonly T[],
    text: (option: T) => readonly [MessageKey, MessageKey | null],
    extras: ChoiceExtras = {},
  ): Control => {
    const group = fields.choices(
      legend,
      options.map((value) => {
        const [label, help] = text(value);
        return help === null ? { value, label } : { value, label, help };
      }),
      (value) => void save(key, value as Settings[typeof key]),
      extras,
    );
    return {
      element: group.element,
      refresh() {
        group.show(settings()[key] as T);
      },
    };
  };

  return { rateField, checkbox, radios };
}
