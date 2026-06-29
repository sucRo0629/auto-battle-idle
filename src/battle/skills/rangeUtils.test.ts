import { describe, expect, it } from 'vitest';
import { resolveMaxEffectiveRangePx } from '../combatPosition.ts';
import type { CombatantState } from '../types.ts';
import { mockUnit } from '../testFixtures.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave2Engage,
} from '../test/battleFieldSpec.harness.ts';
import { battleDistance, isWithinSkillRange, resolveSkillRangePx } from './rangeUtils.ts';

function mockActor(rangePx: number): CombatantState {
  return mockUnit('ally', 0, { rangePx, formationRow: 'front' });
}

describe('battleDistance / isWithinSkillRange', () => {
  it('measures ally-to-enemy distance', () => {
    const ally = mockUnit('ally', 100);
    const enemy = mockUnit('e1', 200, { isEnemy: true });
    expect(battleDistance(ally, enemy)).toBe(-100);
    expect(isWithinSkillRange(ally, enemy, 120)).toBe(true);
    expect(isWithinSkillRange(ally, enemy, 80)).toBe(false);
  });

  it('hostile targets use abs battleX delta, including behind actor', () => {
    const ally = mockUnit('ally', 200);
    const enemyBehind = mockUnit('e-behind', 100, { isEnemy: true });
    expect(battleDistance(ally, enemyBehind)).toBe(100);
    expect(isWithinSkillRange(ally, enemyBehind, 120)).toBe(true);
    expect(isWithinSkillRange(ally, enemyBehind, 80)).toBe(false);
  });

  it('ally 52 vs enemy 360 with range 100 is out of range', () => {
    const ally = mockUnit('ally', 52);
    const enemy = mockUnit('enemy', 360, { isEnemy: true });
    expect(isWithinSkillRange(ally, enemy, 100)).toBe(false);
  });

  it('same-faction targets use abs battleX delta', () => {
    const rear = mockUnit('rear', 60, { formationRow: 'back' });
    const front = mockUnit('front', 180, { formationRow: 'front', rangePx: 0 });
    expect(isWithinSkillRange(rear, front, 120)).toBe(true);
    expect(isWithinSkillRange(rear, front, 119)).toBe(false);
  });
});

describe('isWithinSkillRange stage1 reproduction', () => {
  it('wave2 archer hits forward test_ranged while front row is still far', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (const unit of internal.players) {
      if (!unit.isAlive || unit.formationRow !== 'front') continue;
      unit.battleX = 30;
    }
    const archer = internal.players.find((p) => p.name === '弓術士')!;
    const enemy = internal.enemies.find(
      (e) => e.isAlive && e.name === 'test_ranged',
    )!;
    archer.battleX = 120;
    enemy.battleX = 155;

    const range = resolveMaxEffectiveRangePx(archer, internal.gameData);
    expect(isWithinSkillRange(archer, enemy, range)).toBe(true);
  });
});

describe('resolveSkillRangePx', () => {
  it('uses effect range when set', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, { range: 120 })).toBe(120);
  });

  it('falls back to actor traits.rangePx when omitted', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, {})).toBe(40);
  });

  it('extends ally-targeted heal range to party formation depth', () => {
    const actor = mockActor(90);
    expect(
      resolveSkillRangePx(
        actor,
        {
          type: 'heal',
          target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        },
        4,
      ),
    ).toBe(96);
  });

  it('extends ally-targeted buff range to party formation depth', () => {
    const actor = mockActor(90);
    expect(
      resolveSkillRangePx(
        actor,
        {
          type: 'buff',
          target: {
            kind: 'distance',
            side: 'ally',
            order: 'selfOrigin',
          },
        },
        4,
      ),
    ).toBe(96);
  });
});
