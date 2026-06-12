import { describe, expect, it } from 'vitest';
import type { GameData } from './types.ts';
import { engagedMinBodyGap } from './battleConstants.ts';
import { resolvePlayerApproachBattleX } from './resolveApproachBattleX.ts';
import { mockApproachCombatant as mockCombatant, mockApproachGameData } from './testFixtures.ts';

const gameData = mockApproachGameData();

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
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
      traits: { rangePx: 100, damageType: 'magic', basicAttackVfx: { preset: 'orb' } },
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

  it('back row stopping battleX changes with attack range (120 vs 100)', () => {
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
    const archer100 = mockCombatant({
      id: 'archer100',
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
    const archer120 = mockCombatant({
      id: 'archer120',
      formationRow: 'back',
      battleX: 60,
      traits: { rangePx: 120, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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

    const traitsOnlyGameData = {
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
                range: undefined,
              },
            ],
          },
        },
      },
    } as unknown as GameData;

    const stop100 = resolvePlayerApproachBattleX(
      archer100,
      [guard, archer100],
      [meleeEnemy],
      traitsOnlyGameData,
    );
    const stop120 = resolvePlayerApproachBattleX(
      archer120,
      [guard, archer120],
      [meleeEnemy],
      traitsOnlyGameData,
    );

    expect(stop100).toBe(250 - 100);
    expect(stop120).toBe(250 - 120);
    expect(stop120).toBeLessThan(stop100);
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
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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

  it('front row survivor inherits forward depth when same-range tank falls', () => {
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 300,
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const duelist = mockCombatant({
      id: 'duelist',
      role: 'defender',
      formationRow: 'front',
      battleX: 220,
      isAlive: false,
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const assassin = mockCombatant({
      id: 'assassin',
      role: 'attacker',
      formationRow: 'front',
      battleX: 200,
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const players = [duelist, assassin];

    const assassinX = resolvePlayerApproachBattleX(
      assassin,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );
    const soloForwardStop = 300 - engagedMinBodyGap() - 5 + 3;
    expect(assassinX).toBe(soloForwardStop);
  });

  it('same-range front row melee separates defender forward of attacker', () => {
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 300,
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const duelist = mockCombatant({
      id: 'duelist',
      role: 'defender',
      formationRow: 'front',
      battleX: 100,
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const assassin = mockCombatant({
      id: 'assassin',
      role: 'attacker',
      formationRow: 'front',
      battleX: 100,
      traits: { rangePx: 5, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const players = [duelist, assassin];

    const duelistX = resolvePlayerApproachBattleX(
      duelist,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );
    const assassinX = resolvePlayerApproachBattleX(
      assassin,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );

    expect(duelistX).toBeGreaterThan(assassinX);
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
