import '../styles/game-ui-chrome.css';
import '../styles/stage-selection-panel.css';
import type { GameData, StageDef } from '../battle/types.ts';
import {
  FIRST_PLAY_GUIDANCE_JA,
  STAGE_FIRST_PLAY_GUIDANCE_CLASS,
  fillStageDetailEnemySection,
} from './stageDetailDom.ts';

export interface StageSelectionPanelCallbacks {
  onSortie?: (stageId: string) => void;
}

export interface StageSelectionPanelOptions {
  initialStageId?: string;
  /** verify OFF release flow — generic map guidance (no save / read flag). */
  showFirstPlayGuidance?: boolean;
}

export class StageSelectionPanel {
  private readonly root: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly detailTitleEl: HTMLElement;
  private readonly detailLevelEl: HTMLElement;
  private readonly detailEnemySectionEl: HTMLElement;
  private readonly sortieButton: HTMLButtonElement;
  private readonly showFirstPlayGuidance: boolean;
  private selectedStageId: string | null;

  constructor(
    host: HTMLElement,
    private readonly gameData: GameData,
    private readonly callbacks: StageSelectionPanelCallbacks = {},
    options: StageSelectionPanelOptions = {},
  ) {
    this.showFirstPlayGuidance = options.showFirstPlayGuidance ?? false;
    this.selectedStageId =
      options.initialStageId ?? gameData.stages[0]?.id ?? null;

    this.root = document.createElement('div');
    this.root.className = 'stage-selection-panel';

    if (this.showFirstPlayGuidance) {
      const guidance = document.createElement('p');
      guidance.className = `${STAGE_FIRST_PLAY_GUIDANCE_CLASS} game-panel-surface`;
      guidance.textContent = FIRST_PLAY_GUIDANCE_JA;
      this.root.appendChild(guidance);
    }

    const body = document.createElement('div');
    body.className = 'stage-selection-panel-body';

    this.listEl = document.createElement('ul');
    this.listEl.className = 'stage-selection-list';
    this.listEl.setAttribute('role', 'listbox');
    this.listEl.setAttribute('aria-label', 'ステージ一覧');

    const detail = document.createElement('section');
    detail.className = 'stage-selection-detail game-panel-surface';

    this.detailTitleEl = document.createElement('h2');
    this.detailTitleEl.className = 'stage-selection-detail-title';

    this.detailLevelEl = document.createElement('div');
    this.detailLevelEl.className = 'stage-selection-detail-level';

    this.detailEnemySectionEl = document.createElement('div');
    this.detailEnemySectionEl.className = 'stage-selection-detail-enemy-section';

    this.sortieButton = document.createElement('button');
    this.sortieButton.type = 'button';
    this.sortieButton.className = 'game-ui-button game-ui-button--primary stage-selection-sortie';
    this.sortieButton.textContent = '出撃';
    this.sortieButton.addEventListener('click', () => {
      if (!this.selectedStageId) return;
      this.callbacks.onSortie?.(this.selectedStageId);
    });

    detail.append(
      this.detailTitleEl,
      this.detailLevelEl,
      this.detailEnemySectionEl,
      this.sortieButton,
    );

    body.append(this.listEl, detail);
    this.root.append(body);
    host.appendChild(this.root);

    this.renderStageList();
    this.renderDetail();
  }

  selectStage(stageId: string): void {
    if (!this.gameData.stages.some((stage) => stage.id === stageId)) return;
    this.selectedStageId = stageId;
    this.renderStageList();
    this.renderDetail();
  }

  getSelectedStageId(): string | null {
    return this.selectedStageId;
  }

  destroy(): void {
    this.root.remove();
  }

  private renderStageList(): void {
    this.listEl.replaceChildren();

    for (const stage of this.gameData.stages) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-selection-list-item';
      button.textContent = stage.displayName;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', stage.id === this.selectedStageId ? 'true' : 'false');
      if (stage.id === this.selectedStageId) {
        button.classList.add('stage-selection-list-item--selected');
      }
      button.addEventListener('click', () => this.selectStage(stage.id));
      item.appendChild(button);
      this.listEl.appendChild(item);
    }
  }

  private renderDetail(): void {
    const stage = this.getSelectedStage();
    if (!stage) {
      this.detailTitleEl.textContent = '—';
      this.detailLevelEl.textContent = '';
      this.detailEnemySectionEl.replaceChildren();
      this.sortieButton.disabled = true;
      return;
    }

    this.detailTitleEl.textContent = stage.displayName;
    this.detailLevelEl.textContent =
      stage.recommendedLevel === undefined
        ? '想定 Lv: —'
        : `想定 Lv: ${stage.recommendedLevel}`;
    fillStageDetailEnemySection(
      this.detailEnemySectionEl,
      stage,
      this.gameData,
    );
    this.sortieButton.disabled = false;
  }

  private getSelectedStage(): StageDef | undefined {
    if (!this.selectedStageId) return undefined;
    return this.gameData.stages.find((stage) => stage.id === this.selectedStageId);
  }
}
