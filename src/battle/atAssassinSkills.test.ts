import { describe, expect, it, vi } from 'vitest';
import { resolveDamage } from './combatMath.ts';
import { shouldTriggerBonusBasicAttackOnHit } from './bonusBasicAttackOnHit.ts';
import { shouldFireActiveSkill } from './skills/fireGate.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { mockCombatant } from './testFixtures.ts';
import type {
  ActiveSkillDef,
  PassiveSkillDef,
  PendingSkillHit,
} from './types.ts';

describe('at_assassin combat mechanics', () => {
  const baseEffect = {
    type: 'damage' as const,
    target: { kind: 'distance' as const, side: 'enemy' as const, order: 'nearest' as const },
    damageType: 'physical' as const,
    amount: { kind: 'flat' as const, flatAmount: 100 },
  };

  const p3Passives: Record<string, PassiveSkillDef> = {
    at_assassin_passive_3: {
      id: 'at_assassin_passive_3',
      name: '刈り取り',
      effect: 'specialEffect',
      specialEffectApplyTo: 'damage',
      specialEffect: {
        scale: 1.2,
        conditions: [{ kind: 'targetHp', maxHpRatio: 0.3 }],
      },
      defenseIgnore: {
        def: { mode: 'percent', amount: 1 },
      },
    },
  };

  it('P3 applies 1.2x damage and full DEF ignore on low HP targets', () => {
    const attacker = mockCombatant({
      atk: 100,
      build: {
        learnedPassiveIds: ['at_assassin_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const lowHpTarget = mockCombatant({ def: 80, hp: 20, maxHp: 100, isEnemy: true });
    const highHpTarget = mockCombatant({ def: 80, hp: 80, maxHp: 100, isEnemy: true });

    const lowHpDamage = resolveDamage(attacker, lowHpTarget, baseEffect, p3Passives);
    const highHpDamage = resolveDamage(attacker, highHpTarget, baseEffect, p3Passives);
    const highHpBaseline = resolveDamage(
      mockCombatant({ atk: 100 }),
      highHpTarget,
      baseEffect,
      {},
    );

    expect(lowHpDamage).toBeGreaterThan(highHpDamage);
    expect(highHpDamage).toBe(highHpBaseline);
  });

  it('A3 fires only when the primary target has bleed', () => {
    const actor = mockCombatant({ id: 'assassin' });
    const enemyWithBleed = mockCombatant({
      id: 'enemy-bleed',
      isEnemy: true,
      statusEffects: [
        {
          id: 'bleed',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'bleed',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const enemyClean = mockCombatant({ id: 'enemy-clean', isEnemy: true });
    const skill: ActiveSkillDef = {
      id: 'at_assassin_active_3',
      name: '失血刻印',
      trigger: { kind: 'time', value: 12 },
      firePolicy: 'smart',
      fireConditions: [{ kind: 'debuff', tags: ['bleed'] }],
      effect: [
        {
          type: 'debuff',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          debuffSubKind: 'stat',
          debuffStat: 'damageTaken',
          debuffMultiplier: 1.2,
          debuffDurationSec: 5,
        },
      ],
    };
    const gameData = { skillRegistry: { passives: {}, actives: {} } } as never;

    expect(
      shouldFireActiveSkill({
        actor,
        allies: [actor],
        enemies: [enemyWithBleed],
        skill,
        passives: [],
        gameData,
        battleTimeSec: 0,
        isWaveStartPhase: false,
        isWaveEndPhase: false,
      }),
    ).toBe(true);
    expect(
      shouldFireActiveSkill({
        actor,
        allies: [actor],
        enemies: [enemyClean],
        skill,
        passives: [],
        gameData,
        battleTimeSec: 0,
        isWaveStartPhase: false,
        isWaveEndPhase: false,
      }),
    ).toBe(false);
  });

  it('A3 applies damageTaken debuff without instant damage', () => {
    const gameData = {
      skillRegistry: {
        passives: {} as Record<string, PassiveSkillDef>,
        actives: {} as Record<string, ActiveSkillDef>,
      },
    };
    const actor = mockCombatant({
      id: 'assassin',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: ['at_assassin_active_3'],
        equippedActiveSlots: [],
      },
    });
    const enemy = mockCombatant({
      id: 'enemy',
      hp: 100,
      maxHp: 100,
      def: 0,
      isEnemy: true,
      statusEffects: [
        {
          id: 'bleed',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'bleed',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const executor = new SkillExecutor(gameData as never, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => ({
        isActorBusy: () => false,
        isActorInSkillMotion: () => false,
        isBasicAttackBlocked: () => false,
      }),
      onBasicAttackCountCharged: () => {},
      onDamageApplied: () => {},
    });

    const skill: ActiveSkillDef = {
      id: 'at_assassin_active_3',
      name: '失血刻印',
      trigger: { kind: 'time', value: 12 },
      firePolicy: 'smart',
      fireConditions: [{ kind: 'debuff', tags: ['bleed'] }],
      effect: [
        {
          type: 'debuff',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          debuffSubKind: 'stat',
          debuffStat: 'damageTaken',
          debuffMultiplier: 1.2,
          debuffDurationSec: 5,
        },
      ],
    };
    gameData.skillRegistry.actives = { [skill.id]: skill };

    const hpBefore = enemy.hp;
    executor.applyPendingHit({
      applyAtBattleSec: 0,
      actorId: actor.id,
      skillId: skill.id,
      skillName: skill.name,
      effectDef: skill.effect[0]!,
      effectIndex: 0,
      slotKind: 'active',
      hitIndex: 0,
      targets: [{ targetId: enemy.id }],
    });

    expect(enemy.hp).toBe(hpBefore);
    expect(enemy.statusEffects.some((effect) => effect.stat === 'damageTaken')).toBe(
      true,
    );
  });

  it('P4 triggers bonus basic hit only on low HP targets when chance succeeds', () => {
    vi.restoreAllMocks();
    const actor = mockCombatant({
      build: {
        learnedPassiveIds: ['at_assassin_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const passives: Record<string, PassiveSkillDef> = {
      at_assassin_passive_4: {
        id: 'at_assassin_passive_4',
        name: '無慈悲な刃',
        effect: 'bonusBasicAttackOnHit',
        chance: 0.5,
        bonusBasicAttackHpRatio: 0.3,
      },
    };
    const lowHpTarget = mockCombatant({ hp: 20, maxHp: 100, isEnemy: true });
    const highHpTarget = mockCombatant({ hp: 80, maxHp: 100, isEnemy: true });

    const failSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(shouldTriggerBonusBasicAttackOnHit(actor, lowHpTarget, passives)).toBe(
      false,
    );
    failSpy.mockRestore();

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldTriggerBonusBasicAttackOnHit(actor, lowHpTarget, passives)).toBe(
      true,
    );
    expect(shouldTriggerBonusBasicAttackOnHit(actor, highHpTarget, passives)).toBe(
      false,
    );
    successSpy.mockRestore();
  });

  it('P4 bonus hit does not recurse when suppressBonusBasicAttack is set', () => {
    vi.restoreAllMocks();
    const gameData = {
      skillRegistry: {
        passives: {
          at_assassin_passive_4: {
            id: 'at_assassin_passive_4',
            name: '無慈悲な刃',
            effect: 'bonusBasicAttackOnHit',
            chance: 1,
            bonusBasicAttackHpRatio: 0.3,
          },
        } satisfies Record<string, PassiveSkillDef>,
        actives: {} as Record<string, ActiveSkillDef>,
      },
    };
    const actor = mockCombatant({
      id: 'assassin',
      atk: 50,
      build: {
        learnedPassiveIds: ['at_assassin_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enemy = mockCombatant({
      id: 'enemy',
      hp: 20,
      maxHp: 100,
      def: 0,
      isEnemy: true,
    });
    const pending: PendingSkillHit[] = [];
    const executor = new SkillExecutor(gameData as never, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: (hits) => pending.push(...hits),
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => ({
        isActorBusy: () => false,
        isActorInSkillMotion: () => false,
        isBasicAttackBlocked: () => false,
      }),
      onBasicAttackCountCharged: () => {},
      onDamageApplied: () => {},
    });

    const basicSkill: ActiveSkillDef = {
      id: 'at_assassin_basic_attack',
      name: 'basic',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'flat', flatAmount: 5 },
          targetShape: 'single',
        },
      ],
    };
    gameData.skillRegistry.actives = { [basicSkill.id]: basicSkill };

    vi.spyOn(Math, 'random').mockReturnValue(0);
    executor.applyPendingHit({
      applyAtBattleSec: 0,
      actorId: actor.id,
      skillId: basicSkill.id,
      skillName: basicSkill.name,
      effectDef: basicSkill.effect[0]!,
      effectIndex: 0,
      slotKind: 'basic',
      hitIndex: 0,
      targets: [{ targetId: enemy.id }],
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.suppressBonusBasicAttack).toBe(true);

    pending.length = 0;
    executor.applyPendingHit({
      applyAtBattleSec: 0,
      actorId: actor.id,
      skillId: basicSkill.id,
      skillName: basicSkill.name,
      effectDef: basicSkill.effect[0]!,
      effectIndex: 0,
      slotKind: 'basic',
      hitIndex: 0,
      suppressBonusBasicAttack: true,
      targets: [{ targetId: enemy.id }],
    });
    expect(pending).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
