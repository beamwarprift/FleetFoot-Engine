// The right-click menu on video and audio: on or off.

import { type OptionsSection, type SectionDeps, settingsSection } from './section.ts';
import { settingControls } from './settingControls.ts';

export function menuSection(deps: SectionDeps): OptionsSection {
  const enabled = settingControls(deps).checkbox(
    'contextMenu',
    'contextMenuField',
    'contextMenuHelp',
  );
  return settingsSection(deps.fields.section('sectionMenu', [enabled.element]), [enabled]);
}
