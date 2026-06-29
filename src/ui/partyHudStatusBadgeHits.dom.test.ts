/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import { selectPartyHudCompactStatusBadges } from '../battle/statusEffectDisplay.ts';
import { readBattleHudTheme } from '../render/battleHudTheme.ts';
import {
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
  resolvePartyHudCompactStatusBadgeLayout,
} from '../render/statusBadgeRenderer.ts';
import { GameTermPanel } from './GameTermPanel.ts';
import {
  syncDetailStatusBadgeHits,
  syncPartyHudStatusBadgeHits,
} from './partyHudStatusBadgeHits.ts';
import { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';

function badge(
  category: StatusEffectBadgeDisplay['category'],
  stackCount?: number,
): StatusEffectBadgeDisplay {
  return {
    category,
    kind: 'buff',
    stackCount,
  };
}

describe('partyHudStatusBadgeHits DOM', () => {
  let host: HTMLElement;
  let themeHost: HTMLElement;
  let mount: HTMLElement;
  let panel: GameTermPanel;
  let tooltip: PartyHudFloatingTooltip;

  afterEach(() => {
    panel?.destroy();
    tooltip?.destroy();
    document.body.replaceChildren();
  });

  function setup(): void {
    themeHost = document.createElement('div');
    themeHost.className = 'battle-view';
    document.body.appendChild(themeHost);

    host = document.createElement('div');
    host.className = 'party-hud-status-badge-hits';
    document.body.appendChild(host);

    mount = document.createElement('div');
    document.body.appendChild(mount);

    panel = new GameTermPanel(mount, { locale: 'ja' });
    panel.mount();
    tooltip = new PartyHudFloatingTooltip(mount);
  }

  it('renders clickable button hits for glossary entries with description', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);
    const badges = [badge('stun'), badge('hp')];

    syncPartyHudStatusBadgeHits(
      host,
      badges,
      badges,
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
      theme,
      0,
      { floatingTooltip: tooltip, gameTermPanel: panel },
    );

    const hits = host.querySelectorAll('.party-hud-status-badge-hit');
    expect(hits).toHaveLength(2);

    const stunHit = hits[0] as HTMLButtonElement;
    const hpHit = hits[1] as HTMLSpanElement;
    expect(stunHit.tagName).toBe('BUTTON');
    expect(stunHit.classList.contains('party-hud-status-badge-hit--interactive')).toBe(
      true,
    );
    expect(hpHit.tagName).toBe('SPAN');
    expect(hpHit.classList.contains('party-hud-status-badge-hit--interactive')).toBe(
      false,
    );
  });

  it('opens game term panel when clicking an interactive badge', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);

    syncDetailStatusBadgeHits(
      host,
      [badge('stun')],
      theme,
      { floatingTooltip: tooltip, gameTermPanel: panel },
    );

    const hit = host.querySelector(
      '.party-hud-status-badge-hit--interactive',
    ) as HTMLButtonElement;
    hit.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 80,
        bottom: 100,
        right: 100,
        width: 20,
        height: 20,
        x: 80,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;

    hit.click();
    expect(mount.querySelector('.game-term-panel')?.hidden).toBe(false);
    expect(mount.querySelector('.game-term-panel-title')?.textContent).toBe(
      'スタン',
    );
  });

  it('shows hover tooltip for glossary entries with description', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);

    syncPartyHudStatusBadgeHits(
      host,
      [badge('stun')],
      [badge('stun')],
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
      theme,
      0,
      { floatingTooltip: null, gameTermPanel: panel },
    );

    const hit = host.querySelector(
      '.party-hud-status-badge-hit--interactive',
    ) as HTMLButtonElement;
    const inlineTooltip = hit.querySelector('.party-hud-status-badge-tooltip');
    expect(hit.tagName).toBe('BUTTON');
    expect(inlineTooltip?.textContent).toBe('スタン');
  });

  it('binds floating tooltip for interactive badges', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);

    syncPartyHudStatusBadgeHits(
      host,
      [badge('stun')],
      [badge('stun')],
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
      theme,
      0,
      { floatingTooltip: tooltip, gameTermPanel: panel },
    );

    const hit = host.querySelector(
      '.party-hud-status-badge-hit--interactive',
    ) as HTMLButtonElement;
    hit.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 80,
        bottom: 100,
        right: 100,
        width: 20,
        height: 20,
        x: 80,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;

    hit.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(mount.querySelector('.party-hud-floating-tooltip')?.hidden).toBe(
      false,
    );
    expect(mount.querySelector('.party-hud-floating-tooltip')?.textContent).toBe(
      'スタン',
    );
  });

  it('shows hover tooltip for title-only glossary entries', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);

    syncPartyHudStatusBadgeHits(
      host,
      [badge('hp')],
      [badge('hp')],
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
      theme,
      0,
      { floatingTooltip: null, gameTermPanel: panel },
    );

    const hit = host.querySelector('.party-hud-status-badge-hit') as HTMLElement;
    const tooltip = hit.querySelector('.party-hud-status-badge-tooltip');
    expect(hit.tagName).toBe('SPAN');
    expect(tooltip?.textContent).toBe('HP');
  });

  it('keeps overflow +N as non-interactive hover tooltip hit', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);
    const badges = [badge('stun'), badge('hot'), badge('dot'), badge('block'), badge('evasion')];
    const { visible, overflowCount } = selectPartyHudCompactStatusBadges(badges);

    syncPartyHudStatusBadgeHits(
      host,
      badges,
      visible,
      overflowCount,
      resolvePartyHudCompactStatusBadgeLayout(overflowCount),
      theme,
      0,
      { floatingTooltip: tooltip, gameTermPanel: panel },
    );

    expect(host.querySelectorAll('.party-hud-status-badge-hit')).toHaveLength(
      visible.length + 1,
    );

    const overflowHit = host.querySelector(
      '.party-hud-status-badge-hit--overflow',
    );
    expect(overflowHit).toBeTruthy();
    expect(overflowHit?.tagName).toBe('SPAN');
  });
});
