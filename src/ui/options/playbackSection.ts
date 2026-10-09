// Playback: the natural voice, Skip Silence (on or off, what counts as a silence, the speed of a
// silence) and how far a seek goes.

import { SILENCE_MODES, type SilenceMode } from '../../core/messages/Protocol.ts';
import { MAX_SEEK_STEP, MIN_SEEK_STEP } from '../../core/settings/Settings.ts';
import type { MessageKey } from '../i18n.ts';
import { SKIP_SILENCE_PLACE } from '../optionsPlaces.ts';
import { type Control, type OptionsSection, type SectionDeps, settingsSection } from './section.ts';
import { readSeekStep, SEEK_FIELD_MAX_LENGTH, settingControls } from './settingControls.ts';

const SILENCE_MODE_TEXT: Readonly<Record<SilenceMode, MessageKey>> = {
  conservative: 'silenceConservative',
  normal: 'silenceNormal',
  aggressive: 'silenceAggressive',
};

function seekStepField(deps: SectionDeps): Control {
  const { document, fields, settings, save } = deps;
  const { t } = deps.l10n;
  const input = fields.textInput('numeric', SEEK_FIELD_MAX_LENGTH);
  input.classList.add('number');
  input.addEventListener('change', () => {
    const valid = readSeekStep(input.value.trim());
    if (valid === undefined) {
      fields.showError(input, t('seekStepInvalid', String(MIN_SEEK_STEP), String(MAX_SEEK_STEP)));
      return;
    }
    fields.showError(input, null);
    void save('seekStep', valid);
  });
  return {
    element: fields.field('seekStepField', input),
    refresh() {
      if (document.activeElement !== input) input.value = String(settings().seekStep);
    },
  };
}

export function playbackSection(deps: SectionDeps): OptionsSection {
  const { checkbox, radios, rateField } = settingControls(deps);
  const controls = [
    checkbox('preservesPitch', 'pitchField'),
    checkbox('skipSilence', 'skipSilenceField', 'skipSilenceHelp', SKIP_SILENCE_PLACE),
    radios('silenceMode', 'silenceModeField', SILENCE_MODES, (mode) => [
      SILENCE_MODE_TEXT[mode],
      null,
    ]),
    rateField('silenceRate', 'silenceRateField', 'rateRangeHelp'),
    seekStepField(deps),
  ];
  return settingsSection(
    deps.fields.section(
      'sectionPlayback',
      controls.map((control) => control.element),
    ),
    controls,
  );
}
