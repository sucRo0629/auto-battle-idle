import { describe, expect, it, vi } from 'vitest';
import { PLACEHOLDER_SPRITE_KEYS } from '../battle/classVisuals.ts';
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
  resolveEnemySpriteKey,
} from './entityVisuals.ts';

vi.mock('./classIconAssets.ts', () => ({
  hasClassIconAsset: (classId: string) => classId === 'df_guardian',
}));

vi.mock('./spriteAssets.ts', () => ({
  hasEntitySpriteAsset: (entityId: string) => entityId === 'stage1_1',
}));

const testTraits = {
  rangePx: 0,
  damageType: 'physical' as const,
  basicAttackVfx: { enabled: true },
};

const defenderPreset = {
  id: 'df_guardian',
  role: 'defender' as const,
  traits: testTraits,
};

const warriorPreset = {
  id: 'at_warrior',
  role: 'attacker' as const,
  traits: testTraits,
};

const rangedEnemy = {
  id: 'test_ranged',
  traits: {
    rangePx: 100,
    damageType: 'physical' as const,
    basicAttackVfx: { enabled: true },
  },
};

describe('entityVisuals', () => {
  it('uses class id when class icon asset exists', () => {
    expect(resolveClassIconKey(defenderPreset)).toBe('df_guardian');
  });

  it('falls back to role placeholder when class icon asset is missing', () => {
    expect(resolveClassIconKey(warriorPreset)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerMelee,
    );
  });

  it('uses class id when sprite asset exists', () => {
    expect(resolveClassSpriteKey({ ...defenderPreset, id: 'stage1_1' })).toBe(
      'stage1_1',
    );
  });

  it('falls back to role placeholder when sprite asset is missing', () => {
    expect(resolveClassSpriteKey(warriorPreset)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerMelee,
    );
  });

  it('uses enemy id when sprite asset exists', () => {
    expect(
      resolveEnemySpriteKey({ id: 'stage1_1', traits: testTraits }),
    ).toBe(
      'stage1_1',
    );
  });

  it('falls back to ranged attacker placeholder for ranged enemies without assets', () => {
    expect(resolveEnemySpriteKey(rangedEnemy)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical,
    );
  });
});
