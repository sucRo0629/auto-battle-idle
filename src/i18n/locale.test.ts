/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  getLocale,
  resolveLocale,
  resetLocaleStateForTests,
  setLocale,
} from './locale.ts';

describe('resolveLocale', () => {
  afterEach(() => {
    resetLocaleStateForTests();
  });

  it('defaults to ja when no override is set', () => {
    expect(resolveLocale('')).toBe('ja');
    expect(getLocale()).toBe('ja');
  });

  it('prefers URL search param over storage', () => {
    localStorage.setItem('hensei-only:locale', 'ja');
    expect(resolveLocale('?locale=en')).toBe('en');
    expect(getLocale()).toBe('en');
  });

  it('falls back to storage when search param is absent', () => {
    localStorage.setItem('hensei-only:locale', 'en');
    expect(resolveLocale('')).toBe('en');
  });

  it('ignores invalid locale values', () => {
    localStorage.setItem('hensei-only:locale', 'fr');
    expect(resolveLocale('?locale=xx')).toBe(DEFAULT_LOCALE);
  });
});

describe('setLocale', () => {
  afterEach(() => {
    resetLocaleStateForTests();
  });

  it('persists locale to storage', () => {
    resolveLocale('');
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(localStorage.getItem('hensei-only:locale')).toBe('en');
  });
});
