import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENEMY_HUD_MAX_SLOTS,
  ENEMY_HUD_SLOT_BAND_HEIGHT,
  ENEMY_HUD_SLOT_GAP,
  ENEMY_HUD_SLOT_HEIGHT,
  ENEMY_HUD_SLOT_WIDTH,
  computeEnemyHudSlotWidth,
} from './battleRootLayout.ts';
import {
  ENEMY_HUD_CARD_HEIGHT,
  ENEMY_HUD_CARD_WIDTH,
  ENEMY_HUD_MAX_VISIBLE_STACK,
} from './enemyHudCardStack.ts';

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

  it('lays out alive enemy groups horizontally with wrap in overlay-top mode', () => {
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
      /\.enemy-hud-slot\.enemy-hud-group[\s\S]*flex:\s*0 0 var\(--enemy-hud-slot-w/,
    );
    expect(css).toMatch(
      /--enemy-hud-slot-h:\s*68px/,
    );
  });

  it('uses card stacks with fixed group footprint', () => {
    expect(ENEMY_HUD_SLOT_WIDTH).toBe(152);
    expect(ENEMY_HUD_SLOT_HEIGHT).toBe(68);
    expect(ENEMY_HUD_SLOT_HEIGHT).toBeLessThanOrEqual(ENEMY_HUD_SLOT_BAND_HEIGHT);
    expect(ENEMY_HUD_CARD_WIDTH).toBe(136);
    expect(ENEMY_HUD_CARD_HEIGHT).toBe(52);
    expect(ENEMY_HUD_MAX_VISIBLE_STACK).toBe(3);
    expect(computeEnemyHudSlotWidth(3)).toBe(ENEMY_HUD_SLOT_WIDTH);
    expect(css).toMatch(/\.enemy-hud-card-stack/);
    expect(css).toMatch(/\.enemy-hud-card--front/);
    expect(css).toMatch(/\.enemy-hud-card--back/);
    expect(css).toMatch(/\.enemy-hud-stack-overflow/);
    expect(css).toMatch(/--enemy-hud-status-h,\s*18px/);
    expect(css).toMatch(
      /\.enemy-hud-card-main[\s\S]*grid-template-columns:\s*24px minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.enemy-hud-card[\s\S]*transition:[\s\S]*left 260ms/);
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

  it('allows many groups to wrap when band width is exceeded', () => {
    const rowWidth =
      ENEMY_HUD_MAX_SLOTS * ENEMY_HUD_SLOT_WIDTH +
      (ENEMY_HUD_MAX_SLOTS - 1) * ENEMY_HUD_SLOT_GAP;
    expect(rowWidth).toBeGreaterThan(1200);
  });
});
