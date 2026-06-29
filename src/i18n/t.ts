import { getLocale } from './locale.ts';
import { UI_MESSAGES, type UiMessageKey } from './uiMessages.ts';

export type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

export function t(key: UiMessageKey, params?: TranslateParams): string {
  const locale = getLocale();
  const text = UI_MESSAGES[locale][key] ?? UI_MESSAGES.ja[key];
  if (text === undefined) return key;
  return interpolate(text, params);
}
