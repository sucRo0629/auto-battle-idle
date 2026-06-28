import type { ClassLocaleText, ClassPreset } from '../battle/types.ts';

export type ClassSummaryLocale = 'ja' | 'en';

export function formatClassSummary(
  preset: Pick<ClassPreset, 'summary'> | undefined,
  locale: ClassSummaryLocale = 'ja',
): string {
  if (!preset?.summary) return '';
  const text =
    locale === 'en'
      ? preset.summary.en ?? preset.summary.ja
      : preset.summary.ja;
  return text.trim();
}

export function readClassSummaryJa(summary: ClassLocaleText | undefined): string {
  return summary?.ja.trim() ?? '';
}
