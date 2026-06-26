import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALLY_ATTACK_FOLLOW_UP_OVERLAY,
  allyWithinFollowUpRadiusPx,
  buildAllyAttackFollowUpPendingHit,
  findFollowUpLancersForAllyBasic,
  getAllyAttackFollowUpConfig,
} from './allyAttackFollowUp.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  PendingSkillHit,
} from './types.ts';
import { mockCombatant } from './testFixtures.ts';

function withFollowUpOverlay(
  unit: CombatantState,
  radiusPx = 70,
): CombatantState {
  unit.statusEffects.push({
    id: 'follow_up_mode',
    kind: 'buff',
    overlay: ALLY_ATTACK_FOLLOW_UP_OVERLAY,
    multiplier: 1,
    durationSec: 8,
    remainingSec: 8,
    allyFollowUpRadiusPx: radiusPx,
    followUpDefDebuffMultiplier: 0.95,
    followUpDefDebuffDurationSec: 5,
    displayName: '追撃モード',
  });
  return unit;
}

describe('allyAttackFollowUp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds lancers within radius but excludes self and far allies', () => {
    const lancer = withFollowUpOverlay(
      mockCombatant({ id: 'lancer', battleX: 100 }),
    );
    const nearAlly = mockCombatant({ id: 'near', battleX: 150 });
    const farAlly = mockCombatant({ id: 'far', battleX: 200 });

    expect(allyWithinFollowUpRadiusPx(lancer, nearAlly, 70)).toBe(true);
    expect(allyWithinFollowUpRadiusPx(lancer, farAlly, 70)).toBe(false);
    expect(findFollowUpLancersForAllyBasic(nearAlly, [lancer, nearAlly])).toEqual(
      [lancer],
    );
    expect(findFollowUpLancersForAllyBasic(lancer, [lancer, nearAlly])).toEqual(
      [],
    );
    expect(findFollowUpLancersForAllyBasic(farAlly, [lancer, farAlly])).toEqual(
      [],
    );
  });

  it('enqueues lancer basic follow-up after nearby ally basic hit', () => {
    const basicSkill: ActiveSkillDef = {
      id: 'at_lancer_basic_attack',
      name: 'basic',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          targetShape: 'pierce',
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
          amount: { kind: 'atkBased', atkScale: 0.95 },
        },
      ],
    };
    const warriorBasic: ActiveSkillDef = {
      id: 'at_warrior_basic_attack',
      name: 'warrior basic',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'flat', flatAmount: 10 },
          targetShape: 'single',
        },
      ],
    };
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: {
          [basicSkill.id]: basicSkill,
          [warriorBasic.id]: warriorBasic,
        },
      },
    };
    const lancer = withFollowUpOverlay(
      mockCombatant({
        id: 'lancer',
        atk: 40,
        battleX: 100,
        cooldowns: [
          { skillId: basicSkill.id, remaining: 0, slotKind: 'basic' },
        ],
      }),
    );
    const warrior = mockCombatant({
      id: 'warrior',
      atk: 30,
      battleX: 140,
      cooldowns: [
        { skillId: warriorBasic.id, remaining: 0, slotKind: 'basic' },
      ],
    });
    const enemy = mockCombatant({
      id: 'enemy',
      hp: 200,
      maxHp: 200,
      def: 0,
      isEnemy: true,
      battleX: 180,
    });
    const pending: PendingSkillHit[] = [];
    const executor = new SkillExecutor(gameData as never, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: (hits) => pending.push(...hits),
      getAllCombatants: () => [lancer, warrior, enemy],
      getSequenceRunner: () => ({
        isActorBusy: () => false,
        isActorInSkillMotion: () => false,
        isBasicAttackBlocked: () => false,
      }),
      onBasicAttackCountCharged: () => {},
      onDamageApplied: () => {},
    });

    executor.applyPendingHit({
      applyAtBattleSec: 0,
      actorId: warrior.id,
      skillId: warriorBasic.id,
      skillName: warriorBasic.name,
      effectDef: warriorBasic.effect[0]!,
      effectIndex: 0,
      slotKind: 'basic',
      hitIndex: 0,
      targets: [{ targetId: enemy.id }],
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.actorId).toBe('lancer');
    expect(pending[0]?.slotKind).toBe('basic');
    expect(pending[0]?.suppressAllyAttackFollowUp).toBe(true);
    expect(pending[0]?.targets[0]?.targetId).toBe('enemy');

    const hpBeforeFollowUp = enemy.hp;
    executor.applyPendingHit(pending[0]!);
    expect(enemy.hp).toBeLessThan(hpBeforeFollowUp);
    expect(
      enemy.statusEffects.some(
        (effect) => effect.stat === 'def' && effect.multiplier === 0.95,
      ),
    ).toBe(true);

    pending.length = 0;
    executor.applyPendingHit({
      applyAtBattleSec: 0,
      actorId: warrior.id,
      skillId: warriorBasic.id,
      skillName: warriorBasic.name,
      effectDef: warriorBasic.effect[0]!,
      effectIndex: 0,
      slotKind: 'basic',
      hitIndex: 0,
      suppressAllyAttackFollowUp: true,
      targets: [{ targetId: enemy.id }],
    });
    expect(pending).toHaveLength(0);
  });

  it('buildAllyAttackFollowUpPendingHit resolves basic skill', () => {
    const lancer = mockCombatant({
      id: 'lancer',
      cooldowns: [
        {
          skillId: 'at_lancer_basic_attack',
          remaining: 0,
          slotKind: 'basic',
        },
      ],
    });
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_lancer_basic_attack: {
            id: 'at_lancer_basic_attack',
            name: 'basic',
            trigger: { kind: 'time', value: 2 },
            effect: [
              {
                type: 'damage',
                amount: { kind: 'flat', flatAmount: 7 },
                target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              },
            ],
          },
        },
      },
    };
    const hit = buildAllyAttackFollowUpPendingHit(
      lancer,
      'enemy-1',
      gameData as never,
      0,
    );
    expect(hit?.actorId).toBe('lancer');
    expect(hit?.targets[0]?.targetId).toBe('enemy-1');
    expect(getAllyAttackFollowUpConfig(lancer)).toBeUndefined();
  });
});
