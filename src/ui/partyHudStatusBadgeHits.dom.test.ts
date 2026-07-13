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
import { isGameUiOverlayOpen } from './gameUiOverlay.ts';

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

    hit.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 90, clientY: 90 }),
    );
    expect(isGameUiOverlayOpen(mount.querySelector('.game-term-panel') as HTMLElement)).toBe(true);
    expect(mount.querySelector('.game-term-panel-title')?.textContent).toBe(
      'スタン N',
    );
  });

  it('shows title hover tooltip for interactive badges when game term panel is available', () => {
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
    expect(hit.tagName).toBe('BUTTON');
    expect(hit.querySelector('.party-hud-status-badge-tooltip')?.textContent).toBe(
      'スタン N',
    );
  });

  it('binds floating title tooltip for interactive badges', () => {
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

    hit.dispatchEvent(
      new MouseEvent('mouseenter', {
        bubbles: true,
        clientX: 90,
        clientY: 90,
      }),
    );
    const floatingTooltip = mount.querySelector(
      '.party-hud-floating-tooltip',
    ) as HTMLElement | null;
    expect(floatingTooltip).toBeTruthy();
    expect(isGameUiOverlayOpen(floatingTooltip!)).toBe(true);
    expect(floatingTooltip?.textContent).toBe('スタン N');
  });

  it('opens game term panel in battle HUD tooltip layer on badge click', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);
    const frame = document.createElement('div');
    frame.className = 'battle-layer battle-layer--tooltip';
    frame.style.cssText = 'position:relative;width:1280px;height:720px;';
    document.body.appendChild(frame);

    panel.destroy();
    panel = new GameTermPanel(themeHost, {
      locale: 'ja',
      frameMount: frame,
    });
    panel.mount();
    tooltip.destroy();
    tooltip = new PartyHudFloatingTooltip(frame);

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
        top: 600,
        left: 200,
        bottom: 624,
        right: 224,
        width: 24,
        height: 24,
        x: 200,
        y: 600,
        toJSON: () => ({}),
      }) as DOMRect;
    frame.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 720,
        right: 1280,
        width: 1280,
        height: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperties(frame, {
      clientWidth: { value: 1280 },
      clientHeight: { value: 720 },
    });

    hit.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 212,
        clientY: 612,
      }),
    );

    const panelEl = frame.querySelector('.game-term-panel') as HTMLElement;
    expect(isGameUiOverlayOpen(panelEl)).toBe(true);
    expect(panelEl.textContent).toContain('スタン N');
    expect(Number.parseFloat(panelEl.style.top)).toBeGreaterThan(0);
    expect(Number.parseFloat(panelEl.style.left)).toBeGreaterThan(0);
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
