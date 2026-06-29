import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { StageDamageStatsTracker } from './stageDamageStats.ts';
import { PARTY_SLOT_COUNT } from './types.ts';
import type { SaveGameState } from './types.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { reconcilePartyBuilds } from '../progression/skillBuild.ts';

const TICK = 1 / 60;

const VERIFY_SAVE_SAMPLE: SaveGameState = {
  version: 2,
  stageProgress: { currentStageId: '1', totalClears: 3036 },
  party: [
    {
      classId: 'df_paladin',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: ['df_paladin_passive_1', 'df_paladin_passive_2'],
        learnedActiveIds: ['df_paladin_active_1', 'df_paladin_active_2'],
        equippedActiveSlots: ['', '', '', ''],
      },
    },
    {
      classId: 'at_assassin',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: ['at_assassin_passive_1', 'at_assassin_passive_2'],
        learnedActiveIds: ['at_assassin_active_1', 'at_assassin_active_2'],
        equippedActiveSlots: ['', '', '', ''],
      },
    },
    {
      classId: 'sp_wardweaver',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: ['sp_wardweaver_passive_1', 'sp_wardweaver_passive_2'],
        learnedActiveIds: ['sp_wardweaver_active_1', 'sp_wardweaver_active_2'],
        equippedActiveSlots: ['', '', '', ''],
      },
    },
    {
      classId: 'at_ballista',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: ['at_ballista_passive_1', 'at_ballista_passive_2'],
        learnedActiveIds: ['at_ballista_active_1', 'at_ballista_active_2'],
        equippedActiveSlots: ['', '', '', ''],
      },
    },
  ],
  unlockedClassIds: [],
};

function runTrackedBattle(
  save: ReturnType<typeof createDefaultSave>,
  gameData: ReturnType<typeof loadGameData>,
  ticks = 12_000,
): StageDamageStatsTracker {
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const tracker = new StageDamageStatsTracker();
  tracker.resetForStage(save.stageProgress.currentStageId);

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      onDamageApplied: (actor, target, amount) => {
        tracker.recordDamage(actor, target, amount);
      },
    },
  );
  engine.startBattle();

  for (let i = 0; i < ticks; i++) {
    engine.tick(TICK);
  }

  return tracker;
}

function createVerifyStyleSave(gameData: ReturnType<typeof loadGameData>) {
  const save = createDefaultSave(gameData, 'demo');
  for (let i = 0; i < 4; i++) {
    save.party[i] = structuredClone(VERIFY_SAVE_SAMPLE.party[i]!);
  }
  save.stageProgress.totalClears = VERIFY_SAVE_SAMPLE.stageProgress.totalClears;
  reconcilePartyBuilds(save.party, gameData);
  return save;
}

describe('assassin stage damage stats', () => {
  it('records dealt damage for at_assassin in party slot 0', () => {
    const gameData = loadGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.party = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) =>
      index === 0 ? createMemberFromClass('at_assassin', gameData) : null,
    );

    const tracker = runTrackedBattle(save, gameData, 6000);
    const rows = tracker.getDisplayRows(save.party, gameData.classRegistry);
    const assassinRow = rows.find((row) => row.classId === 'at_assassin');
    expect(assassinRow).toBeDefined();
    expect(assassinRow?.damageDealt).toBeGreaterThan(0);
  });

  it('records dealt damage for at_assassin in party slot 1 with duelist front', () => {
    const gameData = loadGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.party[0] = createMemberFromClass('df_duelist', gameData);
    save.party[1] = createMemberFromClass('at_assassin', gameData);

    const tracker = runTrackedBattle(save, gameData, 9000);
    const rows = tracker.getDisplayRows(save.party, gameData.classRegistry);
    const assassinRow = rows.find((row) => row.slotIndex === 1);
    expect(assassinRow?.classId).toBe('at_assassin');
    expect(assassinRow?.damageDealt).toBeGreaterThan(0);
  });

  it('records dealt damage for assassin alongside paladin and ballista', () => {
    const gameData = loadGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.party[0] = createMemberFromClass('df_paladin', gameData);
    save.party[1] = createMemberFromClass('at_assassin', gameData);
    save.party[2] = createMemberFromClass('sp_wardweaver', gameData);
    save.party[3] = createMemberFromClass('at_ballista', gameData);

    const tracker = runTrackedBattle(save, gameData);
    const rows = tracker.getDisplayRows(save.party, gameData.classRegistry);
    const assassinRow = rows.find((row) => row.classId === 'at_assassin');
    const ballistaRow = rows.find((row) => row.classId === 'at_ballista');

    expect(ballistaRow?.damageDealt).toBeGreaterThan(0);
    expect(assassinRow?.damageDealt).toBeGreaterThan(0);
  });

  it('records dealt damage for verify-save style mixed party', () => {
    const gameData = loadGameData();
    const save = createVerifyStyleSave(gameData);

    const tracker = runTrackedBattle(save, gameData, 1800);
    const assassinRow = tracker
      .getDisplayRows(save.party, gameData.classRegistry)
      .find((row) => row.classId === 'at_assassin');
    expect(assassinRow?.damageDealt).toBeGreaterThan(0);
  });

  it('keeps recording assassin dealt damage after shadow blade in verify-style party', () => {
    const gameData = loadGameData();
    const save = createVerifyStyleSave(gameData);
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage(save.stageProgress.currentStageId);

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        onDamageApplied: (actor, target, amount) => {
          tracker.recordDamage(actor, target, amount);
        },
      },
    );
    engine.startBattle();

    let damageAt900 = 0;
    for (let i = 0; i < 3600; i++) {
      engine.tick(TICK);
      if (i + 1 === 900) {
        damageAt900 =
          tracker
            .getDisplayRows(save.party, gameData.classRegistry)
            .find((row) => row.classId === 'at_assassin')?.damageDealt ?? 0;
      }
    }

    const damageAt3600 =
      tracker
        .getDisplayRows(save.party, gameData.classRegistry)
        .find((row) => row.classId === 'at_assassin')?.damageDealt ?? 0;

    expect(damageAt900).toBeGreaterThan(0);
    expect(damageAt3600).toBeGreaterThan(damageAt900);
  });
});
