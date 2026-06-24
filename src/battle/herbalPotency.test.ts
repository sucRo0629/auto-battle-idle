import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  addHerbalPotencyStacks,
  allyHasHerbalistHot,
  consumeHerbalPotencyStacks,
  getHerbalPotencyStacks,
  mergeHerbalPotencyPassives,
  resolveHerbalPotencyHotBonus,
  syncHerbalPotencyAuras,
  tickHerbalPotencyAccumulation,
} from './herbalPotency.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function mockAlly(overrides: Partial<CombatantState> & { id: string }): CombatantState {
  return {
    id: overrides.id,
    name: overrides.id,
    hp: overrides.hp ?? 100,
    maxHp: overrides.maxHp ?? 100,
    barrierHp: 0,
    atk: 50,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'supporter',
    classId: overrides.classId ?? 'warrior',
    formationRow: 'front',
    traits: { rangePx: 70, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: overrides.statusEffects ?? [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

describe('herbalPotency merge', () => {
  it('merges maxStacks from multiple passives (6 + 9 → 9)', () => {
    const merged = mergeHerbalPotencyPassives([
      { id: 'p1', name: 'p1', effect: 'herbalPotency', herbalPotencyMaxStacks: 6 },
      { id: 'p4', name: 'p4', effect: 'herbalPotency', herbalPotencyMaxStacks: 9 },
    ] as PassiveSkillDef[]);
    expect(merged.maxStacks).toBe(9);
  });
});

describe('herbalPotency stacks', () => {
  it('accumulates and clamps to maxStacks', () => {
    const target = mockAlly({ id: 'ally1' });
    addHerbalPotencyStacks(target, 4, 6, 'herb1');
    expect(getHerbalPotencyStacks(target)).toBe(4);
    addHerbalPotencyStacks(target, 5, 6, 'herb1');
    expect(getHerbalPotencyStacks(target)).toBe(6);
  });

  it('consumes stacks without touching constitution tier', () => {
    const target = mockAlly({ id: 'ally1', herbalPotencyConstitutionTier: 2 });
    addHerbalPotencyStacks(target, 5, 9, 'herb1');
    expect(consumeHerbalPotencyStacks(target)).toBe(5);
    expect(getHerbalPotencyStacks(target)).toBe(0);
    expect(target.herbalPotencyConstitutionTier).toBe(2);
  });
});

describe('herbalPotency hot bonus', () => {
  it('adds percentMaxHp per stack', () => {
    const target = mockAlly({ id: 'ally1', maxHp: 1000 });
    addHerbalPotencyStacks(target, 4, 6, 'herb1');
    const bonus = resolveHerbalPotencyHotBonus(target, {
      maxStacks: 6,
      hotPerStackPercent: 0.0005,
      constitutionThresholds: [],
      constitutionHpMultipliers: [],
    });
    expect(bonus).toBe(2);
  });
});

describe('herbalPotency accumulation tick', () => {
  it('adds stack every 3 seconds when herbalist HoT is present', () => {
    const herbalist = mockAlly({
      id: 'herb',
      classId: 'sp_alchemist',
      build: {
        learnedPassiveIds: ['sp_alchemist_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally1',
      statusEffects: [
        {
          id: 'hot1',
          kind: 'buff',
          overlay: 'hot',
          amount: { kind: 'percentMaxHp', percentOfMaxHp: 0.004 },
          sourceId: herbalist.id,
          skillId: 'sp_alchemist_passive_1',
          multiplier: 1,
          durationSec: 99,
          remainingSec: 99,
        },
      ],
    });
    const gameData = loadGameData();
    const passives = gameData.skillRegistry.passives;
    tickHerbalPotencyAccumulation([herbalist, ally], passives, 3);
    expect(getHerbalPotencyStacks(ally)).toBe(1);
    tickHerbalPotencyAccumulation([herbalist, ally], passives, 3);
    expect(getHerbalPotencyStacks(ally)).toBe(2);
  });
});

describe('herbalPotency game data', () => {
  it('loads sp_alchemist herbalPotency passives from JSON', () => {
    const { passives, actives } = loadGameData().skillRegistry;
    expect(passives['sp_alchemist_passive_1']?.effect).toBe('herbalPotency');
    expect(passives['sp_alchemist_passive_4']?.herbalPotencyMaxStacks).toBe(9);
    expect(actives['sp_alchemist_active_4']?.effect[0]?.type).toBe(
      'herbalPotencyConsume',
    );
  });
});

describe('allyHasHerbalistHot', () => {
  it('detects HoT from sp_alchemist source', () => {
    const herbalist = mockAlly({ id: 'herb', classId: 'sp_alchemist' });
    const ally = mockAlly({
      id: 'ally1',
      statusEffects: [
        {
          id: 'hot',
          kind: 'buff',
          overlay: 'hot',
          sourceId: herbalist.id,
          skillId: 'sp_alchemist_basic_attack',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    expect(allyHasHerbalistHot(ally, [herbalist, ally])).toBe(true);
  });
});

describe('syncHerbalPotencyAuras', () => {
  it('applies party aura HoT from passive_1', () => {
    const gameData = loadGameData();
    const herbalist = mockAlly({
      id: 'herb',
      classId: 'sp_alchemist',
      build: {
        learnedPassiveIds: ['sp_alchemist_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({ id: 'ally1' });
    syncHerbalPotencyAuras(
      [herbalist, ally],
      [],
      gameData.skillRegistry.passives,
      gameData,
    );
    expect(
      ally.statusEffects.some(
        (e) => e.overlay === 'hot' && e.skillId === 'sp_alchemist_passive_1',
      ),
    ).toBe(true);
  });
});
