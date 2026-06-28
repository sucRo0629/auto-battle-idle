import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData } from '../types.ts';
import { evaluateConditions, type ConditionEvalContext } from './effectConditions.ts';

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
      basicAttackVfx: { enabled: true },
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
    corpseVisible: true,
    ...overrides,
  };
}

function buildHealCtx(
  skill: ActiveSkillDef,
  actor: CombatantState,
  allies: CombatantState[],
): ConditionEvalContext {
  return {
    actor,
    allies,
    enemies: [],
    passives: [],
    gameData: { skillRegistry: { actives: {}, passives: {} } } as GameData,
    referenceEffect: skill.effect[0],
  };
}

describe('targetHp fire condition for ally heals', () => {
  it('all allies: fires when any ally is at or below threshold', () => {
    const healer = mockUnit({ id: 'healer', battleX: 200 });
    const front = mockUnit({ id: 'front', battleX: 180, hp: 80, maxHp: 100 });
    const back = mockUnit({ id: 'back', battleX: 220, hp: 40, maxHp: 100 });
    const skill: ActiveSkillDef = {
      id: 'area_heal',
      name: 'area heal',
      trigger: { kind: 'time', value: 12 },
      firePolicy: 'smart',
      fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }],
      effect: [
        {
          type: 'heal',
          healSubKind: 'instant',
          amount: { kind: 'flat', flatAmount: 10 },
          target: { kind: 'all', side: 'ally' },
        },
      ],
    };

    expect(
      evaluateConditions(buildHealCtx(skill, healer, [healer, front, back]), [
        { kind: 'targetHp', maxHpRatio: 0.5 },
      ]),
    ).toBe(true);
  });

  it('all allies: does not fire when every ally is above threshold', () => {
    const healer = mockUnit({ id: 'healer', battleX: 200 });
    const ally = mockUnit({ id: 'ally', battleX: 180, hp: 80, maxHp: 100 });
    const skill: ActiveSkillDef = {
      id: 'area_heal',
      name: 'area heal',
      trigger: { kind: 'time', value: 12 },
      effect: [
        {
          type: 'heal',
          healSubKind: 'instant',
          amount: { kind: 'flat', flatAmount: 10 },
          target: { kind: 'all', side: 'ally' },
        },
      ],
    };

    expect(
      evaluateConditions(buildHealCtx(skill, healer, [healer, ally]), [
        { kind: 'targetHp', maxHpRatio: 0.5 },
      ]),
    ).toBe(false);
  });

  it('hp ratio: fires when caster is the most damaged ally', () => {
    const healer = mockUnit({ id: 'healer', battleX: 200, hp: 40, maxHp: 100 });
    const ally = mockUnit({ id: 'ally', battleX: 180, hp: 100, maxHp: 100 });
    const skill: ActiveSkillDef = {
      id: 'smart_heal',
      name: 'smart heal',
      trigger: { kind: 'time', value: 15 },
      effect: [
        {
          type: 'heal',
          healSubKind: 'instant',
          amount: { kind: 'flat', flatAmount: 10 },
          target: {
            kind: 'stat',
            side: 'ally',
            stat: 'hp',
            order: 'ratio',
          },
          targetShape: 'multiLock',
          hitCount: 3,
        },
      ],
    };

    expect(
      evaluateConditions(buildHealCtx(skill, healer, [healer, ally]), [
        { kind: 'targetHp', maxHpRatio: 0.5 },
      ]),
    ).toBe(true);
  });

  it('hp ratio: uses minimum hp ratio among in-range allies', () => {
    const healer = mockUnit({ id: 'healer', battleX: 200 });
    const wounded = mockUnit({ id: 'wounded', battleX: 180, hp: 45, maxHp: 100 });
    const healthy = mockUnit({ id: 'healthy', battleX: 220, hp: 90, maxHp: 100 });
    const skill: ActiveSkillDef = {
      id: 'smart_heal',
      name: 'smart heal',
      trigger: { kind: 'time', value: 15 },
      effect: [
        {
          type: 'heal',
          healSubKind: 'instant',
          amount: { kind: 'flat', flatAmount: 10 },
          target: {
            kind: 'stat',
            side: 'ally',
            stat: 'hp',
            order: 'ratio',
          },
        },
      ],
    };

    expect(
      evaluateConditions(buildHealCtx(skill, healer, [healer, wounded, healthy]), [
        { kind: 'targetHp', maxHpRatio: 0.5 },
      ]),
    ).toBe(true);
  });
});
