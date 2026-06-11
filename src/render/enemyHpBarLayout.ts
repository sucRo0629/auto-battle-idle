export const ENEMY_HP_BAR_W = 48;
export const ENEMY_HP_BAR_H = 6;
export const ENEMY_HP_BAR_BELOW_SPRITE = 4;
/** スタック時に下のバーと重ねる高さ（半分重ね = barH / 2） */
export const ENEMY_HP_BAR_STACK_OVERLAP = ENEMY_HP_BAR_H / 2;

export interface HpBarRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface EnemyHpBarLayoutInput {
  id: string;
  x: number;
  y: number;
}

export function defaultEnemyHpBarTop(
  spriteY: number,
  scale: number,
  spriteSize: number,
): number {
  const spriteH = spriteSize * scale;
  return spriteY + spriteH + ENEMY_HP_BAR_BELOW_SPRITE * scale;
}

export function enemyHpBarRect(
  spriteX: number,
  barTop: number,
  scale: number,
  spriteSize: number
): HpBarRect {
  const spriteW = spriteSize * scale;
  const barW = ENEMY_HP_BAR_W * scale;
  const barH = ENEMY_HP_BAR_H * scale;
  const left = spriteX + (spriteW - barW) / 2;
  return {
    left,
    top: barTop,
    right: left + barW,
    bottom: barTop + barH,
  };
}

export function hpBarRectsOverlap(a: HpBarRect, b: HpBarRect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

export function hpBarRectsOverlapHorizontally(a: HpBarRect, b: HpBarRect): boolean {
  return a.left < b.right && b.left < a.right;
}

/** 前線（左）→ 後方（右）の順に HP バー top を確定。右側ほど半分重ねて上へずらす。 */
export function computeEnemyHpBarTops(
  enemies: EnemyHpBarLayoutInput[],
  scale: number,
  spriteSize: number
): Map<string, number> {
  const placed: HpBarRect[] = [];
  const tops = new Map<string, number>();
  const sorted = [...enemies].sort((a, b) => a.x - b.x);
  const stackOverlap = ENEMY_HP_BAR_STACK_OVERLAP * scale;

  for (const layout of sorted) {
    let top = defaultEnemyHpBarTop(layout.y, scale, spriteSize);
    for (const placedBar of placed) {
      const candidate = enemyHpBarRect(layout.x, top, scale, spriteSize);
      if (hpBarRectsOverlapHorizontally(candidate, placedBar)) {
        top = Math.min(top, placedBar.top - stackOverlap);
      }
    }
    const rect = enemyHpBarRect(layout.x, top, scale, spriteSize);
    tops.set(layout.id, top);
    placed.push(rect);
  }

  return tops;
}
