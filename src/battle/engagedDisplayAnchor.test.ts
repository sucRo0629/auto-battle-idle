import { describe, expect, it } from 'vitest';
import {
  clearEngagedDisplayAnchor,
  getEngagedDisplayAnchorPlayerId,
  setEngagedDisplayAnchorPlayerId,
} from './battleDisplay.ts';
import type { CombatantState } from './types.ts';

function makeEnemy(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    id: 'enemy-1',
    name: 'test',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 100, damageType: 'physical' },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'test',
    iconKey: 'test',
    isEnemy: true,
    battleX: 200,
    visualX: 200,
    corpseVisible: false,
    ...overrides,
  };
}

describe('engagedDisplayAnchor helpers', () => {
  it('set writes canonical field and deprecated aliases', () => {
    const enemy = makeEnemy();
    setEngagedDisplayAnchorPlayerId(enemy, 'player-a');
    expect(enemy.engagedDisplayAnchorPlayerId).toBe('player-a');
    expect(enemy.engagedVisualTargetPlayerId).toBe('player-a');
    expect(enemy.engagedVisualTargetAllyId).toBe('player-a');
  });

  it('get prefers engagedDisplayAnchorPlayerId', () => {
    const enemy = makeEnemy({
      engagedDisplayAnchorPlayerId: 'canonical',
      engagedVisualTargetPlayerId: 'legacy-player',
      engagedVisualTargetAllyId: 'legacy-ally',
    });
    expect(getEngagedDisplayAnchorPlayerId(enemy)).toBe('canonical');
  });

  it('get falls back to engagedVisualTargetPlayerId then engagedVisualTargetAllyId', () => {
    const legacyPlayer = makeEnemy({ engagedVisualTargetPlayerId: 'legacy-player' });
    expect(getEngagedDisplayAnchorPlayerId(legacyPlayer)).toBe('legacy-player');

    const legacyAlly = makeEnemy({ engagedVisualTargetAllyId: 'legacy-ally' });
    expect(getEngagedDisplayAnchorPlayerId(legacyAlly)).toBe('legacy-ally');
  });

  it('clear removes all alias fields', () => {
    const enemy = makeEnemy();
    setEngagedDisplayAnchorPlayerId(enemy, 'player-a');
    clearEngagedDisplayAnchor(enemy);
    expect(enemy.engagedDisplayAnchorPlayerId).toBeUndefined();
    expect(enemy.engagedVisualTargetPlayerId).toBeUndefined();
    expect(enemy.engagedVisualTargetAllyId).toBeUndefined();
  });
});
