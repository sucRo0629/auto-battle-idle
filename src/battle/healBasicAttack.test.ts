import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  COMBAT_CAMERA_CENTER_X,
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
  resolveAllPlayerApproachBattleX,
} from './resolveApproachBattleX.ts';
import type { CombatantState, GameData } from './types.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import { runDemoStageBattle, createDemoStageGameData } from './test/demoStageSim.harness.ts';

const CLERIC_BASIC_ID = 'sp_cleric_basic_attack';
const CLERIC_MODULE_BASIC_ID = 'sp_cleric_mod_single_mend';

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
    res: 10,
    isAlive: true,
    role: 'supporter',
    classId: 'sp_cleric',
    formationRow: 'back',
    traits: {
      rangePx: 128,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
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
    corpseVisible: true,
    ...overrides,
  };
}

function mockSorcerer(battleX: number): CombatantState {
  return {
    id: 'sorcerer',
    name: '魔術師',
    hp: 80,
    maxHp: 80,
    atk: 26,
    def: 5,
    res: 20,
    isAlive: true,
    role: 'attacker',
    classId: 'at_sorcerer',
    formationRow: 'back',
    traits: {
      rangePx: 30,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: 'at_sorcerer_basic_attack',
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockMeleeEnemy(battleX: number, id = 'enemy'): CombatantState {
  return {
    id,
    name: 'enemy',
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker' as const,
    classId: 'test_enemy',
    formationRow: 'front' as const,
    traits: {
      rangePx: 0,
      damageType: 'physical' as const,
      basicAttackVfx: { enabled: true },
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
    battleX,
    corpseVisible: true,
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
    res: 5,
    isAlive: hp > 0,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: {
      rangePx: 5,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
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
        basicAttackVfx: { enabled: true },
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
    expect(range).toBe(PARTY_FORMATION_SLOT_SPACING * 3);
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
      res: 0,
      isAlive: true,
      role: 'attacker' as const,
      classId: 'test_enemy',
      formationRow: 'front' as const,
      traits: {
        rangePx: 200,
        damageType: 'magic' as const,
        basicAttackVfx: { enabled: true },
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
      corpseVisible: true,
    };

    expect(
      shouldSkipEngagedAutoApproach(cleric, players, [enemy], gameData),
    ).toBe(true);
  });

  it('does not skip approach while frontline is out of heal range', () => {
    const cleric = mockHealCleric(20);
    const guardian = mockGuardian(180, 25);
    const duelist = mockGuardian(176, 100);
    duelist.id = 'duelist';
    duelist.role = 'attacker';
    duelist.classId = 'at_duelist';
    const players = [cleric, duelist, guardian];
    const rangedEnemy = {
      id: 'ranged',
      name: 'ranged',
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'attacker' as const,
      classId: 'test_ranged',
      formationRow: 'back' as const,
      traits: {
        rangePx: 180,
        damageType: 'physical' as const,
        basicAttackVfx: { enabled: true },
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
    expect(approachX).toBeGreaterThan(cleric.battleX);
    expect(approachX).toBeGreaterThanOrEqual(176 - 128);
  });

  it('advances toward frontline when all allies are healthy', () => {
    const cleric = mockHealCleric(80);
    const guardian = mockGuardian(234, 235);
    const duelist = mockGuardian(230, 100);
    duelist.id = 'duelist';
    duelist.role = 'attacker';
    duelist.classId = 'at_duelist';
    const players = [cleric, duelist, guardian];
    const frontEnemy = {
      ...mockGuardian(234, 100),
      id: 'front',
      isEnemy: true,
      role: 'attacker' as const,
      classId: 'test_enemy',
      formationRow: 'front' as const,
    };
    const deepEnemy = {
      ...frontEnemy,
      id: 'deep',
      battleX: 364,
    };

    const approachX = resolvePlayerApproachBattleX(
      cleric,
      players,
      [frontEnemy, deepEnemy],
      gameData,
    );
    expect(approachX).toBeGreaterThan(cleric.battleX);
    expect(approachX).toBeLessThan(duelist.battleX);
  });

  it('healthy cleric is not pulled forward by back-row caster spacing chain', () => {
    const cleric = mockHealCleric(
      PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING,
    );
    const sorcerer = mockSorcerer(PARTY_FORMATION_LEFT_ANCHOR);
    const guardian = mockGuardian(
      PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING * 3,
      235,
    );
    const players = [sorcerer, cleric, guardian];
    const enemies = [
      mockMeleeEnemy(COMBAT_CAMERA_CENTER_X + 80, 'near'),
      mockMeleeEnemy(COMBAT_CAMERA_CENTER_X + 160, 'deep'),
    ];

    const allTargets = resolveAllPlayerApproachBattleX(
      players,
      enemies,
      gameData,
    );
    const clericTarget = allTargets.get(cleric.id);
    const sorcererTarget = allTargets.get(sorcerer.id);

    expect(clericTarget).toBe(cleric.battleX);
    expect(sorcererTarget).toBeGreaterThan(cleric.battleX + 50);
    expect(
      resolvePlayerApproachBattleX(cleric, players, enemies, gameData),
    ).toBe(cleric.battleX);
  });
});

describe('BattleEngine heal basic attack', () => {
  it('demo party stage 1-2: cleric does not advance past front row', () => {
    for (const stageId of ['1', '2'] as const) {
      const gameData = structuredClone(loadGameData());
      const levelCurves = loadLevelCurves(levelCurvesJson);
      const save = createDefaultSave(gameData, 'demo');
      save.stageProgress.currentStageId = stageId;

      const engine = new BattleEngine(
        gameData,
        levelCurves,
        () => save.party,
        () => save.stageProgress.currentStageId,
      );
      engine.startBattle();
      waitForEngaged(engine);

      let maxClericBeyondApproachCap = 0;

      for (let t = 0; t < 20_000; t++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!snap.engaged) continue;

        const internal = asBattleEngineInternals(engine);
        const cleric = internal.players.find(
          (p) => p.classId === 'sp_cleric' && p.isAlive,
        );
        if (!cleric) break;

        const approachCap = resolvePlayerApproachBattleX(
          cleric,
          internal.players,
          internal.enemies,
          internal.gameData,
        );
        maxClericBeyondApproachCap = Math.max(
          maxClericBeyondApproachCap,
          cleric.battleX - approachCap,
        );
      }

      expect(maxClericBeyondApproachCap).toBeLessThanOrEqual(1);
    }
  });

  it('cleric with sorcerer on stage 1-2: does not advance past front row', () => {
    for (const stageId of ['1', '2'] as const) {
      const gameData = structuredClone(loadGameData());
      const levelCurves = loadLevelCurves(levelCurvesJson);
      const save = createDefaultSave(gameData, 'demo');
      save.stageProgress.currentStageId = stageId;
      save.party[3] = createMemberFromClass('at_sorcerer', gameData);

      const engine = new BattleEngine(
        gameData,
        levelCurves,
        () => save.party,
        () => save.stageProgress.currentStageId,
      );
      engine.startBattle();
      waitForEngaged(engine);

      let maxClericBeyondApproachCap = 0;

      for (let t = 0; t < 20_000; t++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!snap.engaged) continue;

        const internal = asBattleEngineInternals(engine);
        const cleric = internal.players.find(
          (p) => p.classId === 'sp_cleric' && p.isAlive,
        );
        if (!cleric) break;

        const approachCap = resolvePlayerApproachBattleX(
          cleric,
          internal.players,
          internal.enemies,
          internal.gameData,
        );
        maxClericBeyondApproachCap = Math.max(
          maxClericBeyondApproachCap,
          cleric.battleX - approachCap,
        );
      }

      expect(maxClericBeyondApproachCap).toBeLessThanOrEqual(1);
    }
  });

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
        (event.skillId === CLERIC_MODULE_BASIC_ID ||
          event.skillId === CLERIC_BASIC_ID)
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

  it('demo_ch1_04: cleric records healing while party is engaged', () => {
    const gameData = createDemoStageGameData();
    const result = runDemoStageBattle('demo_ch1_04', {
      gameData,
      maxTicks: 12_000,
    });
    const clericHeal =
      result.classStats.find((row) => row.classId === 'sp_cleric')?.healingDealt ??
      0;
    expect(clericHeal).toBeGreaterThan(0);
    expect(result.outcome).not.toBe('defeat');
  });
});
