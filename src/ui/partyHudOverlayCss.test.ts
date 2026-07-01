import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PARTY_HUD_ALLY_CARD_CONTENT_WIDTH,
  PARTY_HUD_ALLY_CARD_COUNT,
  PARTY_HUD_ALLY_CARD_GAP,
  PARTY_HUD_ALLY_CARD_SLOT_WIDTH,
  PARTY_HUD_SLOT_RECT,
} from './battleRootLayout.ts';

describe('party-hud-overlay.css allyCard layout regression', () => {
  const css = readFileSync(
    resolve(import.meta.dirname, '../styles/party-hud-overlay.css'),
    'utf8',
  );

  it('stretches overlay card children so the HP row can grow horizontally', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-card[\s\S]*align-items:\s*stretch/,
    );
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-header-row[\s\S]*width:\s*100%/,
    );
  });

  it('opts party HUD slot out of Electron window drag region', () => {
    expect(css).toMatch(
      /\.battle-hud-slot--party[\s\S]*-webkit-app-region:\s*no-drag/,
    );
  });

  it('uses higher-specificity selector for hover highlight over base slot chrome', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-panel-slots > \.party-hud-slot\.party-hud-slot--hover-highlight/,
    );
  });

  it('scales overlay skill gauges to 90% of the baseline row height', () => {
    expect(css).toMatch(/--party-hud-overlay-recast-scale:\s*0\.9/);
    expect(css).toMatch(
      /--hud-recast-bar-h:\s*calc\(11 \* var\(--party-hud-overlay-recast-scale\)\)/,
    );
  });

  it('lays out overlay damage bars as icon, fill, and value on one row', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-detail-damage \.party-stats-damage-bar[\s\S]*grid-template-columns:\s*12px minmax\(0,\s*1fr\) auto/,
    );
    expect(css).toMatch(
      /--party-hud-overlay-damage-h:\s*22px/,
    );
  });

  it('uses scaled slot padding (pad-x × scale)', () => {
    expect(css).toMatch(/--party-hud-overlay-card-pad-scale:\s*0\.3/);
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-panel-slots > \.party-hud-slot[\s\S]*padding:\s*var\(--party-hud-overlay-card-pad\)/,
    );
  });

  it('lays out four ally cards horizontally with range-asc head on the right', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-panel-slots[\s\S]*flex-direction:\s*row-reverse/,
    );
    expect(css).toMatch(
      /--party-hud-overlay-card-gap:\s*0/,
    );
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-card[\s\S]*width:\s*var\(--party-hud-overlay-content-w\)/,
    );
    expect(
      PARTY_HUD_ALLY_CARD_COUNT * PARTY_HUD_ALLY_CARD_SLOT_WIDTH +
        (PARTY_HUD_ALLY_CARD_COUNT - 1) * PARTY_HUD_ALLY_CARD_GAP,
    ).toBe(PARTY_HUD_SLOT_RECT.w);
    expect(PARTY_HUD_ALLY_CARD_CONTENT_WIDTH).toBeLessThan(
      PARTY_HUD_ALLY_CARD_SLOT_WIDTH,
    );
  });
});
