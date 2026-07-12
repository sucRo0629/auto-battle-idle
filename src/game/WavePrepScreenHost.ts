import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import {
  createMemberFromClass,
  getAssignableClassIds,
  PARTY_DUPLICATE_CLASS_MESSAGE,
  type PartyClassAssignmentResult,
} from '../progression/partyCompose.ts';
import type { OperationStateReadonlyView } from './OperationState.ts';
import '../styles/wave-prep-screen.css';

export interface WavePrepScreenHostCallbacks {
  getOperationView: () => OperationStateReadonlyView | null;
  getUnlockedClassIds: () => ClassId[];
  getSelectedModuleId: (slotIndex: number) => string | undefined;
  onPartySlotChanged: (
    slotIndex: number,
    member: PartySlotState,
  ) => PartyClassAssignmentResult;
  onModuleChanged: (slotIndex: number, moduleId: string) => boolean;
  onConfirmNextWave: () => boolean;
}

/** R6e: Wave 間準備の最小 DOM UI（正式デザインは後続）。 */
export class WavePrepScreenHost {
  private root: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private slotRows: HTMLElement[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly gameData: GameData,
    private readonly callbacks: WavePrepScreenHostCallbacks,
  ) {}

  show(): void {
    this.host.hidden = false;
    if (!this.root) {
      this.build();
    }
    this.refresh();
  }

  hide(): void {
    this.host.hidden = true;
  }

  refresh(): void {
    if (!this.root) return;
    const view = this.callbacks.getOperationView();
    if (!view) {
      this.statusEl!.textContent = '作戦データなし';
      return;
    }

    const nextWaveNumber = view.currentWaveIndex + 2;
    this.statusEl!.textContent =
      `Wave ${view.currentWaveIndex + 1} クリア — 次は Wave ${nextWaveNumber}`;

    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      this.refreshSlotRow(slotIndex, view);
    }
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.statusEl = null;
    this.slotRows = [];
  }

  private build(): void {
    this.root = document.createElement('section');
    this.root.className = 'wave-prep-screen game-panel-surface';

    const title = document.createElement('h1');
    title.className = 'wave-prep-screen__title';
    title.textContent = 'Wave 間準備';

    this.statusEl = document.createElement('p');
    this.statusEl.className = 'wave-prep-screen__status';

    const slotsHost = document.createElement('div');
    slotsHost.className = 'wave-prep-screen__slots';

    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      const row = this.createSlotRow(slotIndex);
      slotsHost.appendChild(row);
      this.slotRows[slotIndex] = row;
    }

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'wave-prep-screen__confirm game-ui-button';
    confirmButton.textContent = '次の Wave へ';
    confirmButton.addEventListener('click', () => {
      const started = this.callbacks.onConfirmNextWave();
      if (!started) {
        this.statusEl!.textContent = '次 Wave を開始できませんでした';
      }
    });

    this.root.append(title, this.statusEl, slotsHost, confirmButton);
    this.host.replaceChildren(this.root);
  }

  private createSlotRow(slotIndex: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wave-prep-screen__slot';

    const label = document.createElement('span');
    label.className = 'wave-prep-screen__slot-label';
    label.textContent = `Slot ${slotIndex + 1}`;

    const classSelect = document.createElement('select');
    classSelect.className = 'wave-prep-screen__class-select';
    classSelect.addEventListener('change', () => {
      this.handleClassChange(slotIndex, classSelect);
    });

    const moduleSelect = document.createElement('select');
    moduleSelect.className = 'wave-prep-screen__module-select';
    moduleSelect.addEventListener('change', () => {
      this.handleModuleChange(slotIndex, moduleSelect);
    });

    row.append(label, classSelect, moduleSelect);
    return row;
  }

  private refreshSlotRow(
    slotIndex: number,
    view: OperationStateReadonlyView,
  ): void {
    const row = this.slotRows[slotIndex];
    if (!row) return;

    const classSelect = row.querySelector<HTMLSelectElement>(
      '.wave-prep-screen__class-select',
    );
    const moduleSelect = row.querySelector<HTMLSelectElement>(
      '.wave-prep-screen__module-select',
    );
    if (!classSelect || !moduleSelect) return;

    const member = view.party[slotIndex];
    const currentClassId = member?.classId ?? null;
    const assignable = getAssignableClassIds(
      [...view.party],
      this.callbacks.getUnlockedClassIds(),
      slotIndex,
      this.gameData.classOrder,
    );

    classSelect.replaceChildren();
    for (const classId of assignable) {
      const preset = this.gameData.classRegistry[classId];
      const option = document.createElement('option');
      option.value = classId;
      option.textContent = preset?.displayName ?? classId;
      classSelect.appendChild(option);
    }
    if (currentClassId) {
      classSelect.value = currentClassId;
    }

    moduleSelect.replaceChildren();
    if (currentClassId) {
      const preset = this.gameData.classRegistry[currentClassId];
      const moduleIds = preset?.combatModuleIds ?? [];
      for (const moduleId of moduleIds) {
        const moduleDef = this.gameData.combatModuleRegistry[moduleId];
        const option = document.createElement('option');
        option.value = moduleId;
        option.textContent = moduleDef?.displayName ?? moduleId;
        moduleSelect.appendChild(option);
      }
      const resolved = resolveSelectedCombatModuleId(
        preset!,
        this.gameData.combatModuleRegistry,
        this.callbacks.getSelectedModuleId(slotIndex),
      );
      if (resolved) {
        moduleSelect.value = resolved;
      }
      moduleSelect.disabled = moduleIds.length === 0;
    } else {
      moduleSelect.disabled = true;
    }
  }

  private handleClassChange(
    slotIndex: number,
    classSelect: HTMLSelectElement,
  ): void {
    const classId = classSelect.value as ClassId;
    const member = createMemberFromClass(classId, this.gameData);
    const result = this.callbacks.onPartySlotChanged(slotIndex, member);
    if (!result.ok) {
      if (result.reason === 'duplicateClass') {
        this.statusEl!.textContent = PARTY_DUPLICATE_CLASS_MESSAGE;
      } else {
        this.statusEl!.textContent = '兵科を変更できませんでした';
      }
      this.refresh();
      return;
    }
    this.refresh();
  }

  private handleModuleChange(
    slotIndex: number,
    moduleSelect: HTMLSelectElement,
  ): void {
    const moduleId = moduleSelect.value;
    if (!this.callbacks.onModuleChanged(slotIndex, moduleId)) {
      this.statusEl!.textContent = '戦闘方式を変更できませんでした';
      this.refresh();
      return;
    }
    this.refresh();
  }
}
