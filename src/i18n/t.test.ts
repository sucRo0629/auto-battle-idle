import { afterEach, describe, expect, it } from 'vitest';
import { resolveLocale, resetLocaleStateForTests, setLocale } from './locale.ts';
import { t } from './t.ts';
import { UI_MESSAGE_KEYS } from './uiMessages.ts';

describe('t', () => {
  afterEach(() => {
    resetLocaleStateForTests();
  });

  it('returns Japanese messages by default', () => {
    resolveLocale('');
    expect(t('party.title')).toBe('パーティ設定');
  });

  it('returns English messages when locale is en', () => {
    resolveLocale('');
    setLocale('en');
    expect(t('party.title')).toBe('Party Setup');
  });

  it('interpolates params', () => {
    resolveLocale('');
    setLocale('en');
    expect(t('common.playerLevel', { level: 5 })).toBe('Player Lv 5');
  });

  it('defines every key for both locales', () => {
    resolveLocale('');
    for (const key of UI_MESSAGE_KEYS) {
      setLocale('ja');
      expect(t(key).length).toBeGreaterThan(0);
      setLocale('en');
      expect(t(key).length).toBeGreaterThan(0);
    }
  });
});
