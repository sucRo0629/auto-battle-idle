/** スプライト重なり判定に使う最小フィールド */
export interface SpriteDrawOrderInput {
  id: string;
  /** battleX（= screenX） */
  x: number;
  isEnemy: boolean;
}

/**
 * 同一陣営内の奥行きキー。値が小さいほど後方（先に描画＝下層）。
 * 味方: 左（小さい x）が後方。敵: 右（大きい x）が後方。
 */
export function factionBackDepth(layout: SpriteDrawOrderInput): number {
  return layout.isEnemy ? -layout.x : layout.x;
}

/**
 * キャンバス描画順（先頭＝下層・奥、末尾＝上層・手前）。
 *
 * 1. 敵陣営を先に描画（プレイヤー側が上）
 * 2. 同一陣営内は後方ユニットを先に描画（手前ユニットが上）
 */
export function compareSpriteDrawOrder(
  a: SpriteDrawOrderInput,
  b: SpriteDrawOrderInput,
): number {
  if (a.isEnemy !== b.isEnemy) {
    return a.isEnemy ? -1 : 1;
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
