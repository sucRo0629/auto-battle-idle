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
  basicAttackSkillId: 'df_guardian_basic_attack',
  traits: testTraits,
};

const swordsmanPreset = {
  id: 'at_swordsman',
  role: 'attacker' as const,
  basicAttackSkillId: 'at_swordsman_basic_attack',
  traits: testTraits,
};

const skillRegistry = {
  actives: {
    at_swordsman_basic_attack: {
      id: 'at_swordsman_basic_attack',
      name: 'basic',
      attackMethod: 'melee' as const,
      trigger: { kind: 'time' as const, value: 2 },
      effect: [],
    },
    test_ranged_basic_attack: {
      id: 'test_ranged_basic_attack',
      name: 'bow',
      attackMethod: 'ranged' as const,
      trigger: { kind: 'time' as const, value: 2 },
      effect: [],
    },
  },
};

const rangedEnemy = {
  id: 'test_ranged',
  basicAttackSkillId: 'test_ranged_basic_attack',
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
    expect(resolveClassIconKey(swordsmanPreset, skillRegistry)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerMelee,
    );
  });

  it('uses class id when sprite asset exists', () => {
    expect(resolveClassSpriteKey({ ...defenderPreset, id: 'stage1_1' })).toBe(
      'stage1_1',
    );
  });

  it('falls back to role placeholder when sprite asset is missing', () => {
    expect(resolveClassSpriteKey(swordsmanPreset, skillRegistry)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerMelee,
    );
  });

  it('uses enemy id when sprite asset exists', () => {
    expect(
      resolveEnemySpriteKey({ id: 'stage1_1', traits: testTraits, basicAttackSkillId: 'basic' }),
    ).toBe(
      'stage1_1',
    );
  });

  it('falls back to ranged attacker placeholder for ranged enemies without assets', () => {
    expect(resolveEnemySpriteKey(rangedEnemy, skillRegistry)).toBe(
      PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical,
    );
  });
});
