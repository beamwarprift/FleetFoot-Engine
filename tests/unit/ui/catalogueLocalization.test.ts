// Texts read from the extension's own catalogues, for a language the user chose: filled as the
// browser fills them (the E2E compares the two on every text), written in the language's direction.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { languageTag } from '../../../src/core/settings/Languages.ts';
import { pageCatalogue } from '../../../src/page/pageTexts.ts';
import {
  type Catalogue,
  catalogueLocalization,
  fillMessage,
  textsOf,
} from '../../../src/ui/catalogue.ts';
import { CATALOGUE_NAMES } from '../../../src/ui/catalogues.ts';
import { isolate } from '../../../src/ui/i18n.ts';
import { menuCatalogue } from '../../../src/ui/menuTexts.ts';

const LOCALES = join(import.meta.dirname, '../../../public/_locales');
const folders = readdirSync(LOCALES).sort();
const onDisk = (name: string): Catalogue =>
  JSON.parse(readFileSync(join(LOCALES, name, 'messages.json'), 'utf8')) as Catalogue;

describe('fillMessage', () => {
  it('fills named placeholders from their content, whatever their case', () => {
    const entry = {
      message: 'From $FROM$ to $to$, $From$ again',
      placeholders: { from: { content: '$1' }, to: { content: '$2' } },
    };
    expect(fillMessage(entry, ['A', 'B'])).toBe('From A to B, A again');
  });

  it('fills $1…$9 written in the message, makes $$ a dollar sign, leaves unknown names', () => {
    expect(fillMessage({ message: '$2 then $1, $$5, $9.' }, ['one', 'two'])).toBe(
      'two then one, $5, .',
    );
    expect(fillMessage({ message: 'Costs $PRICE$' }, ['3'])).toBe('Costs $PRICE$');
  });

  it('puts a substitution in once, never reading it as a placeholder', () => {
    const entry = { message: 'Site $SITE$', placeholders: { site: { content: '$1' } } };
    expect(fillMessage(entry, ['$2 $$ $SITE$'])).toBe('Site $2 $$ $SITE$');
  });
});

describe('a chosen language', () => {
  it('reads its texts, isolates what is put in them, and takes its tag and direction', () => {
    const l10n = catalogueLocalization<'saved' | 'rateInvalid'>('pt_BR', {
      saved: { message: 'Salvo' },
      rateInvalid: {
        message: 'Entre $MIN$ e $MAX$',
        placeholders: { min: { content: '$1' }, max: { content: '$2' } },
      },
      textDirection: { message: 'ltr' },
    });
    expect(l10n.t('saved')).toBe('Salvo');
    expect(l10n.t('rateInvalid', '0,07×', '16×')).toBe(
      `Entre ${isolate('0,07×')} e ${isolate('16×')}`,
    );
    expect(l10n.locale).toBe('pt-BR');
    expect(l10n.dir).toBe('ltr');
    expect(catalogueLocalization('ar', { textDirection: { message: 'rtl' } }).dir).toBe('rtl');
  });

  it('reads a text it lacks as its key, as the browser does', () => {
    expect(catalogueLocalization<'saved'>('it', {}).t('saved')).toBe('saved');
  });
});

describe('the catalogues the extension carries', () => {
  it('are the folders of public/_locales', () => {
    expect([...CATALOGUE_NAMES]).toEqual(folders);
  });

  it.each(folders)('%s says the direction the browser knows for its language', (name) => {
    const info = (
      new Intl.Locale(languageTag(name)) as Intl.Locale & {
        getTextInfo: () => { direction: string };
      }
    ).getTextInfo();
    expect(onDisk(name)['textDirection' as never]).toMatchObject({ message: info.direction });
  });

  it('give the page script and the menu their texts, and only theirs', () => {
    for (const name of folders) {
      const whole = onDisk(name) as Readonly<Record<string, unknown>>;
      for (const part of [pageCatalogue(name), menuCatalogue(name)]) {
        expect(part).not.toBeNull();
        // Each text as the catalogue has it, without the note for translators.
        for (const [key, entry] of Object.entries(part ?? {})) {
          const { description: _, ...text } = whole[key] as { description?: string };
          expect(entry).toEqual(text);
          expect(entry).not.toHaveProperty('description');
        }
      }
      expect(Object.keys(pageCatalogue(name) ?? {})).toContain('overlayLabel');
      expect(Object.keys(menuCatalogue(name) ?? {}).sort()).toEqual([
        'menuFavorite',
        'menuSpeed',
        'textDirection',
      ]);
    }
    expect(pageCatalogue('xx')).toBeNull();
    expect(menuCatalogue('xx')).toBeNull();
  });

  it('pick no texts for a catalogue that has none of them', () => {
    expect(textsOf({ saved: {} }, 'it')).toBeNull();
  });
});
