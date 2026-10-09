// The user's own copy of the settings: kept as a file, brought back after a check and
// a confirmation, and everything kept on this device deleted in two clicks.

import {
  type Backup,
  type BackupError,
  backupSize,
  MAX_BACKUP_BYTES,
  readBackup,
  writeBackup,
} from '../../core/settings/Backup.ts';
import { h, setText } from '../dom.ts';
import { formatCount } from '../format.ts';
import type { MessageKey } from '../i18n.ts';
import type { LocalDataPort } from '../LocalDataPort.ts';
import type { ProfilesPort } from '../ProfilesPort.ts';
import type { SectionDeps } from './section.ts';

export interface BackupDeps extends SectionDeps {
  readonly profiles: ProfilesPort;
  readonly localData: LocalDataPort;
}

const ERRORS: Readonly<Record<BackupError, MessageKey>> = {
  'too-large': 'importTooLarge',
  'not-json': 'importNotJson',
  'not-backup': 'importNotBackup',
  'newer-version': 'importNewer',
};

/** The file's name: the app and the day, so copies sort by date. */
function fileName(date: Date): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `fleetfoot-engine-settings-${day}.json`;
}

/**
 * Hands the file to the browser's downloads. The address lives until the page closes, when the
 * browser releases it (File API, blob URL lifetime), so the download is never cut short.
 */
function download(document: Document, text: string, name: string): void {
  const view = document.defaultView;
  if (view === null) return;
  const url = view.URL.createObjectURL(new view.Blob([text], { type: 'application/json' }));
  h(document, 'a', { attrs: { href: url, download: name } }).click();
}

export function backupControls(deps: BackupDeps): HTMLElement {
  const { document, fields, profiles, localData } = deps;
  const { t, locale } = deps.l10n;
  const count = (value: number) => formatCount(value, locale);
  const note = h(document, 'p', { className: 'help', attrs: { role: 'status' } });
  const tell = (key: MessageKey) => setText(note, t(key));

  const exportButton = h(document, 'button', {
    text: t('exportSettings'),
    attrs: { type: 'button' },
    on: {
      click: () =>
        void Promise.all([profiles.rememberedRate(), profiles.list()]).then(
          ([rate, sites]) => {
            download(document, writeBackup(deps.settings(), rate, sites), fileName(new Date()));
            tell('exportDone');
          },
          () => tell('exportFailed'),
        ),
    },
  });

  // A checked copy waits here until the user confirms or cancels.
  let pending: Backup | null = null;
  const summary = h(document, 'p', {});
  const ignored = h(document, 'p', { className: 'help' });
  const confirm = h(document, 'div', { className: 'import-confirm', attrs: { hidden: '' } });
  const close = () => {
    pending = null;
    confirm.hidden = true;
  };
  const apply = h(document, 'button', {
    text: t('importConfirm'),
    attrs: { type: 'button' },
    on: {
      click: () => {
        const backup = pending;
        close();
        if (backup === null) return;
        localData.restore(backup).then(
          () => tell('importDone'),
          () => tell('importFailed'),
        );
      },
    },
  });
  const cancel = h(document, 'button', {
    text: t('importCancel'),
    attrs: { type: 'button' },
    on: { click: close },
  });
  confirm.append(
    summary,
    ignored,
    h(document, 'p', { className: 'help', text: t('importReplace') }),
    h(document, 'div', { className: 'import-actions' }, [apply, cancel]),
  );

  const picker = h(document, 'input', {
    attrs: { type: 'file', accept: '.json,application/json', hidden: '' },
  });
  const show = (backup: Backup, skipped: number) => {
    pending = backup;
    const size = backupSize(backup);
    setText(summary, t('importSummary', count(size.settings), count(size.sites)));
    setText(ignored, skipped > 0 ? t('importIgnored', count(skipped)) : '');
    ignored.hidden = skipped === 0;
    setText(note, '');
    confirm.hidden = false;
    // Keyboard and screen reader users land on the question the file raised.
    apply.focus();
  };
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    // The same file can be chosen again.
    picker.value = '';
    close();
    if (file === undefined) return;
    if (file.size > MAX_BACKUP_BYTES) {
      tell(ERRORS['too-large']);
      return;
    }
    void file.text().then(
      (text) => {
        const read = readBackup(text);
        if (read.ok) show(read.backup, read.ignored);
        else tell(ERRORS[read.error]);
      },
      () => tell('importNotJson'),
    );
  });
  const importButton = h(document, 'button', {
    text: t('importSettings'),
    attrs: { type: 'button' },
    on: { click: () => picker.click() },
  });

  const deleteAll = fields.confirmButton('deleteAll', 'deleteAllConfirm', () => {
    close();
    localData.clear().then(
      () => tell('deletedAll'),
      () => tell('deleteFailed'),
    );
  });

  return h(document, 'div', { className: 'group' }, [
    h(document, 'h3', { text: t('backupTitle') }),
    h(document, 'p', { className: 'help', text: t('backupHelp') }),
    h(document, 'div', { className: 'backup-actions' }, [exportButton, importButton]),
    picker,
    confirm,
    deleteAll,
    h(document, 'p', { className: 'help', text: t('deleteAllHelp', t('sectionAccess')) }),
    note,
  ]);
}
