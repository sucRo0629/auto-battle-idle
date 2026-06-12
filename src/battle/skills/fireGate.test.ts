import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData } from '../types.ts';
import { shouldFireActiveSkill, type FireGateContext } from './fireGate.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: 999,
      damageType: 'physical',
      basicAttackVfx: { preset: 'slash' },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

function buildCtx(
  skill: ActiveSkillDef,
  actor: CombatantState,
  enemies: CombatantState[],
): FireGateContext {
  return {
    actor,
    allies: [actor],
    enemies,
    skill,
    passives: [],
    gameData: { skillRegistry: { actives: {}, passives: {} } } as GameData,
    battleTimeSec: 0,
    isWaveStartPhase: false,
    isWaveEndPhase: false,
  };
}

describe('shouldFireActiveSkill targetHp compare', () => {
  const skill: ActiveSkillDef = {
    id: 'test',
    name: 'test',
    trigger: { kind: 'time', value: 5 },
    firePolicy: 'smart',
    effect: [
      {
        kind: 'damage',
        target: { kind: 'enemy', side: 'enemy', count: 1 },
        damageType: 'physical',
      },
    ],
  };

  it('fires when target HP is at or below threshold (lte, default)', () => {
    const actor = mockUnit({ id: 'hero' });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 40, maxHp: 100 });
    const ctx = buildCtx(
      { ...skill, fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }] },
      actor,
      [enemy],
    );
    expect(shouldFireActiveSkill(ctx)).toBe(true);
  });

  it('does not fire when target HP is above threshold (lte)', () => {
    const actor = mockUnit({ id: 'hero' });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 60, maxHp: 100 });
    const ctx = buildCtx(
      { ...skill, fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }] },
      actor,
      [enemy],
    );
    expect(shouldFireActiveSkill(ctx)).toBe(false);
  });

  it('fires when target HP is at or above threshold (gte)', () => {
    const actor = mockUnit({ id: 'hero' });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 90, maxHp: 100 });
    const ctx = buildCtx(
      {
        ...skill,
        fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.9, compare: 'gte' }],
      },
      actor,
      [enemy],
    );
    expect(shouldFireActiveSkill(ctx)).toBe(true);
  });

  it('does not fire when target HP is below threshold (gte)', () => {
    const actor = mockUnit({ id: 'hero' });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 80, maxHp: 100 });
    const ctx = buildCtx(
      {
        ...skill,
        fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.9, compare: 'gte' }],
      },
      actor,
      [enemy],
    );
    expect(shouldFireActiveSkill(ctx)).toBe(false);
  });
});
