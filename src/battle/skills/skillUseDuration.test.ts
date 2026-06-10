import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData, SkillCooldown } from '../types.ts';
import { SkillExecutor } from './SkillExecutor.ts';
import { SkillSequenceRunner } from './skillSequence.ts';

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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
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
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

describe('skillUseDuration', () => {
  it('blocks basic attack while active useDurationSec lock is active', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 100 });
    const activeSkill: ActiveSkillDef = {
      id: 'burst',
      name: 'burst',
      trigger: { kind: 'time', value: 5 },
      useDurationSec: 0.5,
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const basicSkill: ActiveSkillDef = {
      id: 'basic',
      name: 'basic',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const data: GameData = {
      skillRegistry: {
        passives: {},
        actives: { burst: activeSkill, basic: basicSkill },
      },
    } as unknown as GameData;

    const activeCd: SkillCooldown = {
      skillId: 'burst',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    const basicCd: SkillCooldown = {
      skillId: 'basic',
      remaining: 0,
      slotKind: 'basic',
    };
    actor.cooldowns = [basicCd, activeCd];

    let basicHits = 0;
    const executor = new SkillExecutor(data, (event) => {
      if (event.type === 'skill' && event.skillId === 'basic') {
        basicHits += 1;
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    executor.tryExecute(actor, activeCd, [actor], [enemy]);
    expect(runner.isActorBusy('actor')).toBe(true);
    expect(enemy.hp).toBeLessThan(100);

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(basicHits).toBe(0);

    runner.tickUseLocks(0.5);
    expect(runner.isActorBusy('actor')).toBe(false);

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(basicHits).toBe(1);
  });
});
