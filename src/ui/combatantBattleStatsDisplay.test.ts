import { describe, expect, it } from 'vitest';
import type { CombatantSnapshot } from '../battle/types.ts';
import {
  buildCombatantBattleStatRows,
  formatAttackIntervalSecValue,
} from './combatantBattleStatsDisplay.ts';

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

  it('shows legacy SPD tier when no attack interval is provided', () => {
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

  it('shows 攻撃間隔 in seconds when an attack interval is provided', () => {
    const rows = buildCombatantBattleStatRows(mockAlly(), 'normal', 2.5);
    expect(rows[4].label).toBe('攻撃間隔');
    expect(rows[4].valueText).toBe('2.5秒');
    expect(rows[4].deltaText).toBeNull();
    expect(rows[4].deltaKind).toBeNull();
  });

  it('drops trailing zeros for whole-second intervals', () => {
    const rows = buildCombatantBattleStatRows(mockAlly(), 'normal', 2);
    expect(rows[4].label).toBe('攻撃間隔');
    expect(rows[4].valueText).toBe('2秒');
  });

  it('keeps two decimals for values like 1.25', () => {
    const rows = buildCombatantBattleStatRows(mockAlly(), 'normal', 1.25);
    expect(rows[4].valueText).toBe('1.25秒');
  });

  it.each([NaN, 0, -1, Infinity])(
    'falls back to legacy 攻撃速度 for invalid interval %s',
    (interval) => {
      const rows = buildCombatantBattleStatRows(mockAlly(), 'normal', interval);
      expect(rows[4].label).toBe('攻撃速度');
      expect(rows[4].valueText).not.toContain('秒');
    },
  );
});

describe('formatAttackIntervalSecValue', () => {
  it('formats whole and fractional seconds without invalid strings', () => {
    expect(formatAttackIntervalSecValue(2)).toBe('2秒');
    expect(formatAttackIntervalSecValue(1.5)).toBe('1.5秒');
    expect(formatAttackIntervalSecValue(1.25)).toBe('1.25秒');
    expect(formatAttackIntervalSecValue(3)).toBe('3秒');
  });

  it('returns null for NaN, undefined-like, zero, and negatives', () => {
    expect(formatAttackIntervalSecValue(NaN)).toBeNull();
    expect(formatAttackIntervalSecValue(0)).toBeNull();
    expect(formatAttackIntervalSecValue(-2)).toBeNull();
    expect(formatAttackIntervalSecValue(Infinity)).toBeNull();
  });
});
