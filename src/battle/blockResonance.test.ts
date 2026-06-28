import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  addBlockResonanceStacksOnBlock,
  consumeBlockResonanceStacks,
  getBlockResonanceStacks,
  mergeBlockResonancePassives,
  resolveEffectiveUseDurationSec,
  setBlockResonanceStacks,
  syncBlockResonanceAuras,
  tickBlockResonanceDecay,
} from './blockResonance.ts';
import { getDamageTakenMultiplier } from './combatMath.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 30,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['df_guardian_passive_3'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_guardian',
    iconKey: 'df_guardian',
    isEnemy: false,
    battleX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

const blockResonancePassive: PassiveSkillDef = {
  id: 'df_guardian_passive_3',
  name: '迎撃態勢',
  effect: 'blockResonance',
  chance: 0.1,
  blockResonanceMaxStacks: 6,
  blockResonanceDamageTakenPerStack: 0.03,
  blockResonanceDecayIntervalSec: 8,
};

describe('blockResonance stacks', () => {
  const config = mergeBlockResonancePassives([blockResonancePassive]);

  it('adds stack on block up to max 6', () => {
    const unit = mockUnit({ id: 'g1' });
    syncBlockResonanceAuras(unit, config);
    for (let i = 0; i < 7; i++) {
      addBlockResonanceStacksOnBlock(unit, config);
    }
    expect(getBlockResonanceStacks(unit)).toBe(6);
    const stackEffect = unit.statusEffects.find(
      (effect) => effect.overlay === 'blockResonance',
    );
    expect(stackEffect?.displayName).toBe('防壁');
  });

  it('decays one stack per interval', () => {
    const unit = mockUnit({ id: 'g2' });
    setBlockResonanceStacks(unit, 3, unit.id);
    tickBlockResonanceDecay(unit, 8, config);
    expect(getBlockResonanceStacks(unit)).toBe(2);
  });

  it('applies per-stack damageTaken reduction', () => {
    const unit = mockUnit({ id: 'g3' });
    setBlockResonanceStacks(unit, 4, unit.id);
    syncBlockResonanceAuras(unit, config);
    expect(getDamageTakenMultiplier(unit)).toBeCloseTo(0.88, 5);
  });

  it('consume clears stacks', () => {
    const unit = mockUnit({ id: 'g4' });
    setBlockResonanceStacks(unit, 5, unit.id);
    expect(consumeBlockResonanceStacks(unit)).toBe(5);
    expect(getBlockResonanceStacks(unit)).toBe(0);
  });
});

describe('resolveEffectiveUseDurationSec', () => {
  it('adds consumed stacks to base duration for blockResonanceConsume', () => {
    const skill = {
      id: 'df_guardian_active_4',
      name: '城塞の構え',
      trigger: { kind: 'hitsTaken' as const, value: 8 },
      effect: [{ type: 'blockResonanceConsume' as const }],
      useDurationSec: 2,
      blockResonanceStanceDurationBaseSec: 2,
    };
    const consumed = new Map([['actor1', 3]]);
    expect(resolveEffectiveUseDurationSec(skill, 'actor1', consumed)).toBe(5);
  });
});

describe('blockResonance game data', () => {
  it('loads df_guardian blockResonance passive from JSON', async () => {
    const { loadGameData } = await import('./data/loadGameData.ts');
    const gameData = loadGameData();
    const passive = gameData.skillRegistry.passives.df_guardian_passive_3;
    expect(passive?.effect).toBe('blockResonance');
    expect(passive?.blockResonanceMaxStacks).toBe(6);
    const active4 = gameData.skillRegistry.actives.df_guardian_active_4;
    expect(active4?.effect[0]?.type).toBe('blockResonanceConsume');
    expect(active4?.fireConditions?.[0]).toMatchObject({
      kind: 'blockResonanceStacks',
      min: 1,
    });
  });
});
