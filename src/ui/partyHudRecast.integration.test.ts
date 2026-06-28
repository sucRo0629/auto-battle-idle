import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../battle/BattleEngine.ts';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { resolveRecastFillView } from './partyHudRecast.ts';

function createEngine() {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

describe('partyHudRecast integration', () => {
  it('time-trigger active CD remaining decreases and fill width increases before engagement', () => {
    const engine = createEngine();

    const readTimeActive = () => {
      const snap = engine.getSnapshot();
      const ally = snap.allies.find((unit) =>
        unit.activeCooldowns.some(
          (cd) => cd.triggerKind === 'time' && cd.remaining > 0,
        ),
      );
      if (!ally) return null;
      const cd = ally.activeCooldowns.find(
        (c) => c.triggerKind === 'time' && c.remaining > 0,
      );
      if (!cd) return null;
      return {
        remaining: cd.remaining,
        triggerValue: cd.triggerValue,
        widthPct: resolveRecastFillView(cd, ally.useLocked ?? false).widthPct,
      };
    };

    const before = readTimeActive();
    expect(before).not.toBeNull();

    for (let i = 0; i < 30; i++) {
      engine.tick(0.1);
    }

    const after = readTimeActive();
    expect(after).not.toBeNull();
    expect(after!.remaining).toBeLessThan(before!.remaining);
    expect(after!.widthPct).toBeGreaterThan(before!.widthPct);
  });
});
