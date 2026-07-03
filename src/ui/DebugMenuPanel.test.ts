/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugMenuPanel } from './DebugMenuPanel.ts';
import type { GameData, StageDef } from '../battle/types.ts';

function makeControls(overrides: Partial<Parameters<typeof DebugMenuPanel>[1]> = {}) {
  return {
    isVerifyMode: () => true,
    isBattleXDebugDisplayEnabled: () => false,
    onBattleXDebugDisplayChange: () => {},
    getSave: () => ({ party: [] }) as never,
    getLoopStageId: () => null,
    getLoopWaveIndex: () => null,
    onLoopStageChange: () => {},
    onLoopWaveChange: () => {},
    onPlayerLevelChange: () => {},
    ...overrides,
  };
}

function makeGameData(stages: StageDef[]): GameData {
  return { stages } as unknown as GameData;
}

describe('DebugMenuPanel', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  it('calls onRequestClose when the header close button is clicked', () => {
    const onRequestClose = vi.fn();
    const panel = new DebugMenuPanel(
      makeGameData([]),
      makeControls(),
      onRequestClose,
    );

    host = document.createElement('div');
    panel.mount(host);
    panel.refresh();

    const closeButton = host.querySelector(
      '.debug-menu-close',
    ) as HTMLButtonElement;
    expect(closeButton).not.toBeNull();

    closeButton.click();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('shows enemyGroups composition info for the selected stage', () => {
    const panel = new DebugMenuPanel(
      makeGameData([
        {
          id: 'stage_groups',
          displayName: 'Groups Stage',
          recommendedLevel: 15,
          enemyGroups: [
            { classId: 'df_paladin', count: 2 },
            { classId: 'at_hunter', count: 3, atkScale: 1.2 },
          ],
          waves: [{ enemies: [] }],
        },
      ]),
      makeControls({
        getLoopStageId: () => 'stage_groups',
      }),
    );

    host = document.createElement('div');
    panel.mount(host);
    panel.refresh();

    const info = host.querySelector('.debug-menu-stage-info');
    expect(info?.textContent).toContain('推奨 Lv: 15');
    expect(info?.textContent).toContain('編成: enemyGroups');
    expect(info?.textContent).toContain('総体数: 5');
    expect(info?.textContent).toContain('注意: 5体以上');
    expect(info?.textContent).toContain('df_paladin ×2');
    expect(info?.textContent).toContain('at_hunter ×3');
    expect(info?.textContent).toContain('atk×1.2');
  });

  it('shows legacy templateIds without breaking wave selection', () => {
    const panel = new DebugMenuPanel(
      makeGameData([
        {
          id: 'stage_legacy',
          displayName: 'Legacy Stage',
          waves: [
            { enemies: [{ templateId: 'enemy_a', spawnX: 80 }] },
            {
              enemies: [
                { templateId: 'enemy_b', spawnX: 120 },
                { templateId: 'enemy_c', spawnX: 160 },
              ],
            },
          ],
        },
      ]),
      makeControls({
        getLoopStageId: () => 'stage_legacy',
        getLoopWaveIndex: () => 1,
      }),
    );

    host = document.createElement('div');
    panel.mount(host);
    panel.refresh();

    expect(host.querySelector('.debug-menu-stage-select')).not.toBeNull();
    expect(host.querySelectorAll('.debug-menu-stage-select')).toHaveLength(2);

    const info = host.querySelector('.debug-menu-stage-info');
    expect(info?.textContent).toContain('編成: legacy waves');
    expect(info?.textContent).toContain('総体数: 2');
    expect(info?.textContent).toContain('enemy_b');
    expect(info?.textContent).toContain('enemy_c');
    expect(info?.textContent).not.toContain('enemy_a');
  });
});
