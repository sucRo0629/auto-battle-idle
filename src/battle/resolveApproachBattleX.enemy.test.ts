import { describe, expect, it } from 'vitest';
import { getAttackablePool, isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  resolveEnemyApproachBattleX,
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
} from './resolveApproachBattleX.ts';
import { mockApproachCombatant as mockCombatant, mockApproachGameData } from './testFixtures.ts';

const gameData = mockApproachGameData();

describe('resolveEnemyChaseTargetPlayer', () => {
  it('picks highest-threat player from all living allies', () => {
    const tank = mockCombatant({
      id: 'tank',
      formationRow: 'front',
      battleX: 200,
      threat: 120,
      baseThreat: 120,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 100, damageType: 'magic', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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

  it('does not treat rear assault behind the enemy as a chase target', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      threat: 100,
      baseThreat: 100,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const assassinBehindEnemy = mockCombatant({
      id: 'assassin',
      formationRow: 'front',
      battleX: 280,
      threat: 300,
      baseThreat: 300,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolveEnemyChaseTargetPlayer(
      meleeEnemy,
      [guard, assassinBehindEnemy],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('guard');
  });

  it('re-targets chase when a different ally becomes top threat by margin', () => {
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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

  it('keeps chase focus when challenger threat lead is below hysteresis margin', () => {
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
      formationRow: 'front',
      battleX: 210,
      threat: 170,
      baseThreat: 170,
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
      threatFocusTargetId: 'tank',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
    expect(meleeEnemy.threatFocusTargetId).toBe('tank');
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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

    expect(approachX).toBe(200 + 0);
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 250,
      cooldowns: [],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 100);
  });

  it('ranged enemies approach attack range toward front-line target', () => {
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 250,
      cooldowns: [],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 60,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 100);
  });

  it('falls back to current position when only rear assault players are behind the enemy', () => {
    const assassinBehindEnemy = mockCombatant({
      id: 'assassin',
      formationRow: 'front',
      battleX: 280,
      threat: 300,
      baseThreat: 300,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const approachX = resolveEnemyApproachBattleX(
      meleeEnemy,
      [assassinBehindEnemy],
      [meleeEnemy],
      gameData,
    );

    expect(approachX).toBe(meleeEnemy.battleX);
  });
});
