import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loadGameData.ts';
import { parseSkillEffect } from '../data/validateGameData.ts';
import {
  evaluateConditions,
  resolveConditionalBranchEffects,
} from './effectConditions.ts';
import { SkillExecutor } from './SkillExecutor.ts';
import { SkillSequenceRunner } from './skillSequence.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  ConditionalSkillEffect,
  SkillCooldown,
} from '../types.ts';
import { mockUnit } from './targeting.fixtures.ts';

function mockCombatant(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 50,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'at_sigilist',
    formationRow: 'back',
    traits: {
      rangePx: 200,
      damageType: 'magic',
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

const conditionalEffectJson = {
  type: 'conditionalEffect',
  conditions: [{ kind: 'enemyCount', min: 3, scope: 'inRange' }],
  thenEffects: [
    {
      type: 'damage',
      damageType: 'magic',
      targetShape: 'aoe',
      aoeRadiusPx: 55,
      amount: { kind: 'atkBased', atkScale: 1 },
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    },
  ],
  elseEffects: [
    {
      type: 'damage',
      damageType: 'magic',
      targetShape: 'chain',
      chainCount: 3,
      chainMaxDistancePx: 80,
      amount: { kind: 'atkBased', atkScale: 0.8 },
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    },
  ],
};

describe('conditionalEffect validation', () => {
  it('accepts conditionalEffect with branch effects', () => {
    const effect = parseSkillEffect(conditionalEffectJson, 'test');
    expect(effect.type).toBe('conditionalEffect');
    if (effect.type !== 'conditionalEffect') return;
    expect(effect.thenEffects).toHaveLength(1);
    expect(effect.elseEffects).toHaveLength(1);
    expect(effect.conditions[0]?.kind).toBe('enemyCount');
  });

  it('rejects nested conditionalEffect in branches', () => {
    expect(() =>
      parseSkillEffect(
        {
          ...conditionalEffectJson,
          thenEffects: [
            {
              type: 'conditionalEffect',
              conditions: [{ kind: 'enemyCount', min: 1 }],
              thenEffects: [
                {
                  type: 'damage',
                  amount: { kind: 'flat', flatAmount: 1 },
                  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                },
              ],
              elseEffects: [
                {
                  type: 'damage',
                  amount: { kind: 'flat', flatAmount: 1 },
                  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                },
              ],
            },
          ],
        },
        'test',
      ),
    ).toThrow(/nested conditionalEffect/);
  });

  it('rejects missing branch arrays', () => {
    expect(() =>
      parseSkillEffect(
        {
          type: 'conditionalEffect',
          conditions: [{ kind: 'enemyCount', min: 2 }],
        },
        'test',
      ),
    ).toThrow();
  });
});

describe('conditionalEffect runtime branching', () => {
  const actor = mockCombatant({ id: 'sigilist', battleX: 100 });
  const gameData = loadGameData();

  function buildCtx(enemies: CombatantState[]) {
    const effect = parseSkillEffect(
      conditionalEffectJson,
      'test',
    ) as ConditionalSkillEffect;
    return {
      effect,
      ctx: {
        actor,
        allies: [actor],
        enemies,
        passives: [],
        gameData,
        referenceEffect: effect.thenEffects[0],
      },
    };
  }

  it('selects thenEffects when enemyCount condition is met', () => {
    const enemies = [
      mockUnit('e1', 150, { isEnemy: true }),
      mockUnit('e2', 170, { isEnemy: true }),
      mockUnit('e3', 190, { isEnemy: true }),
    ];
    const { effect, ctx } = buildCtx(enemies);
    expect(evaluateConditions(ctx, effect.conditions)).toBe(true);
    const branch = resolveConditionalBranchEffects(effect, ctx);
    expect(branch[0]?.targetShape).toBe('aoe');
  });

  it('selects elseEffects when enemyCount condition is not met', () => {
    const enemies = [mockUnit('e1', 150, { isEnemy: true })];
    const { effect, ctx } = buildCtx(enemies);
    expect(evaluateConditions(ctx, effect.conditions)).toBe(false);
    const branch = resolveConditionalBranchEffects(effect, ctx);
    expect(branch[0]?.targetShape).toBe('chain');
  });

  it('loads at_sigilist actives with conditionalEffect from game data', () => {
    // at_sigilist の現行 JSON active は設計確定に伴い廃棄。Mark 系スキル実装後に再追加する。
    const active1 = gameData.skillRegistry.actives.at_sigilist_active_1;
    const active2 = gameData.skillRegistry.actives.at_sigilist_active_2;
    expect(active1).toBeUndefined();
    expect(active2).toBeUndefined();
  });
});

describe('SkillExecutor conditionalEffect', () => {
  it('executes the selected branch through tryExecute', () => {
    const gameData = loadGameData();
    const actor = mockCombatant({ id: 'sigilist', battleX: 100 });
    const enemies = [
      mockUnit('e1', 150, { isEnemy: true }),
      mockUnit('e2', 170, { isEnemy: true }),
      mockUnit('e3', 190, { isEnemy: true }),
    ];
    const skill: ActiveSkillDef = {
      id: 'test_conditional',
      name: 'test',
      trigger: { kind: 'time', value: 1 },
      effect: [
        parseSkillEffect(conditionalEffectJson, 'test') as ConditionalSkillEffect,
      ],
    };
    gameData.skillRegistry.actives[skill.id] = skill;

    let damageEvents = 0;
    const cd: SkillCooldown = {
      skillId: skill.id,
      remaining: 0,
      slotKind: 'active',
    };
    actor.cooldowns = [cd];

    const executor = new SkillExecutor(gameData, (event) => {
      if (event.type === 'skill' && event.effect === 'damage') {
        damageEvents += 1;
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getSequenceRunner: () => new SkillSequenceRunner(),
      getAllCombatants: () => [actor, ...enemies],
    });

    expect(executor.tryExecute(actor, cd, [actor], enemies)).toBe(true);
    expect(damageEvents).toBeGreaterThan(0);
  });
});
