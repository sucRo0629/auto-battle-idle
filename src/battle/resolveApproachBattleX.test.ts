import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import {
  engagedMinBodyGap,
} from './battleConstants.ts';
import { getAttackablePool, isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  resolvePlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
} from './resolveApproachBattleX.ts';

function mockCombatant(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'back',
    traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
    build: {
      learnedPassiveIds: ['archer_passive'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'bow_basic', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 60,
    visualX: 60,
    corpseVisible: true,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: {
    passives: {
      archer_passive: {
        id: 'archer_passive',
        name: '射手排除',
        effect: 'targetRuleOverride',
        targetRuleOverride: { kind: "attackType", ranged: true },
      },
    },
    actives: {
      basic_melee: {
        id: 'basic_melee',
        name: 'basic',
        trigger: { kind: 'time', value: 2 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 } }],
      },
      bow_basic: {
        id: 'bow_basic',
        name: '射撃',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: "distance", side: "enemy", order: "nearest" },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
            range: 100,
          },
        ],
      },
    },
  },
} as unknown as GameData;

describe('resolvePlayerApproachBattleX', () => {
  it('approaches farthest-in-range priority target, not only front contact', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 320,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(320 - 100);
    expect(approachX).toBeGreaterThan(280 - 100);
  });

  it('front row uses melee contact even with ranged passive', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 320,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(280 - engagedMinBodyGap());
  });

  it('melee band: front row separates by rangePx depth (L10)', () => {
    const guardian = mockCombatant({
      id: 'guardian',
      role: 'defender',
      formationRow: 'front',
      battleX: 220,
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockCombatant({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'front',
      battleX: 178,
      traits: { rangePx: 8, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const guardianX = resolvePlayerApproachBattleX(
      guardian,
      [guardian, warrior],
      [frontMelee],
      gameData,
    );
    const warriorX = resolvePlayerApproachBattleX(
      warrior,
      [guardian, warrior],
      [frontMelee],
      gameData,
    );

    const guardianStop = 280 - engagedMinBodyGap() - 5;
    const warriorStop = 280 - engagedMinBodyGap() - 8;
    expect(guardianX).toBe(guardianStop);
    expect(warriorX).toBe(warriorStop);
    expect(guardianX - warriorX).toBe(3);
  });

  it('falls back to front contact when no ranged enemies exist', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it('front row approaches ranged target after melee enemies are gone', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [ranged],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it('back row stops at skill range from target, not formation depth pull-forward', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enchanter = mockCombatant({
      id: 'enchanter',
      formationRow: 'back',
      battleX: 60,
      traits: { rangePx: 55, damageType: 'magic', basicAttackVfx: { preset: 'orb' } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolvePlayerApproachBattleX(
      enchanter,
      [guard, enchanter],
      [meleeEnemy],
      gameData,
    );

    expect(approachX).toBe(250 - 100);
    expect(approachX).toBeLessThan(guard.battleX);
  });

  it('back row stopping battleX changes with attack range (100 vs 55)', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 220,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      battleX: 60,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: ['archer_passive'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const gameDataRange100 = gameData;
    const stop100 = resolvePlayerApproachBattleX(
      archer,
      [guard, archer],
      [meleeEnemy],
      gameDataRange100,
    );

    const gameDataRange55 = {
      ...gameData,
      skillRegistry: {
        ...gameData.skillRegistry,
        actives: {
          ...gameData.skillRegistry.actives,
          bow_basic: {
            ...gameData.skillRegistry.actives.bow_basic,
            effect: [
              {
                ...gameData.skillRegistry.actives.bow_basic.effect[0],
                range: 55,
              },
            ],
          },
        },
      },
    } as unknown as GameData;

    const stop55 = resolvePlayerApproachBattleX(
      archer,
      [guard, archer],
      [meleeEnemy],
      gameDataRange55,
    );

    expect(stop100).toBe(250 - 100);
    expect(stop55).toBe(250 - 55);
    expect(stop100).toBeLessThan(stop55);
  });

  it('back row stops at shorter equipped active range when skill is ready (sorcerer actives 50)', () => {
    const sorcererBasic = {
      id: 'at_sorcerer_basic_attack',
      name: '魔弾',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          amount: { kind: 'atkBased', atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: 'at_sorcerer_active_1',
      name: '魔弾',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          damageType: 'magic',
          amount: { kind: 'atkBased', atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: 'mage',
      formationRow: 'back',
      classId: 'at_sorcerer',
      traits: {
        rangePx: 200,
        damageType: 'magic',
        basicAttackVfx: { preset: 'orb' },
      },
      battleX: 40,
      cooldowns: [
        { skillId: 'at_sorcerer_basic_attack', remaining: 0, slotKind: 'basic' },
        { skillId: 'at_sorcerer_active_1', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 50);
  });

  it('back row uses basic range while shorter active is on cooldown', () => {
    const sorcererBasic = {
      id: 'at_sorcerer_basic_attack',
      name: '魔弾',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          amount: { kind: 'atkBased', atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: 'at_sorcerer_active_1',
      name: '魔弾',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          damageType: 'magic',
          amount: { kind: 'atkBased', atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: 'mage',
      formationRow: 'back',
      classId: 'at_sorcerer',
      traits: {
        rangePx: 200,
        damageType: 'magic',
        basicAttackVfx: { preset: 'orb' },
      },
      battleX: 40,
      cooldowns: [
        { skillId: 'at_sorcerer_basic_attack', remaining: 0, slotKind: 'basic' },
        { skillId: 'at_sorcerer_active_1', remaining: 8, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 200);
  });

  it('back row does not retreat when already closer than approach stop', () => {
    const sorcererBasic = {
      id: 'at_sorcerer_basic_attack',
      name: '魔弾',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          amount: { kind: 'atkBased', atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: 'at_sorcerer_active_1',
      name: '魔弾',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          damageType: 'magic',
          amount: { kind: 'atkBased', atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: 'mage',
      formationRow: 'back',
      classId: 'at_sorcerer',
      traits: {
        rangePx: 200,
        damageType: 'magic',
        basicAttackVfx: { preset: 'orb' },
      },
      battleX: 240,
      cooldowns: [
        { skillId: 'at_sorcerer_basic_attack', remaining: 0, slotKind: 'basic' },
        { skillId: 'at_sorcerer_active_1', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(240);
  });

  it('back row uses traits range when basic attack has no range field (sorcerer)', () => {
    const sorcererBasic = {
      id: 'at_sorcerer_basic_attack',
      name: '魔弾',
      trigger: { kind: 'time', value: 2 },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          amount: { kind: 'atkBased', atkScale: 0.85 },
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: { at_sorcerer_basic_attack: sorcererBasic },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: 'mage',
      formationRow: 'back',
      classId: 'at_sorcerer',
      traits: {
        rangePx: 200,
        damageType: 'magic',
        basicAttackVfx: { preset: 'orb' },
      },
      battleX: 40,
      cooldowns: [{ skillId: 'at_sorcerer_basic_attack', remaining: 0, slotKind: 'basic' }],
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 200);
  });

  it('does not lunge right after enemy melee wipe when rear ranged remains', () => {
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      battleX: 80,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 320,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const stop = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [ranged],
      gameData,
      { frozenMeleeContactX: 200 },
    );
    expect(stop).toBe(80);
  });

  it('front row melee allies approach to per-unit range stop', () => {
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 300,
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const guardian = mockCombatant({
      id: 'guardian',
      formationRow: 'front',
      role: 'defender',
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 100,
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const warrior = mockCombatant({
      id: 'warrior',
      formationRow: 'front',
      role: 'attacker',
      traits: { rangePx: 8, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 100,
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const players = [guardian, warrior];
    const enemies = [meleeEnemy];

    const guardStop = resolvePlayerApproachBattleX(
      guardian,
      players,
      enemies,
      gameData as unknown as GameData,
    );
    const warriorStop = resolvePlayerApproachBattleX(
      warrior,
      players,
      enemies,
      gameData as unknown as GameData,
    );

    expect(guardStop - warriorStop).toBe(3);
    expect(guardStop).toBeGreaterThan(guardian.battleX);
    expect(warriorStop).toBeGreaterThan(warrior.battleX);
  });
});

describe('resolveEnemyChaseTargetPlayer', () => {
  it('picks highest-threat player from all living allies', () => {
    const tank = mockCombatant({
      id: 'tank',
      formationRow: 'front',
      battleX: 200,
      threat: 120,
      baseThreat: 120,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 210,
      threat: 40,
      baseThreat: 40,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolveEnemyChaseTargetPlayer(
      meleeEnemy,
      [tank, striker],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('tank');
  });

  it('chases high-threat back row beyond front contact', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enchanter = mockCombatant({
      id: 'enchanter',
      formationRow: 'back',
      battleX: 80,
      threat: 200,
      baseThreat: 200,
      traits: { rangePx: 55, damageType: 'magic', basicAttackVfx: { preset: 'orb' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolveEnemyChaseTargetPlayer(
      meleeEnemy,
      [guard, enchanter],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('enchanter');
  });

  it('re-targets chase when a different ally becomes top threat', () => {
    const tank = mockCombatant({
      id: 'tank',
      formationRow: 'front',
      battleX: 200,
      threat: 150,
      baseThreat: 150,
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'back',
      battleX: 80,
      threat: 200,
      baseThreat: 200,
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    expect(
      resolveEnemyChaseTargetPlayer(
        meleeEnemy,
        [tank, striker],
        [meleeEnemy],
        gameData,
      )?.id,
    ).toBe('striker');

    tank.threat = 300;
    expect(
      resolveEnemyChaseTargetPlayer(
        meleeEnemy,
        [tank, striker],
        [meleeEnemy],
        gameData,
      )?.id,
    ).toBe('tank');
  });
});

describe('resolveEnemyAttackTargetPlayer', () => {
  it('picks highest-threat player among in-range pool only', () => {
    const tank = mockCombatant({
      id: 'tank',
      formationRow: 'front',
      battleX: 200,
      threat: 120,
      baseThreat: 120,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 210,
      threat: 40,
      baseThreat: 40,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 200 + engagedMinBodyGap(),
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolveEnemyAttackTargetPlayer(
      meleeEnemy,
      [tank, striker],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('tank');
  });
});

describe('resolveEnemyApproachBattleX', () => {
  it('melee stop X matches attack range for chase target', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      threat: 100,
      baseThreat: 100,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 300,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const approachX = resolveEnemyApproachBattleX(
      meleeEnemy,
      [guard],
      [meleeEnemy],
      gameData,
    );

    expect(approachX).toBe(200 + engagedMinBodyGap());
    meleeEnemy.battleX = approachX;
    const spec = {
      kind: 'distance' as const,
      side: 'enemy' as const,
      order: 'nearest' as const,
    };
    expect(
      getAttackablePool(spec, meleeEnemy, [guard], [meleeEnemy], 0),
    ).toHaveLength(1);
    expect(isWithinSkillRange(meleeEnemy, guard, 0)).toBe(true);
  });

  it('stops at skill range from closest player', () => {
    const rangedEnemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      formationRow: 'front',
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      battleX: 60,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 100);
  });

  it('caps ranged approach behind living melee', () => {
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 250,
      cooldowns: [],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 55);
  });

  it('ranged enemies approach attack range toward front-line target', () => {
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 250,
      cooldowns: [],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 55, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 60,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 55);
  });
});
