// The overlay on players: on or off, and its place reset to the corner.

import { h } from '../dom.ts';
import { type OptionsSection, type SectionDeps, settingsSection } from './section.ts';
import { settingControls } from './settingControls.ts';

export function overlaySection(deps: SectionDeps): OptionsSection {
  const enabled = settingControls(deps).checkbox('overlayEnabled', 'overlayField', 'overlayHelp');
  const resetPosition = h(deps.document, 'button', {
    text: deps.l10n.t('overlayResetPosition'),
    attrs: { type: 'button' },
    on: { click: () => void deps.save('overlayPosition', null) },
  });
  return settingsSection(deps.fields.section('sectionOverlay', [enabled.element, resetPosition]), [
    enabled,
  ]);
}
