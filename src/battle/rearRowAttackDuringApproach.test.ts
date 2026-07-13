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
import { resolveUnitAttackMethod } from './data/resolveUnitAttackMethod.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  reachWave1Engage,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  COMBAT_CAMERA_CENTER_X,
  COMBAT_SAFE_LEFT,
  PARTY_FORMATION_SLOT_SPACING,
} from './battleConstants.ts';

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

    rear!.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING;
    const nearestEnemy = internal.enemies.find((e) => e.isAlive)!;
    nearestEnemy.battleX = rear!.battleX + 80;
    for (const enemy of internal.enemies.filter(
      (e) => e.isAlive && e.id !== nearestEnemy.id,
    )) {
      enemy.battleX = COMBAT_CAMERA_CENTER_X + 200;
    }

    for (const unit of front) {
      const stopX = resolvePlayerApproachBattleX(
        unit,
        internal.players,
        internal.enemies,
        gameData,
      );
      unit.battleX = stopX - 80;
    }

    const rearRange = resolveMaxEffectiveRangePx(rear!, gameData);
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
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    const archer = internal.players.find((p) => p.name === '弓術士');
    const longRangeEnemy = internal.enemies.find(
      (e) =>
        e.isAlive &&
        resolveUnitAttackMethod(e, internal.gameData) === 'ranged' &&
        e.name === 'test_ranged',
    );
    expect(archer).toBeDefined();
    expect(longRangeEnemy).toBeDefined();
    expect(front.length).toBeGreaterThan(0);

    for (const unit of front) {
      unit.battleX = COMBAT_SAFE_LEFT - 200;
    }
    archer!.battleX = COMBAT_SAFE_LEFT + PARTY_FORMATION_SLOT_SPACING * 2;
    longRangeEnemy!.battleX = archer!.battleX + 80;
    internal.enemies
      .filter((e) => e.isAlive && e.id !== longRangeEnemy!.id)
      .forEach((e) => {
        e.battleX = COMBAT_CAMERA_CENTER_X + 200;
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
