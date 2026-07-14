/**
 * Stage select must not drop party members.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

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

function countFilledPartySlots(session: GameSession): number {
  return session.getSaveState().party.filter((member) => member !== null).length;
}

function getPartyClassIds(session: GameSession): string[] {
  return session
    .getSaveState()
    .party.filter((member) => member !== null)
    .map((member) => member!.classId);
}

describe('stage select preserves party', () => {
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

  it('keeps all party members after selecting a stage and sortie', () => {
    session = createSession();
    session.start();

    const initialClassIds = getPartyClassIds(session);
    expect(initialClassIds.length).toBe(4);

    const container = document.body.querySelector('div')!;
    const listItems = container.querySelectorAll<HTMLButtonElement>(
      '.stage-selection-list-item',
    );
    const secondStage = listItems[1] ?? listItems[0];
    expect(secondStage).toBeTruthy();
    secondStage!.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toEqual(initialClassIds);

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toEqual(initialClassIds);
    expect(session.getCurrentScreen()).toBe('formation');
  });

  it('does not drop a class when formation opens under a Class Select click', () => {
    session = createSession();
    session.start();

    const initialClassIds = getPartyClassIds(session);
    const container = document.body.querySelector('div')!;

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    expect(session.getCurrentScreen()).toBe('formation');

    const firstClassId = initialClassIds[0]!;
    const pickerItem = document.querySelector<HTMLButtonElement>(
      `.skill-menu-picker-list-item[data-picker-class-id="${firstClassId}"]`,
    );
    expect(pickerItem).toBeTruthy();
    pickerItem!.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toEqual(initialClassIds);
  });

  it('ignores class picker interaction while formation is hidden under stage select', () => {
    session = createSession();
    session.start();

    const initialClassIds = getPartyClassIds(session);
    const container = document.body.querySelector('div')!;

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    (session as unknown as { openStageSelect: () => void }).openStageSelect();

    const firstClassId = initialClassIds[0]!;
    const pickerItem = document.querySelector<HTMLButtonElement>(
      `.skill-menu-picker-list-item[data-picker-class-id="${firstClassId}"]`,
    );
    pickerItem?.click();
    pickerItem?.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toEqual(initialClassIds);
  });

  it('reopens formation after stage select when menu was previously open', () => {
    session = createSession();
    session.start();

    const initialClassIds = getPartyClassIds(session);
    const container = document.body.querySelector('div')!;

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    expect(session.getCurrentScreen()).toBe('formation');

    (session as unknown as { openStageSelect: () => void }).openStageSelect();
    expect(session.getCurrentScreen()).toBe('stageSelect');

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toEqual(initialClassIds);
    expect(session.getCurrentScreen()).toBe('formation');
  });

  it('keeps party size after swapping one class then returning to stage select', () => {
    session = createSession();
    session.start();

    const container = document.body.querySelector('div')!;
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();

    const classIds = getPartyClassIds(session);
    expect(classIds.length).toBe(4);

    const removeTarget = classIds[3]!;
    const addTarget = [...document.querySelectorAll<HTMLButtonElement>(
      '.skill-menu-picker-list-item:not(.skill-menu-picker-list-item--active)',
    )].map((item) => item.dataset.pickerClassId)
      .find((id): id is string => Boolean(id));
    expect(addTarget).toBeTruthy();

    activatePickerItem(findPickerItem(removeTarget));
    activatePickerItem(findPickerItem(removeTarget));
    activatePickerItem(findPickerItem(addTarget!));

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toContain(addTarget!);
    expect(getPartyClassIds(session)).not.toContain(removeTarget);

    (session as unknown as { openStageSelect: () => void }).openStageSelect();
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session)).toContain(addTarget!);
    expect(getPartyClassIds(session)).not.toContain(removeTarget);
  });

  it('applies formation edits after pause → stage select → sortie', () => {
    session = createSession();
    session.start();

    const container = document.body.querySelector('div')!;
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    container
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();
    expect(session.getCurrentScreen()).toBe('battle');

    session.view.setBattlePaused(true);
    container
      .querySelector<HTMLButtonElement>(
        '.battle-pause-action-button[data-ui-message-key="battle.returnToStageSelect"]',
      )
      ?.click();
    expect(session.getCurrentScreen()).toBe('stageSelect');

    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    expect(session.getCurrentScreen()).toBe('formation');

    const classIds = getPartyClassIds(session);
    const removeTarget = classIds[3]!;
    const addTarget = [...document.querySelectorAll<HTMLButtonElement>(
      '.skill-menu-picker-list-item:not(.skill-menu-picker-list-item--active)',
    )]
      .map((item) => item.dataset.pickerClassId)
      .find((id): id is string => Boolean(id));
    expect(addTarget).toBeTruthy();

    activatePickerItem(findPickerItem(removeTarget));
    activatePickerItem(findPickerItem(removeTarget));
    activatePickerItem(findPickerItem(addTarget!));

    const expectedClassIds = getPartyClassIds(session);
    expect(expectedClassIds).toContain(addTarget!);
    expect(expectedClassIds).not.toContain(removeTarget);

    container
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();
    expect(session.getCurrentScreen()).toBe('battle');

    const operationParty = session.getOperationParty();
    expect(operationParty).not.toBeNull();
    const operationClassIds = operationParty!
      .filter((member) => member !== null)
      .map((member) => member!.classId);
    expect(operationClassIds.sort()).toEqual(expectedClassIds.sort());
  });
});

function findPickerItem(classId: string): HTMLButtonElement {
  const item = document.querySelector<HTMLButtonElement>(
    `.skill-menu-picker-list-item[data-picker-class-id="${classId}"]`,
  );
  if (!item) {
    throw new Error(`picker item not found: ${classId}`);
  }
  return item;
}

function activatePickerItem(item: HTMLButtonElement): void {
  item.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
  );
  item.click();
}
