import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type { CombatantState } from './types.ts';

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

function getAllies(engine: BattleEngine): CombatantState[] {
  return (engine as unknown as { players: CombatantState[] }).players;
}

describe('BattleEngine out-of-combat ticking', () => {
  it('starts all skill cooldowns unfilled at stage start', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    const basicCd = guardian.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const activeCd = guardian.cooldowns.find((cd) => cd.slotKind === 'active')!;

    expect(basicCd.remaining).toBeGreaterThan(0);
    expect(activeCd.remaining).toBeGreaterThan(0);
  });

  it('ticks buff duration and active cooldowns during wave intermission', () => {
    const engine = createEngine();
    const snap = engine.getSnapshot();
    expect(snap.engaged).toBe(false);

    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    const activeCd = guardian.cooldowns.find((cd) => cd.slotKind === 'active')!;
    activeCd.remaining = 5;
    guardian.statusEffects.push({
      id: 'test_buff',
      kind: 'buff',
      stat: 'def',
      multiplier: 1.5,
      remainingSec: 4,
      durationSec: 4,
    });

    engine.tick(1);

    expect(activeCd.remaining).toBeCloseTo(4, 5);
    const buff = guardian.statusEffects.find((e) => e.id === 'test_buff');
    expect(buff?.remainingSec).toBeCloseTo(3, 5);
  });

  it('ticks DoT/HoT overlay durations before engagement', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    guardian.statusEffects.push({
      id: 'test_dot',
      kind: 'debuff',
      overlay: 'dot',
      sourceId: guardian.id,
      amount: { kind: 'flat', flatAmount: 1 },
      remainingSec: 3,
      durationSec: 3,
      tickSec: 1,
    });

    engine.tick(0.5);

    const dot = guardian.statusEffects.find((e) => e.id === 'test_dot');
    expect(dot?.remainingSec).toBeCloseTo(2.5, 5);
  });

  it('does not advance periodic HoT during wave advance death delay', () => {
    const engine = createEngine();
    for (let i = 0; i < 120; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.enemies.length > 0 && !snap.engaged) break;
    }

    const cleric = getAllies(engine).find((a) => a.classId === 'sp_cleric')!;

    const internal = engine as unknown as {
      beginEnemyWipeSettle: (hasNextWave: boolean) => void;
      pendingNextWaveIndex: number | null;
      enemies: CombatantState[];
      periodicHotStates: Map<string, { passiveId: string; remainingSec: number }[]>;
    };
    for (const enemy of internal.enemies) {
      enemy.isAlive = false;
    }
    internal.periodicHotStates.set(cleric.id, [
      { passiveId: 'sp_cleric_passive_1', remainingSec: 5 },
    ]);
    internal.pendingNextWaveIndex = 1;
    internal.beginEnemyWipeSettle(true);

    const before = internal.periodicHotStates.get(cleric.id)![0]!.remainingSec;
    engine.tick(0.5);
    const after = internal.periodicHotStates.get(cleric.id)![0]!.remainingSec;
    expect(after).toBe(before);
  });
});
