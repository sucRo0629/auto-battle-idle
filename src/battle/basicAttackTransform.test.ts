import { describe, expect, it } from 'vitest';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
} from './types.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import { resolveEffectiveBasicAttackSkill } from './resolveEffectiveBasicAttack.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';

function mockUnit(
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
    classId: 'at_assassin',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: ['transform_active'],
      equippedActiveSlots: ['transform_active'],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

function mockEnemy(id = 'enemy'): CombatantState {
  return mockUnit({
    id,
    isEnemy: true,
    battleX: 200,
    classId: 'test_enemy',
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
  });
}

function assassinBasicSkill(): ActiveSkillDef {
  return {
    id: 'at_assassin_basic_attack',
    name: '双刃',
    trigger: { kind: 'time', value: 2 },
    effect: [
      {
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        amount: { kind: 'atkBased', atkScale: 0.5 },
        hitCount: 2,
        hitDurationSec: 0.2,
      },
    ],
  };
}

function transformActive(
  spec: Extract<ActiveSkillDef['effect'][number], { type: 'basicAttackTransform' }>,
): ActiveSkillDef {
  return {
    id: 'transform_active',
    name: '変形',
    trigger: { kind: 'time', value: 1 },
    effect: [spec],
  };
}

describe('basicAttackTransform', () => {
  it('example1: triples assassin basic hit count during buff', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({
      id: 'actor',
      cooldowns: [
        { skillId: 'at_assassin_basic_attack', remaining: 0, slotKind: 'basic' },
      ],
      statusEffects: [
        {
          id: 'transform',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          multiplier: 1,
          durationSec: 6,
          remainingSec: 6,
          basicAttackTransform: { hitCountMultiplier: 3 },
        },
      ],
    });
    const enemy = mockEnemy();
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: { at_assassin_basic_attack: assassinBasicSkill() },
      },
    } as unknown as GameData;

    const skill = resolveEffectiveBasicAttackSkill(
      actor,
      gameData.skillRegistry.actives.at_assassin_basic_attack!,
    );
    expect(skill.effect[0]?.hitCount).toBe(6);

    const damages: number[] = [];
    const executor = new SkillExecutor(gameData, (event) => {
      if (
        event.type === 'skill' &&
        event.effect === 'damage' &&
        event.slotKind === 'basic'
      ) {
        damages.push(event.hitIndex ?? -1);
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: (hits) => {
        for (const hit of hits) {
          executor.applyPendingHit(hit, actor, [actor], [enemy]);
        }
      },
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    const basicCd = actor.cooldowns[0]!;
    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(damages.length).toBe(6);
  });

  it('example2: replaces basic with ally heal and skips basicAttackCount charge', () => {
    const runner = new SkillSequenceRunner();
    const ally = mockUnit({
      id: 'ally',
      hp: 40,
      battleX: 200,
      cooldowns: [
        { skillId: 'at_assassin_basic_attack', remaining: 0, slotKind: 'basic' },
        {
          skillId: 'count_active',
          remaining: 4,
          slotKind: 'active',
          slotIndex: 0,
        },
      ],
      statusEffects: [
        {
          id: 'transform',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          multiplier: 1,
          durationSec: 8,
          remainingSec: 8,
          basicAttackTransform: {
            primaryEffectOverride: {
              type: 'heal',
              healSubKind: 'instant',
              target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
              amount: { kind: 'atkBased', atkScale: 0.5 },
            },
          },
        },
      ],
    });
    const healer = mockUnit({
      id: 'healer',
      hp: 25,
      maxHp: 100,
      battleX: 200,
      cooldowns: [{ skillId: 'dummy_basic', remaining: 2, slotKind: 'basic' }],
    });
    const enemy = mockEnemy();
    enemy.battleX = 200;
    const countActive: ActiveSkillDef = {
      id: 'count_active',
      name: 'count',
      trigger: { kind: 'basicAttackCount', value: 4 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_assassin_basic_attack: assassinBasicSkill(),
          count_active: countActive,
          dummy_basic: {
            id: 'dummy_basic',
            name: 'dummy',
            trigger: { kind: 'time', value: 2 },
            effect: [
              {
                type: 'damage',
                target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                amount: { kind: 'atkBased', atkScale: 1 },
              },
            ],
          },
        },
      },
    } as unknown as GameData;

    let healFired = false;
    const executor = new SkillExecutor(gameData, (event) => {
      if (event.type === 'skill' && event.effect === 'heal' && event.slotKind === 'basic') {
        healFired = true;
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [ally, healer, enemy],
      getSequenceRunner: () => runner,
    });

    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const countBefore = ally.cooldowns.find((cd) => cd.skillId === 'count_active')!.remaining;
    executor.tryExecute(ally, basicCd, [ally, healer], [enemy]);
    const countAfter = ally.cooldowns.find((cd) => cd.skillId === 'count_active')!.remaining;

    expect(healFired).toBe(true);
    expect(healer.hp).toBeGreaterThan(25);
    expect(countAfter).toBe(countBefore);
  });

  it('example3: patches magic atk scale and appends ally aoe heal', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({
      id: 'actor',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [
        { skillId: 'warrior_basic', remaining: 0, slotKind: 'basic' },
      ],
      statusEffects: [
        {
          id: 'transform',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          multiplier: 1,
          durationSec: 10,
          remainingSec: 10,
          basicAttackTransform: {
            primaryPatch: {
              damageType: 'magic',
              amount: { atkScale: 1.2 },
            },
            appendEffects: [
              {
                type: 'heal',
                healSubKind: 'instant',
                target: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
                targetShape: 'aoe',
                aoeRadiusPx: 80,
                amount: { kind: 'atkBased', atkScale: 0.3 },
              },
            ],
          },
        },
      ],
    });
    const ally = mockUnit({ id: 'ally2', hp: 60, battleX: 200 });
    const enemy = mockEnemy();
    const warriorBasic: ActiveSkillDef = {
      id: 'warrior_basic',
      name: '打撃',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: { warrior_basic: warriorBasic },
      },
    } as unknown as GameData;

    const events: string[] = [];
    const executor = new SkillExecutor(gameData, (event) => {
      if (event.type === 'skill' && event.slotKind === 'basic') {
        events.push(`${event.effect}:${event.amount ?? 0}`);
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, ally, enemy],
      getSequenceRunner: () => runner,
    });

    const basicCd = actor.cooldowns[0]!;
    executor.tryExecute(actor, basicCd, [actor, ally], [enemy]);

    expect(events.some((entry) => entry.startsWith('damage:'))).toBe(true);
    expect(events.some((entry) => entry.startsWith('heal:'))).toBe(true);
    expect(ally.hp).toBeGreaterThan(60);
  });

  it('blocks basic during use lock but fires transformed basic after lock with active buff', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({
      id: 'actor',
      cooldowns: [
        { skillId: 'warrior_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'transform_active', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const enemy = mockEnemy();
    const active = transformActive({
      type: 'basicAttackTransform',
      buffDurationSec: 5,
      target: { kind: 'self' },
      primaryPatch: { amount: { atkScale: 1.1 } },
    });
    const warriorBasic: ActiveSkillDef = {
      id: 'warrior_basic',
      name: '打撃',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const transformSkill: ActiveSkillDef = {
      ...active,
      useDurationSec: 0.3,
    };
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: {
          warrior_basic: warriorBasic,
          transform_active: transformSkill,
        },
      },
    } as unknown as GameData;

    let basicHits = 0;
    const executor = new SkillExecutor(gameData, (event) => {
      if (event.type === 'skill' && event.slotKind === 'basic') basicHits += 1;
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    const activeCd = actor.cooldowns.find((cd) => cd.slotKind === 'active')!;
    const basicCd = actor.cooldowns.find((cd) => cd.slotKind === 'basic')!;

    executor.tryExecute(actor, activeCd, [actor], [enemy]);
    expect(actor.statusEffects.some((e) => e.overlay === 'basicAttackTransform')).toBe(true);
    expect(runner.isBasicAttackBlocked('actor')).toBe(true);

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(basicHits).toBe(0);

    runner.tickUseLocks(0.3);
    expect(runner.isBasicAttackBlocked('actor')).toBe(false);

    basicCd.remaining = 0;
    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(basicHits).toBe(1);
  });

  it('approach skips when transformed basic is ally heal and ally is damaged in range', () => {
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_swordsman_basic_attack: {
            id: 'at_swordsman_basic_attack',
            name: '打撃',
            trigger: { kind: 'time', value: 2 },
            effect: [
              {
                type: 'damage',
                target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                amount: { kind: 'atkBased', atkScale: 1 },
              },
            ],
          },
        },
      },
    } as unknown as GameData;
    const cleric = mockUnit({
      id: 'cleric',
      classId: 'sp_cleric',
      role: 'supporter',
      formationRow: 'back',
      battleX: 52,
      traits: { rangePx: 128, damageType: 'magic', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'at_swordsman_basic_attack', remaining: 0, slotKind: 'basic' }],
      statusEffects: [
        {
          id: 'transform',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          multiplier: 1,
          durationSec: 8,
          remainingSec: 8,
          basicAttackTransform: {
            primaryEffectOverride: {
              type: 'heal',
              healSubKind: 'instant',
              target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
              amount: { kind: 'atkBased', atkScale: 0.5 },
            },
          },
        },
      ],
    });
    const guardian = mockUnit({
      id: 'guardian',
      classId: 'df_guardian',
      role: 'defender',
      formationRow: 'front',
      hp: 30,
      maxHp: 235,
      battleX: 116,
      cooldowns: [{ skillId: 'df_guardian_basic_attack', remaining: 2, slotKind: 'basic' }],
    });
    const enemy = mockEnemy('ranged');
    enemy.battleX = 320;
    enemy.traits = { rangePx: 180, damageType: 'physical', basicAttackVfx: { enabled: true } };

    expect(
      shouldSkipEngagedAutoApproach(cleric, [cleric, guardian], [enemy], gameData),
    ).toBe(true);
  });

  it('applies transform buff from active skill effect', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({
      id: 'actor',
      cooldowns: [
        { skillId: 'transform_active', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const enemy = mockEnemy();
    const active = transformActive({
      type: 'basicAttackTransform',
      buffDurationSec: 6,
      target: { kind: 'self' },
      hitCountMultiplier: 3,
    });
    const gameData = {
      skillRegistry: {
        passives: {},
        actives: { transform_active: active },
      },
    } as unknown as GameData;

    const executor = new SkillExecutor(gameData, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    const activeCd = actor.cooldowns[0]!;
    executor.tryExecute(actor, activeCd, [actor], [enemy]);
    expect(actor.statusEffects.some((e) => e.overlay === 'basicAttackTransform')).toBe(true);
    expect(actor.statusEffects[0]?.basicAttackTransform?.hitCountMultiplier).toBe(3);
  });
});
