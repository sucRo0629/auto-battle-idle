import { describe, expect, it } from 'vitest';
import {
  ENEMY_HUD_STATUS_LAYOUT_SLOTS,
  ENEMY_HUD_STATUS_OVERFLOW_VISIBLE,
  selectEnemyHudStatusBadges,
} from './enemyHudStatusRow.ts';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';

function mockBadge(id: string): StatusEffectBadgeDisplay {
  return {
    kind: 'debuff',
    category: 'dot',
    statusEffectId: id,
    stackCount: 1,
    remainingRatio: 1,
    isPassive: false,
  };
}

describe('selectEnemyHudStatusBadges', () => {
  it('shows up to seven badges without overflow', () => {
    const badges = Array.from({ length: 7 }, (_, i) => mockBadge(`s${i}`));
    const result = selectEnemyHudStatusBadges(badges);
    expect(result.visible).toHaveLength(7);
    expect(result.overflowCount).toBe(0);
  });

  it('reserves the last slot for +N when more than seven badges exist', () => {
    const badges = Array.from({ length: 10 }, (_, i) => mockBadge(`s${i}`));
    const result = selectEnemyHudStatusBadges(badges);
    expect(result.visible).toHaveLength(ENEMY_HUD_STATUS_OVERFLOW_VISIBLE);
    expect(result.overflowCount).toBe(10 - ENEMY_HUD_STATUS_OVERFLOW_VISIBLE);
    expect(ENEMY_HUD_STATUS_LAYOUT_SLOTS).toBe(7);
  });
});
