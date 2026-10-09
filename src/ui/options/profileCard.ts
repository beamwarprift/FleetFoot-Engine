// One remembered site's profile as a card: closed it shows the site and its speed, open each field
// can be set for this site or left empty, and an empty field names the value it takes from the
// general settings.

import { MAX_RATE, MIN_RATE, type Rate } from '../../core/media/PlaybackRate.ts';
import { LOCK_FIGHTS, RATE_POLICIES } from '../../core/messages/Protocol.ts';
import type { SiteProfile } from '../../core/settings/Profiles.ts';
import {
  MAX_SEEK_STEP,
  MIN_SEEK_STEP,
  type Settings,
  validSetting,
} from '../../core/settings/Settings.ts';
import { h } from '../dom.ts';
import { formatQuantity, formatRate } from '../format.ts';
import type { MessageKey } from '../i18n.ts';
import type { SiteEntry } from '../ProfilesPort.ts';
import {
  FIGHT_LABELS,
  FIGHT_SHORT_LABELS,
  POLICY_SHORT_LABELS,
  POLICY_TEXT,
} from './policyText.ts';
import type { SectionDeps } from './section.ts';
import {
  RATE_FIELD_MAX_LENGTH,
  readRate,
  readSeekStep,
  SEEK_FIELD_MAX_LENGTH,
} from './settingControls.ts';

export interface ProfileCardDeps extends SectionDeps {
  /** Sets one field of a site's profile, or clears it with null. */
  readonly update: <F extends keyof SiteProfile>(
    site: string,
    key: F,
    value: SiteProfile[F] | null,
  ) => void;
  readonly forget: (site: string) => void;
  /** Whether the user left this site's card open: the list is rebuilt from storage. */
  readonly isOpen: (site: string) => boolean;
  readonly setOpen: (site: string, open: boolean) => void;
  /** Shows a general value now and again whenever the general settings change. */
  readonly general: (value: () => string, show: (label: string) => void) => void;
}

export function profileCard(deps: ProfileCardDeps, entry: SiteEntry): HTMLElement {
  const { document, fields, general, forget } = deps;
  const { t, locale } = deps.l10n;
  const onOffText = (on: boolean) => t(on ? 'profileOn' : 'profileOff');

  /** One optional field of a profile: empty means «as in general». */
  const optional = <F extends keyof SiteProfile>(
    key: F,
    label: MessageKey,
    control: HTMLInputElement | HTMLSelectElement,
    read: (text: string) => SiteProfile[F] | null | undefined,
    error: () => string,
  ) => {
    control.addEventListener('change', () => {
      const parsed = read(control.value.trim());
      if (parsed === undefined) {
        fields.showError(control, error());
        return;
      }
      fields.showError(control, null);
      deps.update(entry.site, key, parsed);
    });
    return fields.field(label, control);
  };

  // A site's speeds follow the same rule as the favorite speed.
  const rateReader = (text: string): Rate | null | undefined =>
    text === '' ? null : (readRate(text, 'favoriteRate', MIN_RATE, MAX_RATE) as Rate | undefined);
  const rateError = () => t('rateOutOfRange', fields.number(MIN_RATE), fields.number(MAX_RATE));

  const select = (values: readonly (readonly [string, MessageKey])[], current: string) => {
    const element = h(
      document,
      'select',
      {},
      values.map(([value, label]) => h(document, 'option', { text: t(label), attrs: { value } })),
    );
    element.value = current;
    return element;
  };
  /** A select whose first option is the general value. */
  const withGeneral = (element: HTMLSelectElement, value: () => string): HTMLSelectElement => {
    const option = h(document, 'option', { attrs: { value: '' } });
    element.prepend(option);
    general(value, (label) => {
      option.textContent = label;
    });
    return element;
  };
  const onOff = (value: boolean | undefined, inGeneral: () => boolean) => {
    const element = select(
      [
        ['on', 'profileOn'],
        ['off', 'profileOff'],
      ],
      '',
    );
    withGeneral(element, () => onOffText(inGeneral()));
    element.value = value === undefined ? '' : value ? 'on' : 'off';
    return element;
  };
  const readOnOff = (text: string): boolean | null => (text === '' ? null : text === 'on');
  /** One of a setting's named values for this site, or the general one. */
  const named = <K extends 'ratePolicy' | 'lockFight'>(
    key: K,
    label: MessageKey,
    values: readonly Settings[K][],
    full: (value: Settings[K]) => MessageKey,
    short: Readonly<Record<Settings[K], MessageKey>>,
  ) => {
    const element = withGeneral(
      select(
        values.map((value) => [value, full(value)] as const),
        '',
      ),
      () => t(short[deps.settings()[key]]),
    );
    element.value = profile[key] ?? '';
    return optional(
      key,
      label,
      element,
      (text) => (text === '' ? null : (validSetting(key, text) ?? undefined)),
      () => '',
    );
  };

  const { profile } = entry;
  const rateInput = fields.textInput('decimal', RATE_FIELD_MAX_LENGTH);
  rateInput.value = profile.playbackRate === undefined ? '' : fields.number(profile.playbackRate);
  const holdInput = fields.textInput('decimal', RATE_FIELD_MAX_LENGTH);
  holdInput.value = profile.holdRate === undefined ? '' : fields.number(profile.holdRate);
  general(
    () => formatRate(deps.settings().holdRate, locale),
    (label) => {
      holdInput.placeholder = label;
    },
  );
  const seekInput = fields.textInput('numeric', SEEK_FIELD_MAX_LENGTH);
  seekInput.value = profile.seekStep === undefined ? '' : String(profile.seekStep);
  general(
    () => formatQuantity(deps.settings().seekStep, 'second', locale, 'short'),
    (label) => {
      seekInput.placeholder = label;
    },
  );
  const summary = h(document, 'summary', {}, [
    h(document, 'span', { className: 'site', text: entry.site }),
    profile.playbackRate === undefined
      ? null
      : h(document, 'span', {
          className: 'site-rate',
          text: formatRate(profile.playbackRate, locale),
        }),
  ]);
  const card = h(document, 'details', { className: 'profile' }, [
    summary,
    h(document, 'div', { className: 'profile-body' }, [
      optional('playbackRate', 'profileSpeed', rateInput, rateReader, rateError),
      optional(
        'preservesPitch',
        'pitchField',
        onOff(profile.preservesPitch, () => deps.settings().preservesPitch),
        readOnOff,
        () => '',
      ),
      named(
        'ratePolicy',
        'policyField',
        RATE_POLICIES,
        (name) => POLICY_TEXT[name][0],
        POLICY_SHORT_LABELS,
      ),
      named(
        'lockFight',
        'fightField',
        LOCK_FIGHTS,
        (fight) => FIGHT_LABELS[fight],
        FIGHT_SHORT_LABELS,
      ),
      optional(
        'skipSilence',
        'skipSilenceField',
        onOff(profile.skipSilence, () => deps.settings().skipSilence),
        readOnOff,
        () => '',
      ),
      optional(
        'overlayEnabled',
        'overlayField',
        onOff(profile.overlayEnabled, () => deps.settings().overlayEnabled),
        readOnOff,
        () => '',
      ),
      optional(
        'seekStep',
        'seekStepField',
        seekInput,
        (text) => (text === '' ? null : readSeekStep(text)),
        () => t('seekStepInvalid', String(MIN_SEEK_STEP), String(MAX_SEEK_STEP)),
      ),
      optional('holdRate', 'holdField', holdInput, rateReader, rateError),
      h(document, 'button', {
        text: t('profileForget'),
        attrs: { type: 'button', 'aria-label': t('profileForgetSite', entry.site) },
        on: { click: () => forget(entry.site) },
      }),
    ]),
  ]);
  card.open = deps.isOpen(entry.site);
  card.addEventListener('toggle', () => deps.setOpen(entry.site, card.open));
  return card;
}
