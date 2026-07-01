// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '../styles/battle-view.css';
import '../styles/party-hud-overlay.css';
import { PartyHudPanel } from './PartyHudPanel.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';

function sampleEntry(unitId: string, partySlotIndex: number): PartyHudEntry {
  return {
    unitId,
    partySlotIndex,
    rangePx: 30,
    displayName: `Unit ${partySlotIndex}`,
    iconKey: 'df_guardian',
    hp: 60,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    reg: 0,
    isAlive: true,
    useLocked: false,
    unlockedActiveSlotCount: 2,
    statusEffects: [],
    activeCooldowns: [],
  };
}

describe('PartyHudPanel hoverHighlight field link', () => {
  let host: HTMLElement;
  let onHoverHighlightStart: ReturnType<typeof vi.fn>;
  let onHoverHighlightEnd: ReturnType<typeof vi.fn>;
  let panel: PartyHudPanel;

  beforeEach(() => {
    host = document.createElement('div');
    host.className = 'battle-view';
    document.body.appendChild(host);
    onHoverHighlightStart = vi.fn();
    onHoverHighlightEnd = vi.fn();
    panel = new PartyHudPanel(host, {
      layout: 'overlay',
      onHoverHighlightStart,
      onHoverHighlightEnd,
    });
    panel.mount(host);
    panel.update([
      sampleEntry('ally-0', 0),
      sampleEntry('ally-1', 1),
      null,
      null,
    ]);
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  it('starts hover highlight when pointer enters a visible slot', () => {
    const slot = panel.getSlotRoot(0);
    expect(slot).not.toBeNull();
    slot!.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }),
    );
    expect(onHoverHighlightStart).toHaveBeenCalledWith('ally-0');
    panel.setHoverHighlightUnitId('ally-0');
    expect(slot!.classList.contains('party-hud-slot--hover-highlight')).toBe(true);
  });

  it('ends hover highlight on slot leave unless moving to stats overlay', () => {
    const slot = panel.getSlotRoot(0);
    expect(slot).not.toBeNull();

    slot!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const stats = document.createElement('div');
    stats.className = 'party-member-effective-stats';
    document.body.appendChild(stats);

    slot!.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: stats }),
    );
    expect(onHoverHighlightEnd).not.toHaveBeenCalled();

    slot!.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
    );
    expect(onHoverHighlightEnd).toHaveBeenCalledTimes(1);

    stats.remove();
  });
});
