import type { Role } from '../battle/types.ts';
import { isRangedAttack } from '../battle/data/entityTraits.ts';

/** スプライト重なり判定に使う最小フィールド */
export interface SpriteDrawOrderInput {
  id: string;
  /** battleX（= screenX） */
  x: number;
  isEnemy: boolean;
  /** 味方のロール別重なり・敵の射程重なりに使う */
  role?: Role;
  /** 敵の重なり順に使う射程。長いほど下層、短いほど上層 */
  rangePx?: number;
}

/**
 * 同一陣営内の奥行きキー。値が小さいほど後方（先に描画＝下層）。
 * 味方: 左（小さい x）が後方。敵: 右（大きい x）が後方。
 */
export function factionBackDepth(layout: SpriteDrawOrderInput): number {
  return layout.isEnemy ? -layout.x : layout.x;
}

/**
 * 味方のみ: 値が小さいほど下層（先に描画）。
 * ヒーラー → ディフェンダー → 遠隔アタッカー → 近接アタッカーの順で手前に重なる。
 */
export function allyRoleBackDepth(layout: SpriteDrawOrderInput): number {
  const role = layout.role ?? 'attacker';
  if (role === 'supporter') return 0;
  if (role === 'defender') return 1;
  return isRangedAttack(layout.rangePx ?? 0) ? 2 : 3;
}

/** 敵のみ: 値が小さいほど下層。射程が長いほど先に描画される。 */
function enemyRangeBackDepth(layout: SpriteDrawOrderInput): number {
  return -(layout.rangePx ?? 0);
}

/**
 * キャンバス描画順（先頭＝下層・奥、末尾＝上層・手前）。
 *
 * 1. 敵陣営を先に描画（プレイヤー側が上）
 * 2. 味方はロール帯で重なり（近接アタッカーが最前面）
 * 3. 敵は射程の長い方を先に描画
 * 4. 同一帯内は後方ユニットを先に描画（手前ユニットが上）
 */
export function compareSpriteDrawOrder(
  a: SpriteDrawOrderInput,
  b: SpriteDrawOrderInput,
): number {
  if (a.isEnemy !== b.isEnemy) {
    return a.isEnemy ? -1 : 1;
  }
  if (!a.isEnemy && !b.isEnemy) {
    const roleDelta = allyRoleBackDepth(a) - allyRoleBackDepth(b);
    if (roleDelta !== 0) return roleDelta;
  }
  if (a.isEnemy && b.isEnemy) {
    const rangeDelta = enemyRangeBackDepth(a) - enemyRangeBackDepth(b);
    if (rangeDelta !== 0) return rangeDelta;
  }
  const depthDelta = factionBackDepth(a) - factionBackDepth(b);
  if (depthDelta !== 0) return depthDelta;
  return a.id.localeCompare(b.id);
}

export function sortForSpriteDraw<T extends SpriteDrawOrderInput>(
  layouts: readonly T[],
): T[] {
  return [...layouts].sort(compareSpriteDrawOrder);
}
