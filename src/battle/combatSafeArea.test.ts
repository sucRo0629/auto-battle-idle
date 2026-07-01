import { describe, expect, it } from 'vitest';
import {
  COMBAT_SAFE_AREA_HUD_GAP,
  COMBAT_SAFE_CANVAS_GROUND_LINE_Y,
  COMBAT_SAFE_CANVAS_HEIGHT,
  COMBAT_SAFE_CENTER_X,
  COMBAT_SAFE_LEFT,
  COMBAT_SAFE_RIGHT,
  COMBAT_SAFE_SCREEN_GROUND_Y,
  COMBAT_SAFE_SCREEN_TOP_Y,
  COMBAT_SAFE_WIDTH,
  clampCombatDisplayY,
} from './combatSafeArea.ts';
import {
  BATTLE_HUD_SIDE_MARGIN,
  combatSafeRightScreenEdge,
} from '../ui/battleHudGeometry.ts';
import {
  BATTLE_TOP_INFO_RECT,
  BATTLE_CANVAS_HEIGHT,
  BATTLE_GROUND_LINE_SCREEN_Y,
  BATTLE_LANE_TOP,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_SLOT_RECT,
} from '../ui/battleRootLayout.ts';
import { BATTLE_ROOT_WIDTH } from '../ui/battleRootScale.ts';
import { PARTY_FORMATION_LEFT_ANCHOR } from './battleConstants.ts';

describe('combatSafeArea', () => {
  it('anchors combat safe left to screen margin (not bottom partyHud)', () => {
    expect(COMBAT_SAFE_LEFT).toBe(
      BATTLE_HUD_SIDE_MARGIN + COMBAT_SAFE_AREA_HUD_GAP,
    );
    expect(COMBAT_SAFE_LEFT).toBe(72);
  });

  it('anchors combat safe right to screen margin (no right HUD column)', () => {
    expect(combatSafeRightScreenEdge()).toBe(
      BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN,
    );
    expect(COMBAT_SAFE_RIGHT).toBe(
      combatSafeRightScreenEdge() - COMBAT_SAFE_AREA_HUD_GAP,
    );
    expect(COMBAT_SAFE_RIGHT).toBe(1208);
  });

  it('centers play area between left and right screen margins', () => {
    expect(COMBAT_SAFE_WIDTH).toBe(COMBAT_SAFE_RIGHT - COMBAT_SAFE_LEFT);
    expect(COMBAT_SAFE_CENTER_X).toBe(
      (COMBAT_SAFE_LEFT + COMBAT_SAFE_RIGHT) / 2,
    );
  });

  it('anchors party formation at combat safe left', () => {
    expect(PARTY_FORMATION_LEFT_ANCHOR).toBe(COMBAT_SAFE_LEFT);
  });

  it('spans full width between screen margins without side HUD columns', () => {
    expect(COMBAT_SAFE_WIDTH).toBe(1136);
    expect(COMBAT_SAFE_CENTER_X).toBe(640);
  });

  it('reserves vertical band between top enemyHud and bottom partyHud', () => {
    expect(COMBAT_SAFE_SCREEN_TOP_Y).toBe(BATTLE_LANE_TOP);
    expect(COMBAT_SAFE_SCREEN_TOP_Y).toBe(
      ENEMY_HUD_SLOT_RECT.y + ENEMY_HUD_SLOT_RECT.h,
    );
    expect(COMBAT_SAFE_CANVAS_HEIGHT).toBe(BATTLE_CANVAS_HEIGHT);
    expect(COMBAT_SAFE_CANVAS_HEIGHT).toBe(426);
    expect(COMBAT_SAFE_SCREEN_GROUND_Y).toBe(BATTLE_GROUND_LINE_SCREEN_Y);
    expect(COMBAT_SAFE_CANVAS_GROUND_LINE_Y).toBe(BATTLE_CANVAS_HEIGHT - 24);
    expect(COMBAT_SAFE_SCREEN_GROUND_Y).toBeLessThan(PARTY_HUD_SLOT_RECT.y);
  });

  it('clamps vertical display coordinates inside the battle lane canvas', () => {
    expect(clampCombatDisplayY(-10, 0)).toBe(0);
    expect(clampCombatDisplayY(999, 0)).toBe(COMBAT_SAFE_CANVAS_GROUND_LINE_Y);
  });

  it('matches battle-root HUD slot geometry', () => {
    expect(PARTY_HUD_SLOT_RECT.x).toBe(BATTLE_HUD_SIDE_MARGIN);
    expect(PARTY_HUD_SLOT_RECT.w).toBe(BATTLE_TOP_INFO_RECT.w);
    expect(ENEMY_HUD_SLOT_RECT.x).toBe(BATTLE_HUD_SIDE_MARGIN);
    expect(ENEMY_HUD_SLOT_RECT.w).toBe(BATTLE_TOP_INFO_RECT.w);
  });
});
