import type { CombatantLayout } from "./IBattleRenderer.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";
import { hasEntityAnimSheet } from "./spriteFrameDraw.ts";
import { SPRITE_LAYOUT_SIZE } from "./spriteLayout.ts";
import { spriteDrawY } from "./spriteVisualDepth.ts";

export function resolveCombatantSpriteBounds(
  layout: CombatantLayout,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  const size = SPRITE_LAYOUT_SIZE * scale;
  const drawY = spriteDrawY(layout);
  const showingSkillAnim = layout.skillAnimKey !== null;
  const offsetY =
    showingSkillAnim ||
    hasEntityAnimSheet(
      layout.spriteKey,
      layout.anim,
      layout.attackSheetKey,
    )
      ? 0
      : getPlaceholderSpriteYOffset(layout, scale);

  return {
    left: layout.x,
    top: drawY + offsetY,
    width: size,
    height: size,
  };
}

export function pickCombatantAtCanvasPoint(
  layouts: readonly CombatantLayout[],
  canvasX: number,
  canvasY: number,
  scale = 1,
): CombatantLayout | null {
  const hits: CombatantLayout[] = [];
  for (const layout of layouts) {
    if (!layout.isAlive) continue;
    const bounds = resolveCombatantSpriteBounds(layout, scale);
    if (
      canvasX >= bounds.left &&
      canvasX <= bounds.left + bounds.width &&
      canvasY >= bounds.top &&
      canvasY <= bounds.top + bounds.height
    ) {
      hits.push(layout);
    }
  }

  if (hits.length === 0) return null;

  // Prefer the visually front-most sprite (lower on screen = closer to camera).
  hits.sort((a, b) => spriteDrawY(b) - spriteDrawY(a));
  return hits[0] ?? null;
}
