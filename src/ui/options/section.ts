// What every section of the options page receives and gives back: the page's settings and its
// status line in, an element to show and a way to follow the settings out.

import type { SettingKey, Settings } from '../../core/settings/Settings.ts';
import type { Localization } from '../i18n.ts';
import type { Fields } from './fields.ts';

export interface SectionDeps {
  readonly document: Document;
  readonly l10n: Localization;
  readonly fields: Fields;
  /** The settings as last loaded or changed. */
  readonly settings: () => Settings;
  /** Saves one setting and says in the status line whether it was kept. */
  readonly save: <K extends SettingKey>(key: K, value: Settings[K]) => Promise<void>;
  /** A short message in the page's status line. */
  readonly say: (text: string) => void;
}

/** A part of a section that shows a setting. */
export interface Control {
  readonly element: HTMLElement;
  /** Shows the current setting, never under the user's typing. */
  refresh(): void;
}

export interface OptionsSection {
  readonly element: HTMLElement;
  /** The settings changed. */
  refresh(): void;
  stop(): void;
}

/** A section whose parts only follow the settings, with nothing to stop. */
export function settingsSection(
  element: HTMLElement,
  controls: readonly Control[],
): OptionsSection {
  return {
    element,
    refresh() {
      for (const control of controls) control.refresh();
    },
    stop() {},
  };
}
