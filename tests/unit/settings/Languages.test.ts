import { describe, expect, it } from 'vitest';
import { asLanguage, BROWSER_LANGUAGE, languageTag } from '../../../src/core/settings/Languages.ts';
import { parseSettings } from '../../../src/core/settings/Settings.ts';

describe('the interface language', () => {
  it("keeps the browser's language and any catalogue's name, carried or not", () => {
    for (const name of [BROWSER_LANGUAGE, 'it', 'de', 'pt_BR', 'zh_CN', 'fil', 'xx']) {
      expect(asLanguage(name)).toBe(name);
    }
  });

  it('refuses what is no catalogue name, so it never builds a path elsewhere', () => {
    for (const value of [
      '',
      'IT',
      'pt-BR',
      'pt_br',
      'italiano',
      '../en',
      'en/../../x',
      'e',
      'en_US_x',
      ' it',
      'it\n',
      42,
      null,
      undefined,
      ['it'],
      { language: 'it' },
    ]) {
      expect(asLanguage(value), JSON.stringify(value)).toBeUndefined();
    }
    expect(parseSettings({ language: '../en' }).language).toBe(BROWSER_LANGUAGE);
  });

  it('names a catalogue’s language with its BCP 47 tag', () => {
    expect(languageTag('pt_BR')).toBe('pt-BR');
    expect(languageTag('zh_CN')).toBe('zh-CN');
    expect(languageTag('it')).toBe('it');
  });
});
