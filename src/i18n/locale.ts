import { projectStorageKey } from '../projectIdentity.ts';

export type AppLocale = 'ja' | 'en';

export const APP_LOCALES = ['ja', 'en'] as const satisfies readonly AppLocale[];

/** Dev default. Release zip may switch to `en` in Phase 7. */
export const DEFAULT_LOCALE: AppLocale = 'ja';

const LOCALE_STORAGE_KEY = projectStorageKey('locale');
const LOCALE_PARAM = 'locale';

let resolvedLocale: AppLocale | null = null;
const listeners = new Set<() => void>();

function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

function readLocaleFromSearch(search: string): AppLocale | null {
  const params = new URLSearchParams(search);
  const raw = params.get(LOCALE_PARAM);
  if (!raw || !isAppLocale(raw)) return null;
  return raw;
}

function readLocaleFromStorage(): AppLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw || !isAppLocale(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeLocaleToStorage(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / privacy errors
  }
}

/** Resolve and cache locale. Call once at app startup (before UI mount). */
export function resolveLocale(
  search: string = typeof location !== 'undefined' ? location.search : '',
): AppLocale {
  const locale =
    readLocaleFromSearch(search) ??
    readLocaleFromStorage() ??
    DEFAULT_LOCALE;
  resolvedLocale = locale;
  return locale;
}

export function getLocale(): AppLocale {
  return resolvedLocale ?? DEFAULT_LOCALE;
}

export function setLocale(locale: AppLocale): void {
  if (getLocale() === locale) return;
  resolvedLocale = locale;
  writeLocaleToStorage(locale);
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — reset module state between cases. */
export function resetLocaleStateForTests(): void {
  resolvedLocale = null;
  listeners.clear();
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
