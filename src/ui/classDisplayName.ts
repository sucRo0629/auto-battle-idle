import type { AppLocale } from "../i18n/locale.ts";

/** クラス表示名（locale ごとの主表示 + 副表示） */
export interface ClassDisplayLabel {
  displayName: string;
  epithetEn?: string;
}

export function readClassDisplayLabel(
  preset: { displayName: string; epithetEn?: string } | undefined,
  classId: string,
  locale: AppLocale = "ja",
): ClassDisplayLabel {
  if (!preset) {
    return { displayName: classId };
  }
  if (locale === "en") {
    return {
      displayName: preset.epithetEn ?? preset.displayName,
      epithetEn: preset.epithetEn ? preset.displayName : undefined,
    };
  }
  return {
    displayName: preset.displayName,
    epithetEn: preset.epithetEn,
  };
}

/** ロスター等の 2 段表示用。en では epithet 行を省略（主表示が epithetEn）。 */
export function formatClassCardIdentity(
  preset: { displayName: string; epithetEn?: string },
  locale: AppLocale = "ja",
): { name: string; epithet: string } {
  const label = readClassDisplayLabel(preset, preset.displayName, locale);
  if (locale === "en") {
    return { name: label.displayName, epithet: "" };
  }
  return {
    name: label.displayName,
    epithet: label.epithetEn ?? "",
  };
}
