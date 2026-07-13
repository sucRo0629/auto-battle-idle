import {
  CANVAS_W,
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import { COMBAT_SAFE_RIGHT } from './combatSafeArea.ts';
import type { AppLocale } from '../i18n/locale.ts';
import {
  isMeleeRangePx,
  MELEE_RANGE_MAX_PX,
  RANGED_ATTACK_MIN_PX,
} from './types.ts';

/** traits.rangePx / スキル effect.range の設定上限（px）。安全領域左端から右端まで。 */
export const CONFIGURABLE_RANGE_PX_MAX =
  COMBAT_SAFE_RIGHT - PARTY_FORMATION_LEFT_ANCHOR;

/** traits.rangePx の近接帯 / 遠隔帯ラベル */
export function formatRangeBand(
  rangePx: number,
  locale: AppLocale = 'ja',
): string {
  if (locale === 'en') {
    return isMeleeRangePx(rangePx) ? 'Melee band' : 'Ranged band';
  }
  return isMeleeRangePx(rangePx) ? '近接帯' : '遠隔帯';
}

/** @deprecated use {@link formatRangeBand} */
export function formatRangeBandJa(rangePx: number): string {
  return formatRangeBand(rangePx, 'ja');
}

/** エディタ補足・バリデーション文言用 */
export function configurableRangeHintJa(): string {
  return (
    `0〜${CONFIGURABLE_RANGE_PX_MAX} px（近接帯 0〜${MELEE_RANGE_MAX_PX}、遠隔帯 ${RANGED_ATTACK_MIN_PX} 以上）` +
    '。+数値で traits.rangePx に加算'
  );
}

/** エディタ: 反撃可能対象の近接／遠隔帯補足 */
export function counterAttackRangeBandEditorHintJa(): string {
  return `未選択 = 全区間。遠隔 = 実効射程が遠隔帯（${RANGED_ATTACK_MIN_PX} px 以上）。`;
}

/** エディタ: target.attackType の遠隔補足 */
export function attackTypeRangedBandEditorHintJa(): string {
  return '遠隔 = 対象の解決済み通常攻撃 attackMethod が ranged。heal-only basic は未設定のため対象外。';
}

/** 射程 px 入力: 絶対値、または +delta で baseRangePx に加算 */
export function parseConfigurableRangePxInput(
  raw: string,
  baseRangePx: number,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const plusMatch = trimmed.match(/^\+\s*(\d+(?:\.\d+)?)$/);
  if (plusMatch) {
    const delta = Number(plusMatch[1]);
    if (!Number.isFinite(delta)) return null;
    return baseRangePx + delta;
  }

  const absolute = Number(trimmed);
  if (!Number.isFinite(absolute)) return null;
  return absolute;
}

export function assertConfigurableRangePx(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > CONFIGURABLE_RANGE_PX_MAX) {
    throw new Error(
      `${label} は 0〜${CONFIGURABLE_RANGE_PX_MAX} px の範囲である必要があります`,
    );
  }
}
