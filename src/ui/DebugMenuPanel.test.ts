/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugMenuPanel } from './DebugMenuPanel.ts';
import type { GameData } from '../battle/types.ts';

const gameData = {
  stages: [],
} as unknown as GameData;

describe('DebugMenuPanel', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  it('calls onRequestClose when the header close button is clicked', () => {
    const onRequestClose = vi.fn();
    const panel = new DebugMenuPanel(
      gameData,
      {
        isVerifyMode: () => true,
        isBattleXDebugDisplayEnabled: () => false,
        onBattleXDebugDisplayChange: () => {},
        getSave: () => ({ party: [] }) as never,
        getLoopStageId: () => null,
        getLoopWaveIndex: () => null,
        onLoopStageChange: () => {},
        onLoopWaveChange: () => {},
        onPlayerLevelChange: () => {},
      },
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
});
