// Speeds, in three groups: the user's speeds (the presets, the step, the favorite and hold speeds),
// what to do when a site changes the speed and when it fights LOCK, and which players a speed
// applies to.

import { MAX_RATE, MIN_RATE } from '../../core/media/PlaybackRate.ts';
import { LOCK_FIGHTS, RATE_POLICIES, TARGETS, type Target } from '../../core/messages/Protocol.ts';
import { MAX_PRESETS, validSetting } from '../../core/settings/Settings.ts';
import { h } from '../dom.ts';
import { parseRateInput } from '../format.ts';
import type { MessageKey } from '../i18n.ts';
import { infoTip } from '../infoTip.ts';
import { LOCK_FIGHT_PLACE } from '../optionsPlaces.ts';
import { FIGHT_HELP, FIGHT_LABELS, POLICY_TEXT } from './policyText.ts';
import { type Control, type OptionsSection, type SectionDeps, settingsSection } from './section.ts';
import { RATE_FIELD_MAX_LENGTH, settingControls } from './settingControls.ts';

const TARGET_TEXT: Readonly<Record<Target, MessageKey>> = {
  active: 'targetActive',
  all: 'targetAll',
};

/** Every preset at its longest, with the spaces between them. */
const PRESETS_MAX_LENGTH = MAX_PRESETS * (RATE_FIELD_MAX_LENGTH + 1);

function presetsField(deps: SectionDeps): Control {
  const { document, fields, settings, save } = deps;
  const { t } = deps.l10n;
  const input = fields.textInput('decimal', PRESETS_MAX_LENGTH);
  input.addEventListener('change', () => {
    const tokens = input.value
      .trim()
      .split(/\s+/)
      .filter((token) => token !== '');
    const rates = tokens.map(parseRateInput);
    const readable = rates.every(
      (rate): rate is number => rate !== null && rate >= MIN_RATE && rate <= MAX_RATE,
    );
    const valid = readable ? validSetting('presets', rates) : undefined;
    if (valid === undefined) {
      fields.showError(input, t('presetsInvalid', String(MAX_PRESETS)));
      return;
    }
    fields.showError(input, null);
    void save('presets', valid);
  });
  return {
    element: fields.field('presetsField', input, 'presetsHelp'),
    refresh() {
      if (document.activeElement === input) return;
      input.value = settings().presets.map(fields.number).join(' ');
    },
  };
}

export function speedSection(deps: SectionDeps): OptionsSection {
  const { document, l10n } = deps;
  const { rateField, radios } = settingControls(deps);
  const rates = [
    presetsField(deps),
    rateField('rateStep', 'rateStepField', 'rateStepHelp'),
    rateField('favoriteRate', 'favoriteField', 'rateRangeHelp'),
    rateField('holdRate', 'holdField', 'rateRangeHelp'),
  ];
  const restore = [
    radios('ratePolicy', 'policyField', RATE_POLICIES, (policy) => POLICY_TEXT[policy]),
    radios('lockFight', 'fightField', LOCK_FIGHTS, (fight) => [FIGHT_LABELS[fight], null], {
      id: LOCK_FIGHT_PLACE,
      tip: infoTip(
        document,
        deps.fields.nextId('tip'),
        l10n.t('fightHelpLabel'),
        FIGHT_HELP.map(([term, text]) => ({ term: l10n.t(term), text: l10n.t(text) })),
      ),
    }),
  ];
  const players = [
    radios('target', 'targetField', TARGETS, (target) => [TARGET_TEXT[target], null]),
  ];
  const group = (title: MessageKey, controls: readonly Control[]) =>
    h(document, 'div', { className: 'group' }, [
      h(document, 'h3', { text: l10n.t(title) }),
      ...controls.map((control) => control.element),
    ]);
  return settingsSection(
    deps.fields.section('sectionSpeed', [
      group('speedGroupRates', rates),
      group('speedGroupRestore', restore),
      group('speedGroupPlayers', players),
    ]),
    [...rates, ...restore, ...players],
  );
}
