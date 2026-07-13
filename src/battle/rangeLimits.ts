import {
  CANVAS_W,
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import { COMBAT_SAFE_RIGHT } from './combatSafeArea.ts';
import type { AppLocale } from '../i18n/locale.ts';
import type { AttackMethod } from './types.ts';

/** traits.rangePx / スキル effect.range の設定上限（px）。安全領域左端から右端まで。 */
export const CONFIGURABLE_RANGE_PX_MAX =
  COMBAT_SAFE_RIGHT - PARTY_FORMATION_LEFT_ANCHOR;

/** 編集 UI 向け attackMethod ラベル（表示専用） */
export function formatAttackMethodLabel(
  attackMethod: AttackMethod | undefined,
  locale: AppLocale = 'ja',
): string {
  if (attackMethod === 'ranged') {
    return locale === 'en' ? 'Ranged' : '遠隔';
  }
  if (attackMethod === 'melee') {
    return locale === 'en' ? 'Melee' : '近接';
  }
  return locale === 'en' ? '—' : '—';
}

/** @deprecated use {@link formatAttackMethodLabel} */
export function formatRangeBand(
  rangePx: number,
  locale: AppLocale = 'ja',
): string {
  void rangePx;
  return locale === 'en' ? '—' : '—';
}

/** @deprecated use {@link formatAttackMethodLabel} */
export function formatRangeBandJa(rangePx: number): string {
  return formatRangeBand(rangePx, 'ja');
}

/** エディタ補足・バリデーション文言用 */
export function configurableRangeHintJa(): string {
  return (
    `0〜${CONFIGURABLE_RANGE_PX_MAX} px の連続値（距離計算・停止位置に使用）` +
    '。+数値で traits.rangePx に加算'
  );
}

/** エディタ: 反撃可能対象の近接／遠隔補足 */
export function counterAttackRangeBandEditorHintJa(): string {
  return '未選択 = 全区間。遠隔 = 被攻撃の attackMethod が ranged。';
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
