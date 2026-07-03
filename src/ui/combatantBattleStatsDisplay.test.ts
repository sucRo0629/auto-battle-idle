import { describe, expect, it } from 'vitest';
import type { CombatantSnapshot } from '../battle/types.ts';
import { buildCombatantBattleStatRows } from './combatantBattleStatsDisplay.ts';

function mockAlly(
  overrides: Partial<CombatantSnapshot> = {},
): CombatantSnapshot {
  return {
    id: 'ally-0',
    name: 'Test',
    hp: 80,
    maxHp: 120,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 50,
    def: 30,
    res: 10,
    rangePx: 100,
    effectiveRangePx: 100,
    damageType: 'physical',
    spriteKey: 'test',
    iconKey: 'test',
    formationRow: 'front',
    isEnemy: false,
    battleX: 0,
    bodyAnimMarching: false,
    partySlotIndex: 0,
    statusEffects: [],
    activeCooldowns: [],
    ...overrides,
  };
}

describe('buildCombatantBattleStatRows', () => {
  it('shows current/max HP and maxHp delta', () => {
    const rows = buildCombatantBattleStatRows(
      mockAlly({ hp: 80, maxHp: 120, baseMaxHp: 100 }),
      'normal',
    );
    const hp = rows[0];
    expect(hp.label).toBe('HP');
    expect(hp.valueText).toBe('80 / 120');
    expect(hp.deltaText).toBe('(+20)');
    expect(hp.deltaKind).toBe('up');
  });

  it('shows atk/def/reg deltas with buff/debuff colors', () => {
    const rows = buildCombatantBattleStatRows(
      mockAlly({
        atk: 50,
        def: 30,
        res: 10,
        statusEffects: [
          {
            id: 'buff-atk',
            kind: 'buff',
            stat: 'atk',
            multiplier: 1.2,
            sourceId: 'skill',
            durationSec: 5,
            remainingSec: 5,
          },
          {
            id: 'debuff-def',
            kind: 'debuff',
            stat: 'def',
            multiplier: 0.8,
            sourceId: 'skill',
            durationSec: 5,
            remainingSec: 5,
          },
          {
            id: 'buff-reg',
            kind: 'buff',
            stat: 'res',
            flatBonus: 5,
            multiplier: 1,
            sourceId: 'skill',
            durationSec: 5,
            remainingSec: 5,
          },
        ],
      }),
      'normal',
    );

    expect(rows[1].valueText).toBe('60');
    expect(rows[1].deltaText).toBe('(+10)');
    expect(rows[1].deltaKind).toBe('up');

    expect(rows[2].valueText).toBe('24');
    expect(rows[2].deltaText).toBe('(-6)');
    expect(rows[2].deltaKind).toBe('down');

    expect(rows[3].valueText).toBe('15%');
    expect(rows[3].deltaText).toBe('(+5%)');
    expect(rows[3].deltaKind).toBe('up');
  });

  it('shows SPD tier and attackSpeed multiplier delta', () => {
    const rows = buildCombatantBattleStatRows(
      mockAlly({
        statusEffects: [
          {
            id: 'buff-spd',
            kind: 'buff',
            stat: 'attackSpeed',
            multiplier: 1.25,
            sourceId: 'skill',
            durationSec: 5,
            remainingSec: 5,
          },
        ],
      }),
      'somewhatSlow',
    );

    expect(rows[4].label).toBe('攻撃速度');
    expect(rows[4].valueText).toBe('やや遅い');
    expect(rows[4].deltaText).toBe('(×1.25)');
    expect(rows[4].deltaKind).toBe('up');
  });
});
