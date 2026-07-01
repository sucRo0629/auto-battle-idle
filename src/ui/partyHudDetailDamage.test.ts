// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PartyHudPanel } from './PartyHudPanel.ts';
import {
  buildDetailDamageBarElements,
  syncDamageBars,
  type DamageBarRefs,
} from './PartyMemberStatsDisplay.ts';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';

function mockDisplayRow(
  overrides: Partial<StageDamageDisplayRow> & Pick<StageDamageDisplayRow, 'slotIndex' | 'classId' | 'displayName'>,
): StageDamageDisplayRow {
  return {
    role: overrides.isHealer ? 'supporter' : 'attacker',
    isHealer: false,
    damageDealt: 0,
    damageTaken: 0,
    healingDealt: 0,
    dealtRatio: 0,
    takenRatio: 0,
    ...overrides,
  };
}

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

  it('updates assassin slot inline damage values from displayRows', () => {
    const rows: StageDamageDisplayRow[] = [
      mockDisplayRow({
        slotIndex: 0,
        classId: 'df_guardian',
        displayName: '鉄衛士',
        role: 'defender',
        damageDealt: 1200,
        damageTaken: 400,
        dealtRatio: 0.4,
        takenRatio: 0.8,
      }),
      mockDisplayRow({
        slotIndex: 1,
        classId: 'at_assassin',
        displayName: '双刃士',
        damageDealt: 3000,
        damageTaken: 50,
        dealtRatio: 1,
        takenRatio: 0.1,
      }),
    ];

    panel.update([
      {
        unitId: 'g0',
        partySlotIndex: 0,
        rangePx: 30,
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
        unitId: 'a1',
        partySlotIndex: 1,
        rangePx: 30,
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

    const dealtValues = [
      ...host.querySelectorAll(
        '.party-hud-detail-damage .party-stats-damage-bar--dealt .party-stats-damage-bar-value',
      ),
    ].map((node) => node.textContent);
    const takenValues = [
      ...host.querySelectorAll(
        '.party-hud-detail-damage .party-stats-damage-bar--taken .party-stats-damage-bar-value',
      ),
    ].map((node) => node.textContent);
    expect(dealtValues[0]).toBe('1.2k');
    expect(takenValues[0]).toBe('400');
    expect(dealtValues[1]).toBe('3k');
    expect(takenValues[1]).toBe('50');
    expect(
      host
        .querySelector(
          '.party-hud-detail-damage .party-stats-damage-bar--dealt .party-stats-damage-bar-value',
        )
        ?.getAttribute('aria-label'),
    ).toBe('1,200');
  });
});

describe('syncDamageBars', () => {
  function makeRefs(): DamageBarRefs {
    const {
      bars,
      dealtBar,
      dealtFill,
      takenFill,
      dealtValue,
      takenValue,
      label,
    } = buildDetailDamageBarElements();
    const root = document.createElement('div');
    root.className = 'party-stats-damage';
    root.append(bars, label);
    return { root, dealtBar, dealtFill, takenFill, dealtValue, takenValue, label };
  }

  it('maps rows by slotIndex not array order', () => {
    const refsBySlot = new Map<number, DamageBarRefs>([
      [0, makeRefs()],
      [3, makeRefs()],
    ]);
    const rows: StageDamageDisplayRow[] = [
      mockDisplayRow({
        slotIndex: 3,
        classId: 'at_assassin',
        displayName: '双刃士',
        damageDealt: 999,
        damageTaken: 1,
        dealtRatio: 1,
        takenRatio: 1,
      }),
      mockDisplayRow({
        slotIndex: 0,
        classId: 'at_ranger',
        displayName: '弓術士',
        damageDealt: 100,
        damageTaken: 10,
        dealtRatio: 0.1,
        takenRatio: 0.1,
      }),
    ];

    syncDamageBars(refsBySlot, rows, new Map());

    expect(refsBySlot.get(3)?.dealtValue?.textContent).toBe('999');
    expect(refsBySlot.get(3)?.takenValue?.textContent).toBe('1');
    expect(refsBySlot.get(0)?.dealtValue?.textContent).toBe('100');
    expect(refsBySlot.get(0)?.takenValue?.textContent).toBe('10');
  });

  it('keeps compact inline labels readable while preserving full values', () => {
    const refs = makeRefs();
    syncDamageBars(
      new Map([[0, refs]]),
      [
        mockDisplayRow({
          slotIndex: 0,
          classId: 'at_ballista',
          displayName: '弩砲士',
          damageDealt: 1234,
          damageTaken: 12345,
        }),
      ],
      new Map(),
    );

    expect(refs.dealtValue?.textContent).toBe('1.2k');
    expect(refs.takenValue?.textContent).toBe('12k');
    expect(refs.dealtValue?.title).toBe('1,234');
    expect(refs.takenValue?.getAttribute('aria-label')).toBe('12,345');
    expect(refs.label.textContent).toContain('1,234');
    expect(refs.label.textContent).toContain('12,345');
  });

  it('shows healing dealt for a lone healer with a full dealt bar', () => {
    const refs = makeRefs();
    syncDamageBars(
      new Map([[0, refs]]),
      [
        mockDisplayRow({
          slotIndex: 0,
          classId: 'sp_cleric',
          displayName: '治癒師',
          role: 'supporter',
          isHealer: true,
          healingDealt: 120,
          damageTaken: 30,
        }),
      ],
      new Map(),
    );

    expect(refs.dealtValue?.textContent).toBe('120');
    expect(refs.dealtFill.style.width).toBe('100%');
    expect(refs.dealtBar.classList.contains('party-stats-damage-bar--dealt-heal')).toBe(true);
    expect(refs.label.textContent).toContain('120');
  });

  it('compares healing bars among multiple healers', () => {
    const low = makeRefs();
    const high = makeRefs();
    syncDamageBars(
      new Map([
        [0, low],
        [1, high],
      ]),
      [
        mockDisplayRow({
          slotIndex: 0,
          classId: 'sp_cleric',
          displayName: '治癒師',
          role: 'supporter',
          isHealer: true,
          healingDealt: 100,
        }),
        mockDisplayRow({
          slotIndex: 1,
          classId: 'sp_alchemist',
          displayName: '錬金術士',
          role: 'supporter',
          isHealer: true,
          healingDealt: 300,
        }),
      ],
      new Map(),
    );

    expect(parseFloat(low.dealtFill.style.width)).toBeCloseTo(33.333, 2);
    expect(high.dealtFill.style.width).toBe('100%');
  });
});
