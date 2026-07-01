import type { ClassFeatureTags, ClassLocaleText, ClassPreset } from '../battle/types.ts';

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

export function formatClassFeatureTags(
  preset: Pick<ClassPreset, 'featureTags'> | undefined,
  locale: ClassSummaryLocale = 'ja',
): string[] {
  if (!preset?.featureTags) return [];
  const tags =
    locale === 'en'
      ? preset.featureTags.en ?? preset.featureTags.ja
      : preset.featureTags.ja;
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

/** aria-label 用。表示用の改行を空白に正規化する */
export function formatClassSummaryForAria(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim();
}

export function readClassSummaryJa(summary: ClassLocaleText | undefined): string {
  return summary?.ja.trim() ?? '';
}
