import { describe, expect, it } from 'vitest';
import {
  COMBAT_SAFE_AREA_HUD_GAP,
  COMBAT_SAFE_CENTER_X,
  COMBAT_SAFE_LEFT,
  COMBAT_SAFE_RIGHT,
  COMBAT_SAFE_WIDTH,
} from './combatSafeArea.ts';
import {
  enemyHudLeftEdge,
  partyHudRightEdge,
} from '../ui/battleHudGeometry.ts';
import {
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_SIDE_HUD_WIDTH,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_SLOT_RECT,
} from '../ui/battleRootLayout.ts';
import { PARTY_FORMATION_LEFT_ANCHOR } from './battleConstants.ts';

describe('combatSafeArea', () => {
  it('clears party HUD with configured gap', () => {
    expect(partyHudRightEdge()).toBe(
      PARTY_HUD_SLOT_RECT.x + PARTY_HUD_SLOT_RECT.w,
    );
    expect(COMBAT_SAFE_LEFT).toBe(
      partyHudRightEdge() + COMBAT_SAFE_AREA_HUD_GAP,
    );
    expect(COMBAT_SAFE_LEFT).toBeGreaterThanOrEqual(320);
    expect(COMBAT_SAFE_LEFT).toBeLessThanOrEqual(360);
  });

  it('clears enemy HUD with configured gap', () => {
    expect(enemyHudLeftEdge()).toBe(ENEMY_HUD_SLOT_RECT.x);
    expect(COMBAT_SAFE_RIGHT).toBe(
      enemyHudLeftEdge() - COMBAT_SAFE_AREA_HUD_GAP,
    );
    expect(COMBAT_SAFE_RIGHT).toBeLessThanOrEqual(960);
    expect(COMBAT_SAFE_RIGHT).toBeGreaterThanOrEqual(900);
  });

  it('centers play area between HUD columns', () => {
    expect(COMBAT_SAFE_WIDTH).toBe(COMBAT_SAFE_RIGHT - COMBAT_SAFE_LEFT);
    expect(COMBAT_SAFE_CENTER_X).toBe(
      (COMBAT_SAFE_LEFT + COMBAT_SAFE_RIGHT) / 2,
    );
  });

  it('anchors party formation at combat safe left', () => {
    expect(PARTY_FORMATION_LEFT_ANCHOR).toBe(COMBAT_SAFE_LEFT);
  });

  it('matches battle-root HUD slot geometry', () => {
    expect(PARTY_HUD_SLOT_RECT.x).toBe(BATTLE_HUD_SIDE_MARGIN);
    expect(PARTY_HUD_SLOT_RECT.w).toBe(BATTLE_SIDE_HUD_WIDTH);
    expect(ENEMY_HUD_SLOT_RECT.w).toBe(BATTLE_SIDE_HUD_WIDTH);
  });
});
