/**
 * battle-field.md §4.4 — back row attacks while front row chase target not reached.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  resolveEnemyApproachBattleX,
  resolvePlayerApproachBattleX,
} from './resolveApproachBattleX.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave1Engage,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

const SETTLED_PX = 0.5;
const gameData = loadGameData();

/** §4.4 chase: approach stop X not yet reached (independent of attack-pool skip). */
function isStillChasingApproachTarget(
  unit: Parameters<typeof resolvePlayerApproachBattleX>[0],
  players: Parameters<typeof resolvePlayerApproachBattleX>[1],
  enemies: Parameters<typeof resolvePlayerApproachBattleX>[2],
): boolean {
  const target = unit.isEnemy
    ? resolveEnemyApproachBattleX(unit, players, enemies, gameData)
    : resolvePlayerApproachBattleX(unit, players, enemies, gameData);
  return Math.abs(unit.battleX - target) > SETTLED_PX;
}

function syncFieldX(unit: { battleX: number; visualX: number }): void {
  unit.visualX = unit.battleX;
}

describe('battle-field §4.4 rear row attack during approach', () => {
  it('§4.4: back row (rangePx 100) attacks while front row chase stop X not reached', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    const rear = internal.players.find(
      (p) => p.isAlive && p.name === '弓術士',
    );
    expect(rear).toBeDefined();

    for (const unit of front) {
      unit.battleX = 40;
      syncFieldX(unit);
    }
    rear!.battleX = 180;
    syncFieldX(rear!);
    for (const enemy of internal.enemies.filter((e) => e.isAlive)) {
      enemy.battleX = 220;
      syncFieldX(enemy);
    }

    const rearRange = resolveMaxEffectiveRangePx(rear!, gameData);
    const nearestEnemy = internal.enemies.find((e) => e.isAlive)!;
    expect(isWithinSkillRange(rear!, nearestEnemy, rearRange)).toBe(true);
    expect(
      front.some((unit) =>
        isStillChasingApproachTarget(unit, internal.players, internal.enemies),
      ),
    ).toBe(true);

    const hpBefore = nearestEnemy.hp;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }
    expect(nearestEnemy.hp).toBeLessThan(hpBefore);
  });

  it('§4.4 wave 2: archer (rangePx 100) damages enemy (rangePx 100) while front chase stop X not reached', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    const archer = internal.players.find((p) => p.name === '弓術士');
    const longRangeEnemy = internal.enemies.find(
      (e) =>
        e.isAlive &&
        (e.traits.rangePx ?? 0) >= RANGED_ATTACK_MIN_PX &&
        e.name === 'test_ranged',
    );
    expect(archer).toBeDefined();
    expect(longRangeEnemy).toBeDefined();

    for (const unit of front) {
      unit.battleX = 30;
      syncFieldX(unit);
    }
    archer!.battleX = 120;
    syncFieldX(archer!);
    longRangeEnemy!.battleX = 155;
    syncFieldX(longRangeEnemy!);
    internal.enemies
      .filter((e) => e.isAlive && e.id !== longRangeEnemy!.id)
      .forEach((e) => {
        e.battleX = 400;
        syncFieldX(e);
      });

    const archerRange = resolveMaxEffectiveRangePx(archer!, gameData);
    expect(
      isWithinSkillRange(archer!, longRangeEnemy!, archerRange),
    ).toBe(true);
    expect(
      front.some((unit) =>
        isStillChasingApproachTarget(unit, internal.players, internal.enemies),
      ),
    ).toBe(true);

    const hpBefore = longRangeEnemy!.hp;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }
    expect(longRangeEnemy!.hp).toBeLessThan(hpBefore);
  });
});
