import { describe, expect, it } from 'vitest';
import { resolvePlayerAttackTargetEnemy } from './resolveApproachBattleX.ts';
import { resolveFacingSign } from './combatFacing.ts';
import {
  forwardDistancePx,
  isInForwardSegment,
  isWithinSkillRange,
} from './skills/rangeUtils.ts';
import { resolveEffectTargets } from './skills/targeting.ts';
import { mockUnit } from './testFixtures.ts';
import type { GameData } from './types.ts';

const gameData = {
  skillRegistry: {
    passives: {},
    actives: {
      at_assassin_basic_attack: {
        id: 'at_assassin_basic_attack',
        name: 'basic',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
            type: 'damage',
            amount: { kind: 'atkBased', atkScale: 0.5 },
            targetShape: 'single',
            hitCount: 2,
            hitDurationSec: 0.2,
          },
        ],
      },
    },
  },
} as unknown as GameData;

describe('behind-facing attack', () => {
  it('resolves attack target and flipped facing when enemy is behind player in range', () => {
    const assassin = mockUnit('assassin', 225, {
      classId: 'at_assassin',
      traits: { rangePx: 25, damageType: 'physical', basicAttackVfx: { enabled: true } },
      build: {
        learnedPassiveIds: ['at_assassin_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enemy = mockUnit('enemy', 200, { isEnemy: true });

    expect(isWithinSkillRange(assassin, enemy, 25)).toBe(true);
    expect(forwardDistancePx(assassin, enemy)).toBeLessThan(0);

    const attackTarget = resolvePlayerAttackTargetEnemy(
      assassin,
      [assassin],
      [enemy],
      gameData,
    );
    expect(attackTarget?.id).toBe('enemy');

    const facingSign = resolveFacingSign(assassin, attackTarget);
    expect(facingSign).toBe(-1);
    expect(isInForwardSegment(assassin, enemy, 25, facingSign)).toBe(true);

    const effect = gameData.skillRegistry.actives.at_assassin_basic_attack!.effect[0]!;
    const targets = resolveEffectTargets(
      effect,
      assassin,
      [assassin],
      [enemy],
      gameData,
    );
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets.every((unit) => unit.id === 'enemy')).toBe(true);
  });
});
