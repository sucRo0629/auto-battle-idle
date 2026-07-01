import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENEMY_HUD_MAX_SLOTS,
  ENEMY_HUD_SLOT_GAP,
  ENEMY_HUD_SLOT_HEIGHT,
  ENEMY_HUD_SLOT_RECT,
  ENEMY_HUD_SLOT_WIDTH,
  computeEnemyHudSlotWidth,
} from './battleRootLayout.ts';

describe('enemy-hud-overlay.css top strip layout regression', () => {
  const css = readFileSync(
    resolve(import.meta.dirname, '../styles/enemy-hud-overlay.css'),
    'utf8',
  );

  it('opts enemy HUD slot out of Electron window drag region', () => {
    expect(css).toMatch(
      /\.battle-hud-slot--enemy[\s\S]*-webkit-app-region:\s*no-drag/,
    );
  });

  it('lays out alive enemies horizontally with wrap in overlay-top mode', () => {
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top \.enemy-hud-panel-slots[\s\S]*flex-direction:\s*row/,
    );
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top \.enemy-hud-panel-slots[\s\S]*flex-wrap:\s*wrap/,
    );
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top \.enemy-hud-panel-slots[\s\S]*justify-content:\s*flex-start/,
    );
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top \.enemy-hud-panel-slots > \.enemy-hud-slot[\s\S]*flex:\s*0 0 var\(--enemy-hud-slot-w/,
    );
    expect(css).toMatch(
      /--enemy-hud-slot-h:\s*52px/,
    );
  });

  it('uses fixed slot width so few enemies do not stretch across the band', () => {
    expect(ENEMY_HUD_SLOT_WIDTH).toBe(119);
    const rowWidth =
      ENEMY_HUD_MAX_SLOTS * ENEMY_HUD_SLOT_WIDTH +
      (ENEMY_HUD_MAX_SLOTS - 1) * ENEMY_HUD_SLOT_GAP;
    expect(rowWidth).toBeLessThanOrEqual(ENEMY_HUD_SLOT_RECT.w);
    expect(computeEnemyHudSlotWidth(3)).toBe(ENEMY_HUD_SLOT_WIDTH);
    expect(ENEMY_HUD_SLOT_HEIGHT).toBe(52);
  });

  it('does not paint an outer panel frame in overlay-top mode', () => {
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top[\s\S]*background:\s*transparent/,
    );
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top[\s\S]*clip-path:\s*none/,
    );
    expect(css).toMatch(
      /\.enemy-hud-panel--overlay-top \.enemy-hud-panel-slots[\s\S]*padding:\s*0/,
    );
  });
});
