import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PARTY_HUD_ALLY_CARD_GAP,
  PARTY_HUD_ALLY_CARD_HEIGHT,
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

  it('keeps overlay list height aligned with battle-field allyCard totals', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-panel-slots[\s\S]*gap:\s*0;/,
    );
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-panel-slots > \.party-hud-slot:not\(:last-child\)[\s\S]*margin-bottom:\s*var\(--party-hud-overlay-card-gap\);/,
    );
    expect(
      4 * PARTY_HUD_ALLY_CARD_HEIGHT + 3 * PARTY_HUD_ALLY_CARD_GAP,
    ).toBe(PARTY_HUD_SLOT_RECT.h);
  });
});
