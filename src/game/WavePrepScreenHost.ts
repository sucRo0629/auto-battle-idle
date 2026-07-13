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
import { OPERATION_PASSIVE_ACQUIRE_COST } from './operationPassiveCatalog.ts';
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
  getUnspentOperationResource: () => number;
  getAcquiredOperationPassiveIds: (slotIndex: number) => readonly string[];
  getOperationPassiveCandidates: (slotIndex: number) => readonly string[];
  getPassiveDisplayName: (passiveId: string) => string;
  getPassiveDescription: (passiveId: string) => string;
  onAcquireOperationPassive: (slotIndex: number, passiveId: string) => boolean;
  onConfirmNextWave: () => boolean;
  shouldShowRetryActions: () => boolean;
  onRetryCurrentWave: () => boolean;
  onReturnToFormationPrep: () => boolean;
  onRestartOperationFromWaveZero: () => boolean;
}

/** R6e / R8c: Wave 間準備の最小 DOM UI（正式デザインは後続）。 */
export class WavePrepScreenHost {
  private root: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private resourceEl: HTMLElement | null = null;
  private retrySection: HTMLElement | null = null;
  private slotRows: HTMLElement[] = [];
  /** slot ごとの未確定 passive 選択（取得ボタンまで消費しない）。 */
  private readonly pendingPassiveSelection = new Map<number, string>();

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
      this.resourceEl!.textContent = '';
      return;
    }

    const nextWaveNumber = view.currentWaveIndex + 2;
    this.statusEl!.textContent =
      `Wave ${view.currentWaveIndex + 1} クリア — 次は Wave ${nextWaveNumber}`;
    this.resourceEl!.textContent =
      `作戦内リソース: ${this.callbacks.getUnspentOperationResource()}`;

    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      this.refreshSlotRow(slotIndex, view);
    }

    if (this.retrySection) {
      this.retrySection.hidden = !this.callbacks.shouldShowRetryActions();
    }
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.statusEl = null;
    this.resourceEl = null;
    this.retrySection = null;
    this.slotRows = [];
    this.pendingPassiveSelection.clear();
  }

  private build(): void {
    this.root = document.createElement('section');
    this.root.className = 'wave-prep-screen game-panel-surface';

    const title = document.createElement('h1');
    title.className = 'wave-prep-screen__title';
    title.textContent = 'Wave 間準備';

    this.statusEl = document.createElement('p');
    this.statusEl.className = 'wave-prep-screen__status';

    this.resourceEl = document.createElement('p');
    this.resourceEl.className = 'wave-prep-screen__resource';

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

    this.retrySection = this.createRetrySection();

    this.root.append(
      title,
      this.statusEl,
      this.resourceEl,
      slotsHost,
      confirmButton,
      this.retrySection,
    );
    this.host.replaceChildren(this.root);
  }

  private createRetrySection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'wave-prep-screen__retry';
    section.hidden = true;

    const retryTitle = document.createElement('h2');
    retryTitle.className = 'wave-prep-screen__retry-title';
    retryTitle.textContent = '再試行';

    const retryActions = document.createElement('div');
    retryActions.className = 'wave-prep-screen__retry-actions';

    const retryButtons: Array<{ text: string; run: () => boolean }> = [
      {
        text: '現在Waveを同設定で再戦',
        run: () => this.callbacks.onRetryCurrentWave(),
      },
      {
        text: '準備へ戻る',
        run: () => this.callbacks.onReturnToFormationPrep(),
      },
      {
        text: '作戦をWave 0からやり直す',
        run: () => this.callbacks.onRestartOperationFromWaveZero(),
      },
    ];

    for (const action of retryButtons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wave-prep-screen__retry-button game-ui-button';
      button.textContent = action.text;
      button.addEventListener('click', () => {
        if (!action.run()) {
          this.statusEl!.textContent = '操作を実行できませんでした';
        }
      });
      retryActions.appendChild(button);
    }

    section.append(retryTitle, retryActions);
    return section;
  }

  private createSlotRow(slotIndex: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wave-prep-screen__slot';
    row.dataset.slotIndex = String(slotIndex);

    const header = document.createElement('div');
    header.className = 'wave-prep-screen__slot-header';

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

    header.append(label, classSelect, moduleSelect);

    const passiveSection = document.createElement('div');
    passiveSection.className = 'wave-prep-screen__passive-section';

    const acquiredEl = document.createElement('div');
    acquiredEl.className = 'wave-prep-screen__passive-acquired';

    const passiveControls = document.createElement('div');
    passiveControls.className = 'wave-prep-screen__passive-controls';

    const passiveSelect = document.createElement('select');
    passiveSelect.className = 'wave-prep-screen__passive-select';
    passiveSelect.addEventListener('change', () => {
      const passiveId = passiveSelect.value;
      if (passiveId) {
        this.pendingPassiveSelection.set(slotIndex, passiveId);
      } else {
        this.pendingPassiveSelection.delete(slotIndex);
      }
      this.updatePassiveDetail(passiveSection, passiveSelect.value || null);
      acquireButton.disabled =
        passiveId === '' ||
        this.callbacks.getUnspentOperationResource() < OPERATION_PASSIVE_ACQUIRE_COST;
    });

    const passiveDetail = document.createElement('p');
    passiveDetail.className = 'wave-prep-screen__passive-detail';
    passiveDetail.dataset.slotIndex = String(slotIndex);

    const acquireButton = document.createElement('button');
    acquireButton.type = 'button';
    acquireButton.className =
      'wave-prep-screen__passive-acquire game-ui-button';
    acquireButton.textContent = 'パッシブ取得';
    acquireButton.addEventListener('click', () => {
      this.handleAcquirePassive(slotIndex, passiveSelect);
    });

    passiveControls.append(passiveSelect, acquireButton);
    passiveSection.append(acquiredEl, passiveControls, passiveDetail);
    row.append(header, passiveSection);
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
    const acquiredEl = row.querySelector<HTMLElement>(
      '.wave-prep-screen__passive-acquired',
    );
    const passiveSelect = row.querySelector<HTMLSelectElement>(
      '.wave-prep-screen__passive-select',
    );
    const acquireButton = row.querySelector<HTMLButtonElement>(
      '.wave-prep-screen__passive-acquire',
    );
    if (
      !classSelect ||
      !moduleSelect ||
      !acquiredEl ||
      !passiveSelect ||
      !acquireButton
    ) {
      return;
    }

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

    const acquiredIds =
      this.callbacks.getAcquiredOperationPassiveIds(slotIndex);
    if (acquiredIds.length > 0) {
      const labels = acquiredIds.map((id) => {
        const name = this.callbacks.getPassiveDisplayName(id);
        const desc = this.callbacks.getPassiveDescription(id);
        return desc ? `${name}: ${desc}` : name;
      });
      acquiredEl.textContent = `取得済み: ${labels.join(' / ')}`;
    } else {
      acquiredEl.textContent = '取得済み: なし';
    }

    const acquiredSet = new Set(acquiredIds);
    const selectableCandidates = this.callbacks
      .getOperationPassiveCandidates(slotIndex)
      .filter((passiveId) => !acquiredSet.has(passiveId));

    passiveSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      selectableCandidates.length > 0 ? '候補を選択' : '候補なし';
    passiveSelect.appendChild(placeholder);

    for (const passiveId of selectableCandidates) {
      const option = document.createElement('option');
      option.value = passiveId;
      const name = this.callbacks.getPassiveDisplayName(passiveId);
      option.textContent = `${name}（消費 ${OPERATION_PASSIVE_ACQUIRE_COST}）`;
      passiveSelect.appendChild(option);
    }

    const pending = this.pendingPassiveSelection.get(slotIndex);
    if (pending && selectableCandidates.includes(pending)) {
      passiveSelect.value = pending;
    } else {
      this.pendingPassiveSelection.delete(slotIndex);
      passiveSelect.value = '';
    }

    const passiveSection = row.querySelector<HTMLElement>(
      '.wave-prep-screen__passive-section',
    );
    if (passiveSection) {
      this.updatePassiveDetail(
        passiveSection,
        passiveSelect.value || null,
        acquiredIds,
      );
    }

    const canAcquire =
      selectableCandidates.length > 0 &&
      passiveSelect.value !== '' &&
      this.callbacks.getUnspentOperationResource() >= OPERATION_PASSIVE_ACQUIRE_COST;
    passiveSelect.disabled = selectableCandidates.length === 0;
    acquireButton.disabled = !canAcquire;
  }

  private handleClassChange(
    slotIndex: number,
    classSelect: HTMLSelectElement,
  ): void {
    this.pendingPassiveSelection.delete(slotIndex);
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

  private handleAcquirePassive(
    slotIndex: number,
    passiveSelect: HTMLSelectElement,
  ): void {
    const passiveId = passiveSelect.value;
    if (!passiveId) return;

    if (!this.callbacks.onAcquireOperationPassive(slotIndex, passiveId)) {
      this.statusEl!.textContent = 'パッシブを取得できませんでした';
      this.refresh();
      return;
    }

    this.pendingPassiveSelection.delete(slotIndex);
    this.refresh();
  }

  private updatePassiveDetail(
    passiveSection: HTMLElement,
    passiveId: string | null,
    acquiredIds: readonly string[] = [],
  ): void {
    const detailEl = passiveSection.querySelector<HTMLElement>(
      '.wave-prep-screen__passive-detail',
    );
    if (!detailEl) return;

    if (passiveId) {
      const name = this.callbacks.getPassiveDisplayName(passiveId);
      const desc = this.callbacks.getPassiveDescription(passiveId);
      detailEl.textContent = desc
        ? `${name} — ${desc}（消費 ${OPERATION_PASSIVE_ACQUIRE_COST}）`
        : `${name}（消費 ${OPERATION_PASSIVE_ACQUIRE_COST}）`;
      return;
    }

    if (acquiredIds.length > 0) {
      detailEl.textContent = '';
      return;
    }

    const resource = this.callbacks.getUnspentOperationResource();
    if (resource < OPERATION_PASSIVE_ACQUIRE_COST) {
      detailEl.textContent = `リソース不足（必要 ${OPERATION_PASSIVE_ACQUIRE_COST} / 残 ${resource}）`;
      return;
    }

    detailEl.textContent = '';
  }
}
