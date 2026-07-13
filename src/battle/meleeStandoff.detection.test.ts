import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import { isCombatModuleBasicSkillId } from './data/resolveCombatModuleBasic.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from './types.ts';

function detectMeleeStandoff(stageId: string): string[] {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = stageId;
  for (const slot of save.party) {
    if (slot) slot.progress.level = 12;
  }

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => stageId,
  );
  const fired = new Set<string>();
  engine.onEvent((e) => {
    if (e.type === 'skill' && e.slotKind === 'basic') {
      fired.add(e.actorId);
    }
  });
  engine.startBattle();
  reachWave1Engage(engine);

  const issues: string[] = [];
  const stallTicks = new Map<string, number>();

  for (let i = 0; i < 3600; i++) {
    const snap = engine.getSnapshot();
    if (!snap.engaged) break;
    const internals = asBattleEngineInternals(engine);
    if (!internals.enemies.some((e) => e.isAlive)) break;

    for (const ally of internals.players) {
      if (!ally.isAlive) continue;
      if (!R5_COMBAT_MODULE_CLASS_IDS.includes(ally.classId as never)) continue;
      const basic = ally.cooldowns.find((c) => c.slotKind === 'basic');
      if (!basic) continue;
      if (!isCombatModuleBasicSkillId(basic.skillId, gameData.combatModuleRegistry)) {
        continue;
      }
      const skill = gameData.skillRegistry.actives[basic.skillId];
      const isDamageBasic = skill?.effect.some((e) => e.type === 'damage');
      if (!isDamageBasic) continue;
      if (basic.remaining > 0) {
        stallTicks.set(ally.id, 0);
        continue;
      }
      if (fired.has(ally.id)) {
        stallTicks.set(ally.id, 0);
        continue;
      }

      const skip = shouldSkipEngagedAutoApproach(
        ally,
        internals.players,
        internals.enemies,
        gameData,
      );
      if (skip) {
        const n = (stallTicks.get(ally.id) ?? 0) + 1;
        stallTicks.set(ally.id, n);
        if (n >= 120) {
          issues.push(
            `${ally.classId}(${basic.skillId}) skip=${skip} battleX=${ally.battleX.toFixed(1)} stallTicks=${n}`,
          );
        }
      } else {
        stallTicks.set(ally.id, 0);
      }
    }
    engine.tick(TICK_DT);
  }
  return issues;
}

describe('melee standoff detection', () => {
  for (const stageId of ['1', 'ranged_test', 'test']) {
    it(`no damage-basic standoff on ${stageId}`, () => {
      const issues = detectMeleeStandoff(stageId);
      expect(issues, issues.join('; ')).toEqual([]);
    });
  }
});
