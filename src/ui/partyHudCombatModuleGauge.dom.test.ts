/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PartyHudPanel } from './PartyHudPanel.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';

function entry(overrides: Partial<PartyHudEntry> = {}): PartyHudEntry {
  return {
    unitId: 'u0',
    partySlotIndex: 0,
    rangePx: 30,
    displayName: 'Test',
    iconKey: 'x',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    useLocked: false,
    hasCombatModuleBasic: false,
    unlockedActiveSlotCount: 4,
    statusEffects: [],
    activeCooldowns: [],
    ...overrides,
  };
}

describe('R9.5b PartyHudPanel legacy active gauge DOM', () => {
  let host: HTMLElement;
  let mount: HTMLElement;
  let panel: PartyHudPanel;

  afterEach(() => {
    panel?.destroy();
    document.body.replaceChildren();
  });

  function setup(): void {
    host = document.createElement('div');
    host.className = 'battle-view';
    document.body.appendChild(host);

    mount = document.createElement('div');
    document.body.appendChild(mount);

    panel = new PartyHudPanel(host, { layout: 'overlay' });
    panel.mount(mount);
  }

  it('hides the 2x2 recast gauge for CombatModule units', () => {
    setup();
    panel.update([entry({ hasCombatModuleBasic: true }), null, null, null]);

    const slot = panel.getSlotRoot(0)!;
    const grid = slot.querySelector<HTMLElement>('.party-hud-recast-grid')!;
    expect(grid.hidden).toBe(true);
    expect(slot.querySelector('.party-hud-card--combat-module')).not.toBeNull();
  });

  it('keeps the recast gauge visible for legacy units', () => {
    setup();
    panel.update([
      entry({
        hasCombatModuleBasic: false,
        activeCooldowns: [
          {
            skillId: 'legacy_active',
            remaining: 2,
            triggerKind: 'time',
            triggerValue: 5,
            slotIndex: 0,
          },
        ],
      }),
      null,
      null,
      null,
    ]);

    const slot = panel.getSlotRoot(0)!;
    const grid = slot.querySelector<HTMLElement>('.party-hud-recast-grid')!;
    expect(grid.hidden).toBe(false);
    expect(
      grid.querySelectorAll('.party-hud-recast-cell').length,
    ).toBeGreaterThan(0);
  });

  it('renders module and legacy units differently in a mixed party', () => {
    setup();
    panel.update([
      entry({ unitId: 'mod', hasCombatModuleBasic: true }),
      entry({
        unitId: 'legacy',
        partySlotIndex: 1,
        rangePx: 200,
        hasCombatModuleBasic: false,
      }),
      null,
      null,
    ]);

    const modGrid = panel
      .getSlotRoot(0)!
      .querySelector<HTMLElement>('.party-hud-recast-grid')!;
    const legacyGrid = panel
      .getSlotRoot(1)!
      .querySelector<HTMLElement>('.party-hud-recast-grid')!;
    expect(modGrid.hidden).toBe(true);
    expect(legacyGrid.hidden).toBe(false);
  });

  it('does not add any attack-interval text to the HUD body', () => {
    setup();
    panel.update([entry({ hasCombatModuleBasic: true }), null, null, null]);
    expect(panel.getSlotRoot(0)!.textContent ?? '').not.toContain('攻撃間隔');
    expect(panel.getSlotRoot(0)!.textContent ?? '').not.toContain('秒');
  });
});
