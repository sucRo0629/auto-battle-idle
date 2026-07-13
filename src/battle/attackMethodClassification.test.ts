import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveUnitAttackMethod } from './data/resolveUnitAttackMethod.ts';
import { matchesAttackType } from './skills/targetSpec.ts';
import { createAllyFromMember } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import type { CombatantState } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function unitWithBasic(
  skillId: string,
  overrides: Partial<CombatantState> = {},
): CombatantState {
  return {
    id: 'u1',
    name: 'u1',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 300, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [{ skillId, remaining: 0, slotKind: 'basic' }],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: true,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

describe('resolveUnitAttackMethod', () => {
  const gameData = loadGameData();

  it('resolves ranged from damage basic skill', () => {
    const unit = unitWithBasic('at_ranger_basic_attack');
    expect(resolveUnitAttackMethod(unit, gameData)).toBe('ranged');
  });

  it('returns undefined for heal-only cleric basic', () => {
    const unit = unitWithBasic('sp_cleric_mod_single_mend');
    expect(resolveUnitAttackMethod(unit, gameData)).toBeUndefined();
  });

  it('changes when combat module basic slot changes', () => {
    const preset = gameData.classRegistry.df_guardian!;
    const melee = createAllyFromMember(
      {
        classId: 'df_guardian',
        build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
        progress: { level: 10, exp: 0 },
      },
      preset,
      levelCurves,
      gameData,
      'df_guardian_mod_nearest_strike',
    );
    const buff = createAllyFromMember(
      {
        classId: 'df_guardian',
        build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
        progress: { level: 10, exp: 0 },
      },
      preset,
      levelCurves,
      gameData,
      'df_guardian_mod_guard_focus',
    );
    expect(resolveUnitAttackMethod(melee, gameData)).toBe('melee');
    expect(resolveUnitAttackMethod(buff, gameData)).toBeUndefined();
  });
});

describe('matchesAttackType ranged pool', () => {
  const gameData = loadGameData();
  const rangedSpec = { kind: 'attackType' as const, ranged: true };

  it('includes ranged damage enemies and excludes heal-only supporters', () => {
    const ranged = unitWithBasic('at_sorcerer_basic_attack');
    const healer = unitWithBasic('sp_cleric_mod_single_mend', {
      role: 'supporter',
      traits: { rangePx: 110, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    expect(matchesAttackType(ranged, rangedSpec, gameData)).toBe(true);
    expect(matchesAttackType(healer, rangedSpec, gameData)).toBe(false);
  });
});
