import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';
import { asBattleEngineInternals, TICK_DT } from './test/battleFieldSpec.harness.ts';
import { resolveAllPlayerApproachBattleX } from './resolveApproachBattleX.ts';
import { computePartyFormationBattleX } from './partyFormation.ts';
import {
  resolveApproachRangePx,
  resolveMinReadyEquippedActiveRangePx,
  resolveFormationRangePx,
} from './combatPosition.ts';

const LOG = 'debug-96f866.log';

function log(
  hypothesisId: string,
  location: string,
  message: string,
  data: unknown,
): void {
  appendFileSync(
    LOG,
    `${JSON.stringify({
      sessionId: '96f866',
      runId: 'pre-fix-script',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    })}\n`,
  );
}

describe('debug front row alchemist placement', () => {
  it('captures formation and approach evidence', () => {
    const gameData = structuredClone(loadGameData());
    gameData.classRegistry['sp_alchemist']!.formationRow = 'front';
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    const guardian = createMemberFromClass('df_guardian', gameData);
    const alchemist = createMemberFromClass('sp_alchemist', gameData);
    reconcileMemberBuildFromGameData(guardian, gameData);
    reconcileMemberBuildFromGameData(alchemist, gameData);
    save.party = [guardian, alchemist, null, null];

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();

    for (let t = 0; t < 3600; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const internal = asBattleEngineInternals(engine);
      const players = internal.players.filter((p) => p.isAlive);
      const enemies = internal.enemies.filter((e) => e.isAlive);
      if (players.length < 2 || enemies.length === 0) continue;

      const g = players.find((p) => p.classId === 'df_guardian')!;
      const a = players.find((p) => p.classId === 'sp_alchemist')!;

      const formation = computePartyFormationBattleX(
        players.map((p) => ({
          id: p.id,
          role: p.role,
          rangePx: resolveFormationRangePx(p),
          damageType: p.traits.damageType,
          formationRow: p.formationRow,
        })),
      );

      const approach = resolveAllPlayerApproachBattleX(
        players,
        enemies,
        gameData,
      );

      log('H1', 'debugFrontRowAlchemistRun', 'formation slots at engage', {
        guardianIdealX: formation.get(g.id),
        alchemistIdealX: formation.get(a.id),
        alchemistSlotAhead: (formation.get(a.id) ?? 0) > (formation.get(g.id) ?? 0),
      });

      log('H2-H5', 'debugFrontRowAlchemistRun', 'approach at first engaged tick', {
        guardian: {
          approachTargetX: approach.get(g.id),
          approachRangePx: resolveApproachRangePx(g, gameData, players.length),
          minReadyActiveRange: resolveMinReadyEquippedActiveRangePx(g, gameData),
        },
        alchemist: {
          approachTargetX: approach.get(a.id),
          approachRangePx: resolveApproachRangePx(a, gameData, players.length),
          minReadyActiveRange: resolveMinReadyEquippedActiveRangePx(a, gameData),
        },
        alchemistAheadOfGuardian:
          (approach.get(a.id) ?? 0) > (approach.get(g.id) ?? 0),
      });

      expect((approach.get(a.id) ?? 0)).toBeLessThanOrEqual(
        approach.get(g.id) ?? 0,
      );
      return;
    }
  });
});
