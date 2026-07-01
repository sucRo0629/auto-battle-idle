import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import { resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { isRangedAttack } from './data/entityTraits.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  COMBAT_CAMERA_CENTER_X,
  COMBAT_SAFE_LEFT,
  PARTY_FORMATION_SLOT_SPACING,
} from './battleConstants.ts';

describe('engage approach skill fixes', () => {
  it('wave2: iron guard approaches during use lock without pauseApproach', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const iron = internal.players.find((p) => p.name === '鉄衛士')!;
    for (const enemy of internal.enemies) {
      if (!enemy.isAlive) continue;
      enemy.battleX = iron.battleX + 100;
    }
    internal.skillSequenceRunner.beginUse(iron.id, 2);
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
  });

  it('wave2: iron guard does not approach during pauseApproach use lock', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const iron = internal.players.find((p) => p.name === '鉄衛士')!;
    for (const enemy of internal.enemies) {
      if (!enemy.isAlive) continue;
      enemy.battleX = iron.battleX + 100;
    }
    internal.skillSequenceRunner.beginUse(iron.id, 2, { pauseApproach: true });
    const startX = iron.battleX;

    let movedWhilePauseApproach = false;
    for (let t = 0; t < 90; t++) {
      const pauseApproach =
        internal.skillSequenceRunner.isActorUseLockPauseApproach(iron.id);
      const pre = iron.battleX;
      engine.tick(TICK_DT);
      if (pauseApproach && Math.abs(iron.battleX - pre) > 0.01) {
        movedWhilePauseApproach = true;
      }
    }

    expect(movedWhilePauseApproach).toBe(false);
    expect(Math.abs(iron.battleX - startX)).toBeLessThan(0.5);
  });

  it('ally back row attacks from formation depth when enemy enters range', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const archer = internal.players.find((p) => p.name === '弓術士')!;

    for (const enemy of internal.enemies) {
      if (!enemy.isAlive || enemy.name !== 'test_ranged') continue;
      enemy.battleX = archer.battleX + 35;
      enemy.battleX = enemy.battleX;
    }

    const hpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .map((e) => e.hp)
      .reduce((a, b) => a + b, 0);
    let damaged = false;
    for (let t = 0; t < 300; t++) {
      engine.tick(TICK_DT);
      const hpNow = internal.enemies
        .filter((e) => e.isAlive)
        .map((e) => e.hp)
        .reduce((a, b) => a + b, 0);
      if (hpNow < hpBefore) {
        damaged = true;
        break;
      }
    }
    expect(damaged).toBe(true);
  });

  it('ally back row attacks while front row is still approaching', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (const unit of internal.players) {
      if (!unit.isAlive || unit.formationRow !== 'front') continue;
      unit.battleX = COMBAT_SAFE_LEFT - 50;
      unit.battleX = COMBAT_SAFE_LEFT - 50;
    }
    const archer = internal.players.find((p) => p.name === '弓術士')!;
    const enemy = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_ranged',
    )!;
    archer.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING * 2;
    archer.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING * 2;
    enemy.battleX = archer.battleX + 80;
    enemy.battleX = archer.battleX + 80;

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
    const internal = asBattleEngineInternals(engine);

    for (const unit of internal.players) {
      if (!unit.isAlive || unit.formationRow !== 'front') continue;
      unit.battleX = COMBAT_SAFE_LEFT - 50;
      unit.battleX = COMBAT_SAFE_LEFT - 50;
    }
    const melee = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_enemy',
    )!;
    const ranged = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_ranged',
    )!;
    melee.battleX = COMBAT_SAFE_LEFT + 80;
    melee.battleX = COMBAT_SAFE_LEFT + 80;
    ranged.battleX = COMBAT_SAFE_LEFT + 160;
    ranged.battleX = COMBAT_SAFE_LEFT + 160;

    const target = internal.players.find((p) => p.name === '弓術士')!;
    target.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING * 2;
    target.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING * 2;

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
            isRangedAttack(actor.traits.rangePx ?? 0) &&
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
