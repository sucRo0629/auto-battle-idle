import { describe, expect, it } from 'vitest';
import { SPRITE_WIDTH } from './battleConstants.ts';
import { getAttackablePool, isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  resolveEnemyApproachBattleX,
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
  resolvePlayerChaseTargetEnemy,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import { mockApproachCombatant as mockCombatant, mockApproachGameData } from './testFixtures.ts';

const gameData = mockApproachGameData();

describe('resolvePlayerChaseTargetEnemy', () => {
  it('picks min battleX enemy frontline by default', () => {
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 120,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: 'front-enemy',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const rearEnemy = mockCombatant({
      id: 'rear-enemy',
      isEnemy: true,
      battleX: 340,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolvePlayerChaseTargetEnemy(
      striker,
      [striker],
      [frontMelee, rearEnemy],
      gameData,
    );

    expect(target?.id).toBe('front-enemy');
  });
});

describe('resolveEnemyChaseTargetPlayer', () => {
  it('picks frontmost defender by battleX when two defenders are in pool', () => {
    const nearDefender = mockCombatant({
      id: 'def-near',
      role: 'defender',
      formationRow: 'front',
      battleX: 210,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const farDefender = mockCombatant({
      id: 'def-far',
      role: 'defender',
      formationRow: 'front',
      battleX: 180,
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
      [nearDefender, farDefender],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('def-near');
  });

  it('picks frontmost player when no defender is alive', () => {
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 210,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const backliner = mockCombatant({
      id: 'backliner',
      formationRow: 'back',
      battleX: 80,
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
      [striker, backliner],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('striker');
  });

  it('prefers defender over nearer non-defender', () => {
    const tank = mockCombatant({
      id: 'tank',
      role: 'defender',
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
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 210,
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

  it("does not treat rear assault behind the enemy as a chase target", () => {
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
    const assassinBehindEnemy = mockCombatant({
      id: 'assassin',
      formationRow: 'front',
      battleX: 280,
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

  it('does not treat runtime rearAssault accessState as a chase target without battleX fallback', () => {
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
    const assassinRuntime = mockCombatant({
      id: 'assassin',
      formationRow: 'front',
      battleX: 200,
      accessState: 'rearAssault',
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
      [guard, assassinRuntime],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('guard');
  });


  it('locks chase to duelist under arenaDominance', () => {
    const duelist = mockCombatant({
      id: 'duelist',
      role: 'defender',
      formationRow: 'front',
      battleX: 180,
      statusEffects: [
        {
          id: 'arena',
          kind: 'buff',
          overlay: 'arenaDominance',
          durationSec: 15,
          remainingSec: 10,
        },
      ],
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
      battleX: 220,
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
      [duelist, striker],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('duelist');
  });

  it('uses targetRuleOverride over default defender priority', () => {
    const highDef = mockCombatant({
      id: 'high-def',
      role: 'defender',
      formationRow: 'front',
      battleX: 210,
      def: 50,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const lowDef = mockCombatant({
      id: 'low-def',
      role: 'attacker',
      formationRow: 'front',
      battleX: 200,
      def: 5,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const overrideEnemy = mockCombatant({
      id: 'override-enemy',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: ['passive_highest_def'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const overrideGameData = {
      ...gameData,
      skillRegistry: {
        ...gameData.skillRegistry,
        passives: {
          ...gameData.skillRegistry.passives,
          passive_highest_def: {
            id: 'passive_highest_def',
            name: 'DEF狙い',
            effect: 'targetRuleOverride',
            targetRuleOverrideApplyTo: 'enemy',
            targetRuleOverride: {
              kind: 'stat',
              side: 'enemy',
              stat: 'def',
              order: 'highest',
            },
          },
        },
      },
    } as typeof gameData;

    const target = resolveEnemyChaseTargetPlayer(
      overrideEnemy,
      [highDef, lowDef],
      [overrideEnemy],
      overrideGameData,
    );

    expect(target?.id).toBe('high-def');
  });
});

describe('resolveEnemyAttackTargetPlayer', () => {
  it('returns null when chase target is out of range even if another ally is in range', () => {
    const tank = mockCombatant({
      id: 'tank',
      role: 'defender',
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
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 250,
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

    expect(
      resolveEnemyChaseTargetPlayer(meleeEnemy, [tank, striker], [meleeEnemy], gameData)?.id,
    ).toBe('tank');
    expect(
      resolveEnemyAttackTargetPlayer(meleeEnemy, [tank, striker], [meleeEnemy], gameData),
    ).toBeNull();
    expect(
      shouldSkipEngagedAutoApproach(meleeEnemy, [tank, striker], [meleeEnemy], gameData),
    ).toBe(false);
  });

  it('attacks chase target when both are in range', () => {
    const tank = mockCombatant({
      id: 'tank',
      role: 'defender',
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
    const striker = mockCombatant({
      id: 'striker',
      formationRow: 'front',
      battleX: 210,
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
    expect(
      shouldSkipEngagedAutoApproach(meleeEnemy, [tank, striker], [meleeEnemy], gameData),
    ).toBe(true);
  });

  it('attacks chase target when chase target enters range', () => {
    const tank = mockCombatant({
      id: 'tank',
      role: 'defender',
      formationRow: 'front',
      battleX: 250,
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
      battleX: 200,
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

    expect(
      resolveEnemyAttackTargetPlayer(meleeEnemy, [tank, striker], [meleeEnemy], gameData)?.id,
    ).toBe('tank');
    expect(
      shouldSkipEngagedAutoApproach(meleeEnemy, [tank, striker], [meleeEnemy], gameData),
    ).toBe(true);
  });
});

describe('resolveEnemyApproachBattleX', () => {
  it('melee stop X matches attack range for chase target', () => {
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

    expect(approachX).toBe(200 + SPRITE_WIDTH);
    meleeEnemy.battleX = approachX;
    const spec = {
      kind: 'distance' as const,
      side: 'enemy' as const,
      order: 'nearest' as const,
    };
    expect(
      getAttackablePool(spec, meleeEnemy, [guard], [meleeEnemy], SPRITE_WIDTH),
    ).toHaveLength(1);
    expect(isWithinSkillRange(meleeEnemy, guard, SPRITE_WIDTH)).toBe(true);
  });

  it('stops at skill range from chase target', () => {
    const rangedEnemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 300,
      formationRow: 'front',
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      role: 'defender',
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
