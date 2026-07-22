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

  it('keeps overlay recast grid fixed while sizing gauge bodies for 2px gaps', () => {
    expect(css).toMatch(/--party-hud-overlay-recast-h:\s*21\.6/);
    expect(css).toMatch(
      /--hud-recast-grid-h:\s*calc\(var\(--party-hud-overlay-recast-h\) \* 1px\)/,
    );
    expect(css).toMatch(/--hud-recast-gap:\s*2;/);
    expect(css).toMatch(
      /--hud-recast-bar-h:\s*calc\([\s\S]*--party-hud-overlay-recast-h[\s\S]*--hud-recast-gap/,
    );
    expect(css).toMatch(
      /--hud-recast-bar-w:\s*calc\([\s\S]*--party-hud-overlay-content-w[\s\S]*--hud-recast-gap/,
    );
  });

  it('hides CombatModule legacy recast grid when [hidden] despite display:grid rule', () => {
    expect(css).toMatch(
      /\.party-hud-panel--overlay \.party-hud-recast-grid\[hidden\][\s\S]*display:\s*none !important/,
    );
    expect(css).toMatch(/\.party-hud-card--combat-module[\s\S]*--hud-recast-grid-h:\s*0px/);
  });

  it('hides party HUD root when [hidden] despite display:grid/flex mode rules', () => {
    const battleViewCss = readFileSync(
      resolve(import.meta.dirname, '../styles/battle-view.css'),
      'utf8',
    );
    const rootHiddenBlock = battleViewCss.match(
      /\.party-hud-panel\[hidden\]\s*\{([^}]*)\}/,
    );
    expect(rootHiddenBlock).not.toBeNull();
    expect(rootHiddenBlock![1]).toMatch(/display:\s*none\s*!important/);
    // Do not accept a different [hidden] selector (e.g. recast-grid) as this contract.
    expect(rootHiddenBlock![0]).toMatch(/^\.party-hud-panel\[hidden\]/);
    expect(rootHiddenBlock![0]).not.toMatch(/recast-grid/);
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
