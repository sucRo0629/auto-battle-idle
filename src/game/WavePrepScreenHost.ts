import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import {
  createMemberFromClass,
  getAssignableClassIds,
  PARTY_DUPLICATE_CLASS_MESSAGE,
  type PartyClassAssignmentResult,
} from '../progression/partyCompose.ts';
import {
  buildCombatModulePrepViews,
  createCombatModulePrepSection,
} from '../ui/combatModulePrepDisplay.ts';
import {
  buildOperationPassivePrepViews,
  createOperationPassivePrepSection,
} from '../ui/operationPassivePrepDisplay.ts';
import type { OperationStateReadonlyView } from './OperationState.ts';
import '../styles/wave-prep-screen.css';
import '../styles/operation-prep-panels.css';

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
  getPassiveAcquireCost: () => number;
  getPassiveDisplayName: (passiveId: string) => string;
  getPassiveDescription: (passiveId: string) => string;
  onAcquireOperationPassive: (slotIndex: number, passiveId: string) => boolean;
  onConfirmNextWave: () => boolean;
  shouldShowRetryActions: () => boolean;
  onRetryCurrentWave: () => boolean;
  onReturnToFormationPrep: () => boolean;
  onRestartOperationFromWaveZero: () => boolean;
}

/** R9.6: Wave 間準備の Player 完了用試作 UI（CombatModule + 作戦内パッシブ。製品 polish ではない）。 */
export class WavePrepScreenHost {
  private root: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private resourceEl: HTMLElement | null = null;
  private slotsHost: HTMLElement | null = null;
  private stickyFooter: HTMLElement | null = null;
  private retrySection: HTMLElement | null = null;

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
    if (!this.root || !this.slotsHost) return;
    const view = this.callbacks.getOperationView();
    if (!view) {
      this.statusEl!.textContent = '作戦データなし';
      this.resourceEl!.textContent = '';
      this.slotsHost.replaceChildren();
      return;
    }

    const nextWaveNumber = view.currentWaveIndex + 2;
    this.statusEl!.textContent =
      `Wave ${view.currentWaveIndex + 1} クリア — 次は Wave ${nextWaveNumber}`;
    this.resourceEl!.textContent =
      `作戦内リソース: ${this.callbacks.getUnspentOperationResource()}`;

    this.slotsHost.replaceChildren();
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      this.slotsHost.appendChild(this.createSlotRow(slotIndex, view));
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
    this.slotsHost = null;
    this.stickyFooter = null;
    this.retrySection = null;
  }

  private build(): void {
    this.root = document.createElement('section');
    this.root.className = 'wave-prep-screen game-panel-surface';

    const stickyHeader = document.createElement('div');
    stickyHeader.className = 'wave-prep-screen__sticky-header';

    const title = document.createElement('h1');
    title.className = 'wave-prep-screen__title';
    title.textContent = 'Wave 間準備';

    this.statusEl = document.createElement('p');
    this.statusEl.className = 'wave-prep-screen__status';

    this.resourceEl = document.createElement('p');
    this.resourceEl.className = 'wave-prep-screen__resource';

    stickyHeader.append(title, this.statusEl, this.resourceEl);

    this.slotsHost = document.createElement('div');
    this.slotsHost.className = 'wave-prep-screen__slots';

    this.stickyFooter = document.createElement('div');
    this.stickyFooter.className = 'wave-prep-screen__sticky-footer';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className =
      'wave-prep-screen__confirm game-ui-button game-ui-button--primary';
    confirmButton.textContent = '次の Wave へ';
    confirmButton.addEventListener('click', () => {
      const started = this.callbacks.onConfirmNextWave();
      if (!started) {
        this.statusEl!.textContent = '次 Wave を開始できませんでした';
      }
    });

    this.retrySection = this.createRetrySection();
    this.stickyFooter.append(confirmButton, this.retrySection);

    this.root.append(stickyHeader, this.slotsHost, this.stickyFooter);
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

  private createSlotRow(
    slotIndex: number,
    view: OperationStateReadonlyView,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wave-prep-screen__slot game-panel-surface';
    row.dataset.slotIndex = String(slotIndex);

    const member = view.party[slotIndex];
    const currentClassId = member?.classId ?? null;

    const header = document.createElement('div');
    header.className = 'wave-prep-screen__slot-header';

    const label = document.createElement('span');
    label.className = 'wave-prep-screen__slot-label';
    label.textContent = `Slot ${slotIndex + 1}`;

    const classSelect = document.createElement('select');
    classSelect.className = 'wave-prep-screen__class-select';
    const assignable = getAssignableClassIds(
      [...view.party],
      this.callbacks.getUnlockedClassIds(),
      slotIndex,
      this.gameData.classOrder,
    );
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
    classSelect.addEventListener('change', () => {
      this.handleClassChange(slotIndex, classSelect);
    });

    header.append(label, classSelect);
    row.appendChild(header);

    const moduleHost = document.createElement('div');
    moduleHost.className = 'wave-prep-screen__module-section';
    const preset = currentClassId
      ? this.gameData.classRegistry[currentClassId]
      : undefined;
    const moduleViews = buildCombatModulePrepViews(
      preset,
      this.gameData.combatModuleRegistry,
      this.callbacks.getSelectedModuleId(slotIndex),
    );
    moduleHost.appendChild(
      createCombatModulePrepSection({
        views: moduleViews,
        variantClass: 'wave-prep-screen__combat-module',
        onSelect: (moduleId) => {
          this.handleModuleChange(slotIndex, moduleId);
        },
      }),
    );
    row.appendChild(moduleHost);

    const passiveViews = buildOperationPassivePrepViews({
      candidateIds: this.callbacks.getOperationPassiveCandidates(slotIndex),
      acquiredIds: this.callbacks.getAcquiredOperationPassiveIds(slotIndex),
      acquireCost: this.callbacks.getPassiveAcquireCost(),
      currentResource: this.callbacks.getUnspentOperationResource(),
      getPassiveDef: (passiveId) =>
        this.gameData.skillRegistry.passives[passiveId],
    });
    row.appendChild(
      createOperationPassivePrepSection({
        views: passiveViews,
        includeResourceLine: false,
        variantClass: 'wave-prep-screen__passive-block',
        onAcquire: (passiveId) => {
          this.handleAcquirePassive(slotIndex, passiveId);
        },
      }),
    );

    return row;
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

  private handleModuleChange(slotIndex: number, moduleId: string): void {
    if (!this.callbacks.onModuleChanged(slotIndex, moduleId)) {
      this.statusEl!.textContent = '戦闘方式を変更できませんでした';
      this.refresh();
      return;
    }
    this.refresh();
  }

  private handleAcquirePassive(slotIndex: number, passiveId: string): void {
    if (!this.callbacks.onAcquireOperationPassive(slotIndex, passiveId)) {
      this.statusEl!.textContent = 'パッシブを取得できませんでした';
      this.refresh();
      return;
    }
    this.refresh();
  }
}
