import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';

const TICK = 1 / 60;

describe('basicAttackCount gauge timing', () => {
  it('assassin decrements each basicAttackCount active at most once per engine tick', () => {
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

    type Sample = { t: number; remaining: Record<string, number> };
    const samples: Sample[] = [];

    for (let i = 0; i < 900; i++) {
      engine.tick(TICK);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const ally = snap.allies.find((unit) =>
        unit.activeCooldowns.some((cd) => cd.triggerKind === 'basicAttackCount'),
      );
      if (!ally) continue;

      const remaining: Record<string, number> = {};
      for (const cd of ally.activeCooldowns) {
        if (cd.triggerKind === 'basicAttackCount') {
          remaining[cd.skillId] = cd.remaining;
        }
      }
      if (Object.keys(remaining).length === 0) continue;
      samples.push({ t: i * TICK, remaining });
    }

    expect(samples.length).toBeGreaterThan(10);

    const drops: { t: number; skillId: string; delta: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]!;
      const cur = samples[i]!;
      for (const [skillId, value] of Object.entries(cur.remaining)) {
        const before = prev.remaining[skillId];
        if (before === undefined) continue;
        if (value < before) {
          drops.push({ t: cur.t, skillId, delta: before - value });
        }
      }
    }

    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every((drop) => drop.delta === 1)).toBe(true);

    const bySkill = new Map<string, number[]>();
    for (const drop of drops) {
      const times = bySkill.get(drop.skillId) ?? [];
      times.push(drop.t);
      bySkill.set(drop.skillId, times);
    }

    for (const times of bySkill.values()) {
      for (let i = 1; i < times.length; i++) {
        const gap = times[i]! - times[i - 1]!;
        if (gap >= 0.05 && gap < 1.2) {
          expect(gap).toBeGreaterThanOrEqual(0.08);
        }
      }
    }
  });
});
