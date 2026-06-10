import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import { resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import {
  createStage1Engine,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

type InternalEngine = BattleEngine & {
  players: Array<{
    id: string;
    name: string;
    battleX: number;
    visualX: number;
    hp: number;
    isAlive: boolean;
    formationRow: string;
    cooldowns: Array<{ remaining: number; slotKind: string; skillId: string }>;
  }>;
  enemies: Array<{
    id: string;
    name: string;
    battleX: number;
    visualX: number;
    hp: number;
    isAlive: boolean;
    cooldowns: Array<{ remaining: number; slotKind: string }>;
  }>;
  skillSequenceRunner: {
    isActorBusy: (id: string) => boolean;
    isActorInSkillMotion: (id: string) => boolean;
  };
};

describe('engage approach skill fixes', () => {
  it('wave2: iron guard approaches while active useDuration lock is active', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = engine as unknown as InternalEngine;
    const iron = internal.players.find((p) => p.name === '鉄衛士')!;
    const startX = iron.battleX;

    let movedWhileUseLocked = false;
    for (let t = 0; t < 240; t++) {
      const busy = internal.skillSequenceRunner.isActorBusy(iron.id);
      const motion = internal.skillSequenceRunner.isActorInSkillMotion(iron.id);
      const pre = iron.battleX;
      engine.tick(TICK_DT);
      if (busy && !motion && Math.abs(iron.battleX - pre) > 0.01) {
        movedWhileUseLocked = true;
      }
    }

    expect(movedWhileUseLocked).toBe(true);
    expect(iron.battleX).toBeGreaterThan(startX + 1);
  });

  it('ally back row attacks from formation depth when enemy enters range', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = engine as unknown as InternalEngine;
    const archer = internal.players.find((p) => p.name === '弓術士')!;
    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );

    for (const enemy of internal.enemies) {
      if (!enemy.isAlive || enemy.name !== 'test_ranged') continue;
      enemy.battleX = archer.battleX + 35;
      enemy.visualX = enemy.battleX;
    }

    const hpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .map((e) => e.hp)
      .reduce((a, b) => a + b, 0);
    let damaged = false;
    let frontStillApproaching = false;
    for (let t = 0; t < 300; t++) {
      engine.tick(TICK_DT);
      const hpNow = internal.enemies
        .filter((e) => e.isAlive)
        .map((e) => e.hp)
        .reduce((a, b) => a + b, 0);
      if (hpNow < hpBefore) {
        damaged = true;
        frontStillApproaching = front.some(
          (unit) =>
            !shouldSkipEngagedAutoApproach(
              unit as never,
              internal.players as never,
              internal.enemies as never,
              internal.gameData,
            ),
        );
        break;
      }
    }
    expect(damaged).toBe(true);
    expect(frontStillApproaching).toBe(true);
  });

  it('ally back row attacks while front row is still approaching', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = engine as unknown as InternalEngine;

    for (const unit of internal.players) {
      if (!unit.isAlive || unit.formationRow !== 'front') continue;
      unit.battleX = 30;
      unit.visualX = 30;
    }
    const archer = internal.players.find((p) => p.name === '弓術士')!;
    const enemy = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_ranged',
    )!;
    archer.battleX = 120;
    archer.visualX = 120;
    enemy.battleX = 155;
    enemy.visualX = 155;

    const range = resolveMaxEffectiveRangePx(archer as never, internal.gameData);
    expect(isWithinSkillRange(archer as never, enemy as never, range)).toBe(
      true,
    );

    const hpBefore = enemy.hp;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }
    expect(enemy.hp).toBeLessThan(hpBefore);
  });

  it('enemy back line attacks while melee front is still approaching', () => {
    let rangedHit = false;
    const gameData = structuredClone(loadGameData());
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    const engine = new BattleEngine(
      gameData,
      loadLevelCurves(levelCurvesJson),
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        onDamageApplied: (actor, _target, amount) => {
          if (actor.isEnemy && actor.name === 'test_ranged' && amount > 0) {
            rangedHit = true;
          }
        },
      },
    );
    engine.startBattle();
    reachWave2Engage(engine);
    const internal = engine as unknown as InternalEngine;

    for (const unit of internal.players) {
      if (!unit.isAlive || unit.formationRow !== 'front') continue;
      unit.battleX = 30;
      unit.visualX = 30;
    }
    const melee = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_enemy',
    )!;
    const ranged = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_ranged',
    )!;
    melee.battleX = 80;
    melee.visualX = 80;
    ranged.battleX = 155;
    ranged.visualX = 155;

    const target = internal.players.find((p) => p.name === '弓術士')!;
    target.battleX = 120;
    target.visualX = 120;

    const range = resolveMaxEffectiveRangePx(ranged as never, internal.gameData);
    expect(
      isWithinSkillRange(ranged as never, target as never, range),
    ).toBe(true);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      if (rangedHit) break;
    }
    expect(rangedHit).toBe(true);
  });

  it('enemy ranged damages players during natural wave 2 fight', () => {
    let rangedHit = false;
    const gameData = structuredClone(loadGameData());
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    const engine = new BattleEngine(
      gameData,
      loadLevelCurves(levelCurvesJson),
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        onDamageApplied: (actor, target, amount) => {
          if (
            actor.isEnemy &&
            (actor.traits.rangePx ?? 0) >= 25 &&
            target.isEnemy === false &&
            amount > 0
          ) {
            rangedHit = true;
          }
        },
      },
    );
    engine.startBattle();
    reachWave2Engage(engine);

    for (let t = 0; t < 12_000; t++) {
      engine.tick(TICK_DT);
      if (rangedHit) break;
    }
    expect(rangedHit).toBe(true);
  });
});
