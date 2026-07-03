import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadLevelCurves, getBasicCooldownRate } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createEnemyFromClassGroup,
  createEnemyFromTemplate,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import type { CombatantState, StageDef } from './types.ts';

function createMinimalEngine() {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

function tickCooldowns(
  engine: BattleEngine,
  units: CombatantState[],
  deltaTime: number,
): void {
  (
    engine as unknown as {
      tickCooldowns: (units: CombatantState[], deltaTime: number) => void;
    }
  ).tickCooldowns(units, deltaTime);
}

function setBasicCooldownRemaining(
  enemy: CombatantState,
  remaining: number,
): void {
  const basic = enemy.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (!basic) throw new Error('basic cooldown not found');
  basic.remaining = remaining;
}

describe('BattleEngine tickCooldowns enemy attackSpeedTier', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('uses classRegistry fallback for enemyGroups enemies', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const stage: StageDef = {
      id: 'tier_test',
      displayName: 'tier',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      waves: [{ enemies: [] }],
    };
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      gameData.classRegistry.df_paladin!,
      gameData,
      levelCurves,
    );
    setBasicCooldownRemaining(enemy, 10);

    const expectedRate = getBasicCooldownRate(
      gameData.classRegistry.df_paladin!.attackSpeedTier ?? 'normal',
      levelCurves,
    );
    expect(expectedRate).toBe(0.875);

    tickCooldowns(createMinimalEngine(), [enemy], 1);

    const basic = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(basic.remaining).toBeCloseTo(10 - expectedRate);
  });

  it('keeps enemyRegistry path for legacy enemies', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const template = gameData.enemyRegistry.stage1_1!;
    const enemy = createEnemyFromTemplate(template, 0);
    setBasicCooldownRemaining(enemy, 10);

    const expectedRate = getBasicCooldownRate('somewhatSlow', levelCurves);
    tickCooldowns(createMinimalEngine(), [enemy], 1);

    const basic = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(basic.remaining).toBeCloseTo(10 - expectedRate);
  });
});
