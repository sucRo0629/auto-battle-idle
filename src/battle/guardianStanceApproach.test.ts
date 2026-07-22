/**
 * battle-field.md §4.4 — stance Module (target:self) still approaches enemies.
 * 鉄衛士 / 護法士: basic が self buff でも ChaseTarget は敵、射程外では接近継続。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { mockCombatant } from './testFixtures.ts';
import { SPRITE_WIDTH } from './battleConstants.ts';
import {
  shouldSkipEngagedAutoApproach,
  resolvePlayerAttackTargetEnemy,
  resolvePlayerChaseTargetEnemy,
  resolvePlayerApproachBattleX,
} from './resolveApproachBattleX.ts';
import { resolveBasicAttackEffect } from './allyHealBasicAttack.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

function makeStanceFrontliner(classId: 'df_guardian' | 'df_paladin') {
  const preset = gameData.classRegistry[classId]!;
  const unit = createAllyFromMember(
    {
      classId,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      progress: { level: 10, exp: 0 },
    },
    preset,
    levelCurves,
    gameData,
  );
  unit.battleX = 100;
  return unit;
}

describe('battle-field §4.4 stance module approach', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('iron guard (self stance basic) chases far enemy and does not skip approach', () => {
    const guardian = makeStanceFrontliner('df_guardian');
    const enemy = mockCombatant({
      id: 'far_enemy',
      isEnemy: true,
      battleX: 400,
      name: 'enemy',
    });

    const effect = resolveBasicAttackEffect(guardian, gameData);
    expect(effect?.type).toBe('buff');
    expect(effect?.target).toEqual({ kind: 'self' });

    expect(
      resolvePlayerChaseTargetEnemy(
        guardian,
        [guardian],
        [enemy],
        gameData,
      )?.id,
    ).toBe(enemy.id);
    expect(
      resolvePlayerAttackTargetEnemy(
        guardian,
        [guardian],
        [enemy],
        gameData,
      ),
    ).toBeNull();
    expect(
      shouldSkipEngagedAutoApproach(
        guardian,
        [guardian],
        [enemy],
        gameData,
      ),
    ).toBe(false);

    const approachX = resolvePlayerApproachBattleX(
      guardian,
      [guardian],
      [enemy],
      gameData,
    );
    expect(approachX).toBeGreaterThan(guardian.battleX);
    expect(approachX).toBeLessThan(enemy.battleX);
  });

  it('iron guard skips approach only when enemy is within melee engage range', () => {
    const guardian = makeStanceFrontliner('df_guardian');
    const enemy = mockCombatant({
      id: 'near_enemy',
      isEnemy: true,
      battleX: guardian.battleX + SPRITE_WIDTH,
      name: 'enemy',
    });

    expect(
      resolvePlayerAttackTargetEnemy(
        guardian,
        [guardian],
        [enemy],
        gameData,
      )?.id,
    ).toBe(enemy.id);
    expect(
      shouldSkipEngagedAutoApproach(
        guardian,
        [guardian],
        [enemy],
        gameData,
      ),
    ).toBe(true);
  });

  it('paladin (self stance basic) also approaches far enemy', () => {
    const paladin = makeStanceFrontliner('df_paladin');
    const enemy = mockCombatant({
      id: 'far_enemy',
      isEnemy: true,
      battleX: 400,
      name: 'enemy',
    });

    expect(
      shouldSkipEngagedAutoApproach(paladin, [paladin], [enemy], gameData),
    ).toBe(false);
    expect(
      resolvePlayerApproachBattleX(paladin, [paladin], [enemy], gameData),
    ).toBeGreaterThan(paladin.battleX);
  });
});
