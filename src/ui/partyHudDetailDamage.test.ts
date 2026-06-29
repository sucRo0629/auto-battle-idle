// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PartyHudPanel } from './PartyHudPanel.ts';
import { syncDamageBars, type DamageBarRefs } from './PartyMemberStatsDisplay.ts';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';

describe('PartyHudPanel detail damage metrics', () => {
  let host: HTMLElement;
  let panel: PartyHudPanel;

  beforeEach(() => {
    host = document.createElement('div');
    host.className = 'battle-view';
    host.style.setProperty('--hud-icon-size', '24');
    document.body.appendChild(host);
    panel = new PartyHudPanel(host);
    panel.mount(host);
    panel.setMode('detail');
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  it('updates assassin slot damage label from displayRows', () => {
    const rows: StageDamageDisplayRow[] = [
      {
        slotIndex: 0,
        classId: 'df_guardian',
        displayName: '鉄衛士',
        damageDealt: 1200,
        damageTaken: 400,
        dealtRatio: 0.4,
        takenRatio: 0.8,
      },
      {
        slotIndex: 1,
        classId: 'at_assassin',
        displayName: '双刃士',
        damageDealt: 3000,
        damageTaken: 50,
        dealtRatio: 1,
        takenRatio: 0.1,
      },
    ];

    panel.update([
      {
        displayName: '鉄衛士',
        iconKey: 'df_guardian',
        hp: 80,
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
      },
      {
        displayName: '双刃士',
        iconKey: 'at_assassin',
        hp: 90,
        maxHp: 100,
        baseMaxHp: 100,
        barrierHp: 0,
        atk: 20,
        def: 8,
        reg: 0,
        isAlive: true,
        useLocked: false,
        unlockedActiveSlotCount: 2,
        statusEffects: [],
        activeCooldowns: [],
      },
      null,
      null,
    ]);

    panel.updateDetailMetrics({ snapshots: [], displayRows: rows });

    const labels = [...host.querySelectorAll('.party-stats-damage-label')].map(
      (node) => node.textContent,
    );
    expect(labels[0]).toBe('与 1,200 · 被 400');
    expect(labels[1]).toBe('与 3,000 · 被 50');
  });
});

describe('syncDamageBars', () => {
  function makeRefs(): DamageBarRefs {
    const root = document.createElement('div');
    root.className = 'party-stats-damage';
    const dealtFill = document.createElement('div');
    const takenFill = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'party-stats-damage-label';
    label.textContent = '与 — · 被 —';
    root.append(dealtFill, takenFill, label);
    return { root, dealtFill, takenFill, label };
  }

  it('maps rows by slotIndex not array order', () => {
    const refsBySlot = new Map<number, DamageBarRefs>([
      [0, makeRefs()],
      [3, makeRefs()],
    ]);
    const rows: StageDamageDisplayRow[] = [
      {
        slotIndex: 3,
        classId: 'at_assassin',
        displayName: '双刃士',
        damageDealt: 999,
        damageTaken: 1,
        dealtRatio: 1,
        takenRatio: 1,
      },
      {
        slotIndex: 0,
        classId: 'at_ranger',
        displayName: '弓術士',
        damageDealt: 100,
        damageTaken: 10,
        dealtRatio: 0.1,
        takenRatio: 0.1,
      },
    ];

    syncDamageBars(refsBySlot, rows, new Map());

    expect(refsBySlot.get(3)?.label.textContent).toBe('与 999 · 被 1');
    expect(refsBySlot.get(0)?.label.textContent).toBe('与 100 · 被 10');
  });
});
