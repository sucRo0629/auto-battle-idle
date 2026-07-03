import { describe, expect, it } from 'vitest';
import type { CombatantLayout } from './IBattleRenderer.ts';
import { resolveVfxWorldPosition } from './vfxPlacement.ts';

function layout(id: string, x: number, y: number): CombatantLayout {
  return {
    id,
    x,
    y,
    spriteKey: 'test',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isEnemy: false,
    isAlive: true,
    anim: 'idle',
    animFrame: 0,
    attackSheetKey: 'attack',
    skillAnimKey: null,
    skillAnimFrame: 0,
    statusEffects: [],
  };
}

describe('vfxPlacement', () => {
  const spriteSize = 32;

  it('places footActor at source foot center', () => {
    const source = layout('a', 100, 200);
    const target = layout('b', 200, 200);
    const pos = resolveVfxWorldPosition(
      { anchor: 'footActor' },
      source,
      target,
      spriteSize,
    );
    expect(pos).toEqual({ x: 116, y: 232 });
  });

  it('places footTarget at target foot center', () => {
    const source = layout('a', 100, 200);
    const target = layout('b', 200, 200);
    const pos = resolveVfxWorldPosition(
      { anchor: 'footTarget' },
      source,
      target,
      spriteSize,
    );
    expect(pos).toEqual({ x: 216, y: 232 });
  });

  it('applies placement offsets', () => {
    const source = layout('a', 0, 0);
    const target = layout('b', 64, 0);
    const pos = resolveVfxWorldPosition(
      { anchor: 'footActor', offsetX: 5, offsetY: -3 },
      source,
      target,
      spriteSize,
    );
    expect(pos).toEqual({ x: 21, y: 29 });
  });
});
