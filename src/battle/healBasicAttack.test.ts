import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
} from './battleConstants.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import {
  resolveSkillRangePx,
  isWithinSkillRange,
} from './skills/rangeUtils.ts';
import {
  shouldSkipEngagedAutoApproach,
  resolvePlayerApproachBattleX,
} from './resolveApproachBattleX.ts';
import type { CombatantState, GameData } from './types.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

const CLERIC_BASIC_ID = 'sp_cleric_basic_attack';

function mockHealCleric(
  battleX: number,
  overrides: Partial<CombatantState> = {},
): CombatantState {
  return {
    id: 'cleric',
    name: '療養師',
    hp: 100,
    maxHp: 100,
    atk: 15,
    def: 11,
    reg: 10,
    isAlive: true,
    role: 'supporter',
    classId: 'sp_cleric',
    formationRow: 'back',
    traits: {
      rangePx: 128,
      damageType: 'magic',
      basicAttackVfx: { preset: 'orb' },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: CLERIC_BASIC_ID, remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
    ...overrides,
  };
}

function mockGuardian(
  battleX: number,
  hp: number,
  maxHp = 235,
): CombatantState {
  return {
    id: 'guardian',
    name: '鉄衛士',
    hp,
    maxHp,
    atk: 11,
    def: 26,
    reg: 5,
    isAlive: hp > 0,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: {
      rangePx: 5,
      damageType: 'physical',
      basicAttackVfx: { preset: 'slash' },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'df_guardian_basic_attack', remaining: 2, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
  };
}

function healClericGameData(): GameData {
  const gameData = loadGameData();
  const basic = gameData.skillRegistry.actives[CLERIC_BASIC_ID];
  expect(basic?.effect[0]?.type).toBe('heal');
  return gameData;
}

describe('heal basic attack data', () => {
  it('sp_cleric_basic_attack is synthesized as ally heal', () => {
    const gameData = healClericGameData();
    const effect = gameData.skillRegistry.actives[CLERIC_BASIC_ID]?.effect[0];
    expect(effect?.type).toBe('heal');
    if (effect?.type !== 'heal') return;
    expect(effect.target).toEqual({
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    });
  });
});

describe('resolveSkillRangePx ally heal', () => {
  it('extends range to party formation depth for ally-targeted heal', () => {
    const cleric = mockHealCleric(20, {
      traits: {
        rangePx: 90,
        damageType: 'magic',
        basicAttackVfx: { preset: 'orb' },
      },
    });
    const range = resolveSkillRangePx(
      cleric,
      {
        type: 'heal',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
      },
      4,
    );
    expect(range).toBe(96);
  });
});

describe('heal basic attack targeting', () => {
  const gameData = healClericGameData();
  const ratioAllyTarget = {
    kind: 'stat',
    side: 'ally',
    stat: 'hp',
    order: 'ratio',
  } as const;

  it('resolves heal for demo-party front guardian when damaged and in formation depth', () => {
    const clericX = PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING;
    const guardianX =
      PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING * 3;
    const cleric = mockHealCleric(clericX);
    const guardian = mockGuardian(guardianX, 40);
    const party = [cleric, guardian];

    expect(
      isWithinSkillRange(
        cleric,
        guardian,
        resolveSkillRangePx(
          cleric,
          { type: 'heal', target: ratioAllyTarget },
          party.length,
        ),
      ),
    ).toBe(true);

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'instant',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      cleric,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('guardian');
  });
});

describe('heal basic attack approach', () => {
  const gameData = healClericGameData();

  it('skips approach when a damaged ally is in heal range', () => {
    const cleric = mockHealCleric(52);
    const guardian = mockGuardian(116, 30);
    const players = [cleric, guardian];
    const enemy = {
      id: 'enemy',
      name: 'enemy',
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      reg: 0,
      isAlive: true,
      role: 'attacker' as const,
      classId: 'test_enemy',
      formationRow: 'front' as const,
      traits: {
        rangePx: 200,
        damageType: 'magic' as const,
        basicAttackVfx: { preset: 'orb' as const },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [
        {
          skillId: 'test_enemy_basic_attack',
          remaining: 0,
          slotKind: 'basic' as const,
        },
      ],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 280,
      visualX: 280,
      corpseVisible: true,
    };

    expect(
      shouldSkipEngagedAutoApproach(cleric, players, [enemy], gameData),
    ).toBe(true);
  });

  it('does not skip approach while a wounded ally is out of heal range', () => {
    const cleric = mockHealCleric(20);
    const guardian = mockGuardian(200, 25);
    const players = [cleric, guardian];
    const rangedEnemy = {
      id: 'ranged',
      name: 'ranged',
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      reg: 0,
      isAlive: true,
      role: 'attacker' as const,
      classId: 'test_ranged',
      formationRow: 'back' as const,
      traits: {
        rangePx: 180,
        damageType: 'physical' as const,
        basicAttackVfx: { preset: 'arrow' as const, arc: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [
        {
          skillId: 'test_ranged_basic_attack',
          remaining: 0,
          slotKind: 'basic' as const,
        },
      ],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 320,
      visualX: 320,
      corpseVisible: true,
    };

    expect(
      shouldSkipEngagedAutoApproach(cleric, players, [rangedEnemy], gameData),
    ).toBe(false);

    const approachX = resolvePlayerApproachBattleX(
      cleric,
      players,
      [rangedEnemy],
      gameData,
    );
    expect(approachX).toBeGreaterThanOrEqual(200 - 128);
  });
});

describe('BattleEngine heal basic attack', () => {
  it('fires cleric basic heal when a front ally is damaged', () => {
    const gameData = structuredClone(loadGameData());
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    for (const slot of save.party) {
      if (!slot) continue;
      slot.build.equippedActiveSlots = [];
    }

    let healFired = false;
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.onEvent((event) => {
      if (
        event.type === 'skill' &&
        event.effect === 'heal' &&
        event.slotKind === 'basic' &&
        event.skillId === CLERIC_BASIC_ID
      ) {
        healFired = true;
      }
    });
    engine.startBattle();
    waitForEngaged(engine);

    const internal = asBattleEngineInternals(engine);
    const cleric = internal.players.find((p) => p.classId === 'sp_cleric');
    const guardian = internal.players.find((p) => p.classId === 'df_guardian');
    expect(cleric).toBeDefined();
    expect(guardian).toBeDefined();
    if (!cleric || !guardian) return;

    guardian.hp = Math.floor(guardian.maxHp * 0.3);
    const basicCd = cleric.cooldowns.find((cd) => cd.slotKind === 'basic');
    if (basicCd) basicCd.remaining = 0;

    for (let t = 0; t < 3600; t++) {
      engine.tick(TICK_DT);
      if (healFired) break;
    }

    expect(healFired).toBe(true);
    expect(guardian.hp).toBeGreaterThan(Math.floor(guardian.maxHp * 0.3));
  });
});
