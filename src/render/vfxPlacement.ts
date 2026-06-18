import type { VfxPlacement } from '../battle/types.ts';
import type { CombatantLayout } from './IBattleRenderer.ts';
import { getPlaceholderSpriteYOffset } from './placeholderSpriteAnim.ts';
import { SPRITE_LAYOUT_SIZE } from './spriteLayout.ts';
import { spriteDrawY } from './spriteVisualDepth.ts';

export interface VfxWorldPosition {
  x: number;
  y: number;
}

function layoutScale(spriteSize: number): number {
  return spriteSize / SPRITE_LAYOUT_SIZE;
}

function getCombatantCenter(
  layout: CombatantLayout,
  spriteSize: number,
): { x: number; y: number } {
  const scale = layoutScale(spriteSize);
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: spriteDrawY(layout) + bob + spriteSize / 2,
  };
}

/** 足元中央（entity layout 箱の下辺中央） */
function getCombatantFoot(
  layout: CombatantLayout,
  spriteSize: number,
): { x: number; y: number } {
  const scale = layoutScale(spriteSize);
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: spriteDrawY(layout) + bob + spriteSize,
  };
}

export function resolveVfxWorldPosition(
  placement: VfxPlacement,
  sourceLayout: CombatantLayout,
  targetLayout: CombatantLayout,
  spriteSize: number,
): VfxWorldPosition {
  let base: { x: number; y: number };

  switch (placement.anchor) {
    case 'actor':
      base = getCombatantCenter(sourceLayout, spriteSize);
      break;
    case 'target':
      base = getCombatantCenter(targetLayout, spriteSize);
      break;
    case 'footActor':
      base = getCombatantFoot(sourceLayout, spriteSize);
      break;
    case 'footTarget':
      base = getCombatantFoot(targetLayout, spriteSize);
      break;
    case 'between': {
      const source = getCombatantCenter(sourceLayout, spriteSize);
      const target = getCombatantCenter(targetLayout, spriteSize);
      base = {
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2,
      };
      break;
    }
    default:
      base = getCombatantFoot(sourceLayout, spriteSize);
  }

  return {
    x: base.x + (placement.offsetX ?? 0),
    y: base.y + (placement.offsetY ?? 0),
  };
}
