/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import { readBattleHudTheme } from '../render/battleHudTheme.ts';
import { GameTermPanel } from './GameTermPanel.ts';
import { syncEnemyHudStatusBadgeHits } from './enemyHudStatusRow.ts';
import { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';
import { isGameUiOverlayOpen } from './gameUiOverlay.ts';

function badge(category: StatusEffectBadgeDisplay['category']): StatusEffectBadgeDisplay {
  return { category, kind: 'debuff' };
}

describe('enemyHud status badge hits DOM', () => {
  let themeHost: HTMLElement;
  let hitLayer: HTMLElement;
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

    hitLayer = document.createElement('div');
    hitLayer.className = 'party-hud-status-badge-hits';
    document.body.appendChild(hitLayer);

    mount = document.createElement('div');
    mount.className = 'battle-layer battle-layer--tooltip';
    document.body.appendChild(mount);

    panel = new GameTermPanel(themeHost, {
      locale: 'ja',
      frameMount: mount,
    });
    panel.mount();
    tooltip = new PartyHudFloatingTooltip(mount);
  }

  it('opens game term panel when clicking an interactive enemy HUD badge', () => {
    setup();
    const theme = readBattleHudTheme(themeHost);
    const badges = [badge('stun')];

    syncEnemyHudStatusBadgeHits(
      hitLayer,
      badges,
      badges,
      0,
      theme,
      0,
      { floatingTooltip: tooltip, gameTermPanel: panel },
    );

    const hit = hitLayer.querySelector(
      '.party-hud-status-badge-hit--interactive',
    ) as HTMLButtonElement;
    expect(hit).toBeTruthy();

    hit.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 80,
        bottom: 94,
        right: 94,
        width: 14,
        height: 14,
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
});
