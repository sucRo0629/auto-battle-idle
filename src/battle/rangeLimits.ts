import {
  CANVAS_W,
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import {
  MELEE_RANGE_MAX_PX,
  RANGED_ATTACK_THRESHOLD_PX,
} from './types.ts';

/** traits.rangePx / スキル effect.range の設定上限（px）。左端隊列アンカーからキャンバス右端まで。 */
export const CONFIGURABLE_RANGE_PX_MAX =
  CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR;

/** エディタ補足・バリデーション文言用 */
export function configurableRangeHintJa(): string {
  return `0〜${CONFIGURABLE_RANGE_PX_MAX} px（近接帯 0〜${MELEE_RANGE_MAX_PX}、${RANGED_ATTACK_THRESHOLD_PX + 1} 以上=遠隔帯）`;
}

export function assertConfigurableRangePx(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > CONFIGURABLE_RANGE_PX_MAX) {
    throw new Error(
      `${label} は 0〜${CONFIGURABLE_RANGE_PX_MAX} px の範囲である必要があります`,
    );
  }
}
