/**
 * R9.5c: Formation screen combat module selection (party slot unit).
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from '../game/GameSession.ts';

function mockCanvas2d(): void {
  const ctx = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
}

const MODULE_B_ID = 'df_guardian_mod_guard_focus';

describe('SkillMenuPanel combat module selection (R9.5c)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    setVerifyModeEnabled(false);
  });

  it('shows combat module select for module class and persists per party slot', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    expect(session.getCurrentScreen()).toBe('formation');

    const moduleSelect = document.querySelector<HTMLSelectElement>(
      '.skill-menu-combat-module-select',
    );
    expect(moduleSelect).not.toBeNull();
    expect(moduleSelect!.options.length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).toContain('戦闘方式');

    moduleSelect!.value = MODULE_B_ID;
    moduleSelect!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(session.getPartySlotCombatModule(0)).toBe(MODULE_B_ID);

    const returnButton = document.querySelector<HTMLButtonElement>(
      '.skill-menu-return-to-battle-button',
    );
    expect(returnButton).not.toBeNull();
    returnButton!.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getPartySlotCombatModule(0)).toBe(MODULE_B_ID);
  });

  it('does not show combat module select for legacy class focus', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const legacyClassId = 'at_ranger';
    const listItem = [...document.querySelectorAll<HTMLElement>(
      '.skill-menu-picker-list-item',
    )].find((item) => item.dataset.pickerClassId === legacyClassId);
    expect(listItem).toBeTruthy();
    listItem!.click();

    expect(
      document.querySelector('.skill-menu-combat-module-select'),
    ).toBeNull();
  });
});
