/**
 * R9.6-A: Formation screen formal CombatModule selection UI.
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

describe('SkillMenuPanel combat module selection (R9.6-A)', () => {
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

  it('shows class-scoped module plates with name, description, and selection', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    expect(session.getCurrentScreen()).toBe('formation');

    const section = document.querySelector('.combat-module-prep');
    expect(section).not.toBeNull();
    expect(document.body.textContent).toContain('戦闘方式');

    const candidates = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.combat-module-prep__candidate',
      ),
    ];
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    for (const candidate of candidates) {
      expect(candidate.querySelector('.combat-module-prep__name')?.textContent)
        .toBeTruthy();
      expect(candidate.querySelector('.combat-module-prep__description'))
        .toBeNull();
      expect(
        candidate.querySelector('.combat-module-prep__attack-interval')
          ?.textContent,
      ).toContain('攻撃間隔');
      expect(
        candidate.querySelector('.combat-module-prep__effect-summary')
          ?.textContent,
      ).toBeTruthy();
      expect(candidate.querySelector('.combat-module-prep__behavior')).toBeNull();
    }

    const selected = candidates.find(
      (entry) => entry.dataset.selected === 'true',
    );
    expect(selected?.querySelector('.combat-module-prep__status')?.textContent)
      .toBe('選択中');

    const moduleB = candidates.find(
      (entry) => entry.dataset.moduleId === MODULE_B_ID,
    );
    expect(moduleB).toBeTruthy();
    moduleB!.click();

    expect(session.getPartySlotCombatModule(0)).toBe(MODULE_B_ID);

    const returnButton = document.querySelector<HTMLButtonElement>(
      '.skill-menu-return-to-battle-button',
    );
    expect(returnButton).not.toBeNull();
    returnButton!.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getPartySlotCombatModule(0)).toBe(MODULE_B_ID);
  });

  it('does not show combat module plates for legacy class focus', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const legacyClassId = 'at_ranger';
    const listItem = [...document.querySelectorAll<HTMLElement>(
      '.skill-menu-picker-list-item',
    )].find((item) => item.dataset.pickerClassId === legacyClassId);
    expect(listItem).toBeTruthy();
    listItem!.click();

    expect(document.querySelector('.combat-module-prep')).toBeNull();
    expect(
      document.querySelector('.skill-menu-combat-module-select'),
    ).toBeNull();
  });

  it('does not mix legacy active skill rows into combat module candidates', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const moduleIds = [
      ...document.querySelectorAll<HTMLElement>(
        '.combat-module-prep__candidate',
      ),
    ].map((el) => el.dataset.moduleId);
    expect(moduleIds.every((id) => id?.includes('_mod_'))).toBe(true);
    expect(moduleIds.some((id) => id?.includes('_active_'))).toBe(false);
  });
});
