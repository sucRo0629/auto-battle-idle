import { describe, expect, it } from 'vitest';
import { isRangedAttack } from './data/entityTraits.ts';
import { loadGameData } from './data/loadGameData.ts';
import { resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  shouldSkipEngagedAutoApproach,
  resolvePlayerApproachBattleX,
  resolveEnemyApproachBattleX,
} from './resolveApproachBattleX.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave1Engage,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

const SETTLED_PX = 0.5;
const gameData = loadGameData();

function isStillApproaching(
  unit: Parameters<typeof resolvePlayerApproachBattleX>[0],
  players: Parameters<typeof resolvePlayerApproachBattleX>[1],
  enemies: Parameters<typeof resolvePlayerApproachBattleX>[2],
): boolean {
  if (shouldSkipEngagedAutoApproach(unit, players, enemies, gameData)) {
    return false;
  }
  const target = unit.isEnemy
    ? resolveEnemyApproachBattleX(unit, players, enemies, gameData)
    : resolvePlayerApproachBattleX(unit, players, enemies, gameData);
  return Math.abs(unit.battleX - target) > SETTLED_PX;
}

describe('rear row attack during approach', () => {
  it('ally back row attacks while front row is still approaching', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    const rear = internal.players.find(
      (p) => p.isAlive && p.name === '弓術士',
    );
    const enemy = internal.enemies.find((e) => e.isAlive);
    expect(front.length).toBeGreaterThan(0);
    expect(rear).toBeDefined();
    expect(enemy).toBeDefined();

    for (const unit of front) {
      unit.battleX = 40;
      unit.battleX = 40;
    }
    rear!.battleX = 180;
    rear!.battleX = 180;
    enemy!.battleX = 220;
    enemy!.battleX = 220;

    const rearRange = resolveMaxEffectiveRangePx(rear!, gameData);
    expect(isWithinSkillRange(rear!, enemy!, rearRange)).toBe(true);
    expect(front.some((unit) => isStillApproaching(unit, internal.players, internal.enemies))).toBe(
      true,
    );

    const hpBefore = enemy!.hp;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }
    expect(enemy!.hp).toBeLessThan(hpBefore);
  });

  it('wave 2: archer damages ranged enemy while front row still approaching', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const front = internal.players.filter(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    const archer = internal.players.find((p) => p.name === '弓術士');
    const rangedEnemy = internal.enemies.find(
      (e) => e.isAlive && isRangedAttack(e.traits.rangePx ?? 0),
    );
    expect(archer).toBeDefined();
    expect(rangedEnemy).toBeDefined();

    for (const unit of front) {
      unit.battleX = 40;
      unit.battleX = 40;
    }
    archer!.battleX = 180;
    archer!.battleX = 180;
    rangedEnemy!.battleX = 210;
    rangedEnemy!.battleX = 210;
    internal.enemies
      .filter((e) => e.isAlive && e.id !== rangedEnemy!.id)
      .forEach((e) => {
        e.battleX = 400;
        e.battleX = 400;
      });

    const rearRange = resolveMaxEffectiveRangePx(archer!, gameData);
    expect(isWithinSkillRange(archer!, rangedEnemy!, rearRange)).toBe(true);
    expect(
      front.some((unit) =>
        isStillApproaching(unit, internal.players, internal.enemies),
      ),
    ).toBe(true);

    const hpBefore = rangedEnemy!.hp;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }
    expect(rangedEnemy!.hp).toBeLessThan(hpBefore);
  });
});
