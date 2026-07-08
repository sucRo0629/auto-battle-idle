import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { SPRITE_WIDTH, engagedMinBodyGap } from './battleConstants.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  resolveApproachFormationRangePx,
  resolveApproachRangePx,
  resolveFormationRangePx,
} from './combatPosition.ts';
import { resolveHostileEngageRangePx } from './skills/rangeUtils.ts';
import { PARTY_FORMATION_SLOT_SPACING } from './battleConstants.ts';

function createSoloMeleeEngine(classId: string): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.party = [
    createMemberFromClass(classId, gameData),
    null,
    null,
    null,
    null,
  ];
  save.stageProgress.currentStageId = '1';
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function createAssassinWithGuardianEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.party = [
    createMemberFromClass('df_guardian', gameData),
    createMemberFromClass('at_assassin', gameData),
    null,
    null,
    null,
  ];
  save.stageProgress.currentStageId = '1';
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

describe('assassin front engage body gap', () => {
  it('keeps assassin stop gap >= SPRITE_WIDTH after settle', () => {
    const engine = createSoloMeleeEngine('at_assassin');
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);
    for (let i = 0; i < 240; i++) engine.tick(TICK_DT);

    const ally = internal.players.find((p) => p.isAlive)!;
    const enemy = internal.enemies
      .filter((e) => e.isAlive)
      .sort((a, b) => a.battleX - b.battleX)[0]!;
    const gap = enemy.battleX - ally.battleX;
    const approachRange = resolveApproachRangePx(ally, internal.gameData);

    expect(ally.traits.rangePx).toBe(25);
    expect(resolveFormationRangePx(ally)).toBe(25);
    expect(resolveApproachFormationRangePx(ally)).toBe(25);
    expect(approachRange).toBe(engagedMinBodyGap());
    expect(approachRange).toBe(SPRITE_WIDTH);
    expect(gap).toBeGreaterThanOrEqual(SPRITE_WIDTH - 1);
    expect(ally.accessState).not.toBe('rearAssault');
  });

  it('floors hostile engage range without changing formation order keys', () => {
    expect(resolveHostileEngageRangePx(25)).toBe(SPRITE_WIDTH);
    expect(resolveHostileEngageRangePx(40)).toBe(40);
  });

  it('keeps assassin ahead of longer-range front melee after settle', () => {
    const engine = createAssassinWithGuardianEngine();
    reachWave1Engage(engine);
    for (let i = 0; i < 240; i++) engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    const guardian = snap.allies.find((a) => a.name === '鉄衛士' && a.hp > 0)!;
    const assassin = snap.allies.find((a) => a.name === '双刃士' && a.hp > 0)!;
    expect(assassin.battleX).toBeGreaterThan(guardian.battleX);
    expect(assassin.battleX - guardian.battleX).toBeLessThanOrEqual(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });
});
