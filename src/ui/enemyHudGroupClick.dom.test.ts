/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnemyHudGroup } from './enemyHudTypes.ts';
import { EnemyHudPanel } from './EnemyHudPanel.ts';
import '../styles/enemy-hud-overlay.css';
import '../styles/battle-view.css';

function sampleEnemy(id: string) {
  return {
    id,
    displayName: '訓練用ダミー',
    iconKey: 'test_dummy',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    res: 10,
    isAlive: true,
    statusEffects: [],
    dangerTelegraphActive: false,
    dangerTelegraphProgress: 0,
  };
}

function sampleGroup(overrides: Partial<EnemyHudGroup> = {}): EnemyHudGroup {
  const enemy = sampleEnemy('enemy_0');
  return {
    groupId: 'test_dummy',
    classId: 'test_dummy',
    representativeName: '訓練用ダミー',
    representativeIcon: 'test_dummy',
    count: 3,
    representativeEnemy: enemy,
    enemies: [
      enemy,
      sampleEnemy('enemy_1'),
      sampleEnemy('enemy_2'),
    ],
    dangerState: { telegraphActive: false, telegraphProgress: 0 },
    importantStates: [],
    ...overrides,
  };
}

describe('EnemyHudPanel group click', () => {
  let host: HTMLElement;

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mountPanel(
    onGroupClick = vi.fn(),
  ): { panel: EnemyHudPanel; slot: HTMLElement } {
    host = document.createElement('div');
    host.className = 'battle-view battle-hud-slot battle-hud-slot--enemy';
    document.body.appendChild(host);

    const panel = new EnemyHudPanel(host, {
      layout: 'overlay-top',
      onGroupClick,
    });
    panel.mount(host);
    panel.update([sampleGroup()]);
    return { panel, slot: host };
  }

  it('expands when clicking a pointer-events:none front card', () => {
    const onGroupClick = vi.fn();
    mountPanel(onGroupClick);

    const card = document.querySelector(
      '.enemy-hud-card--front',
    ) as HTMLElement;
    expect(card).toBeTruthy();

    card.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(onGroupClick).toHaveBeenCalledWith('test_dummy', 'expand');
  });

  it('collapses when clicking the expanded top card', () => {
    const onGroupClick = vi.fn();
    const { panel } = mountPanel(onGroupClick);

    panel.setExpandedGroupIds(new Set(['test_dummy']));
    onGroupClick.mockClear();

    const topCard = document.querySelector(
      '.enemy-hud-card--expanded-top',
    ) as HTMLElement;
    expect(topCard).toBeTruthy();

    topCard.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(onGroupClick).toHaveBeenCalledWith('test_dummy', 'collapse');
  });
});
