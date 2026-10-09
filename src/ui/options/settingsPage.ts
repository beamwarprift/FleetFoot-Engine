// What every page that edits the settings shares (the options page, the first-run page): the
// settings loaded and followed, the language and theme applied, one status line, and the parts
// each page composes from them. A link from elsewhere in the extension opens it at one place.

import type { SettingKey, Settings } from '../../core/settings/Settings.ts';
import { applyLanguage } from '../applyLanguage.ts';
import { applyTheme } from '../applyTheme.ts';
import { h, setText } from '../dom.ts';
import type { Localization } from '../i18n.ts';
import type { SettingsPort } from '../SettingsPort.ts';
import { createFields } from './fields.ts';
import type { OptionsSection, SectionDeps } from './section.ts';

export interface SettingsPageDeps {
  readonly document: Document;
  readonly l10n: Localization;
  readonly settings: SettingsPort;
  readonly mount: (root: HTMLElement) => void;
}

export interface SettingsPageParts {
  readonly sections: readonly OptionsSection[];
  readonly root: HTMLElement;
  /** What the page itself takes from the settings, once they load and after every change. */
  readonly follow?: (settings: Settings) => void;
}

/** A link from elsewhere in the extension opens the page at one place (`optionsPlaces.ts`). */
function showPlace(document: Document): void {
  let id: string;
  try {
    id = decodeURIComponent(document.location.hash.slice(1));
  } catch {
    return;
  }
  const place = id === '' ? null : document.getElementById(id);
  if (place === null) return;
  place.scrollIntoView({ block: 'center' });
  // A group of choices focuses the chosen one; a single control, itself.
  const control =
    place.querySelector<HTMLElement>('input:checked') ?? place.querySelector<HTMLElement>('input');
  control?.focus({ preventScroll: true });
}

/** `compose` builds the page from what is shared, the status line included; returns its stop. */
export async function startSettingsPage(
  deps: SettingsPageDeps,
  compose: (shared: SectionDeps, status: HTMLElement) => Promise<SettingsPageParts>,
): Promise<() => void> {
  const { document, l10n } = deps;
  const { t } = l10n;
  let settings = await deps.settings.load();
  applyLanguage(document.documentElement, l10n);
  applyTheme(document.documentElement, settings.theme);
  const status = h(document, 'p', {
    className: 'status',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const fields = createFields(document, l10n);
  const say = (text: string) => setText(status, text);
  const save = async <K extends SettingKey>(key: K, value: Settings[K]): Promise<void> => {
    const saved = await deps.settings.save(key, value);
    say(saved ? t('saved') : t('invalidValue'));
  };
  const shared: SectionDeps = { document, l10n, fields, settings: () => settings, save, say };
  const { sections, root, follow } = await compose(shared, status);
  follow?.(settings);

  const refresh = () => {
    for (const section of sections) section.refresh();
  };
  refresh();
  deps.mount(root);
  showPlace(document);
  const stopSettings = deps.settings.watch((next) => {
    settings = next;
    applyTheme(document.documentElement, settings.theme);
    follow?.(settings);
    refresh();
  });
  return () => {
    stopSettings();
    for (const section of sections) section.stop();
  };
}
