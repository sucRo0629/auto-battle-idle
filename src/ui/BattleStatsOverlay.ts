import '../styles/battle-stats-overlay.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot, GameData } from '../battle/types.ts';
import { getStageById } from '../progression/stageProgression.ts';
import {
  PartyMemberStatsDisplay,
  type PartyMemberProgress,
  type PartyMemberStatsDataSource,
  type PartyMemberStatsRowSpec,
} from './PartyMemberStatsDisplay.ts';

export interface BattleStatsOverlayCallbacks {
  getDisplayRows: () => StageDamageDisplayRow[];
  getAllySnapshots: () => CombatantSnapshot[];
  getPartyProgress: () => PartyMemberProgress[];
  getCurrentStageId: () => string;
  onClose: () => void;
}

export class BattleStatsOverlay {
  private readonly root: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly statsDisplay: PartyMemberStatsDisplay;
  private readonly dataSource: PartyMemberStatsDataSource;

  constructor(
    host: HTMLElement,
    private readonly gameData: GameData,
    callbacks: BattleStatsOverlayCallbacks,
  ) {
    this.dataSource = {
      getDisplayRows: callbacks.getDisplayRows,
      getAllySnapshots: callbacks.getAllySnapshots,
      getPartyProgress: callbacks.getPartyProgress,
    };

    this.root = document.createElement('div');
    this.root.className = 'battle-stats-overlay';

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'battle-stats-backdrop';
    backdrop.setAttribute('aria-label', '統計情報を閉じる');
    backdrop.addEventListener('click', () => callbacks.onClose());
    this.root.appendChild(backdrop);

    const windowEl = document.createElement('div');
    windowEl.className = 'battle-stats-window';
    windowEl.addEventListener('click', (event) => event.stopPropagation());

    const titleBar = document.createElement('div');
    titleBar.className = 'battle-stats-window-bar';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'battle-stats-title-wrap';

    const titleEl = document.createElement('h2');
    titleEl.className = 'battle-stats-title';
    titleEl.textContent = '統計情報';

    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'battle-stats-subtitle';
    const stageId = callbacks.getCurrentStageId();
    const stage = getStageById(this.gameData.stages, stageId);
    subtitleEl.textContent = stage?.displayName ?? stageId;

    titleWrap.append(titleEl, subtitleEl);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'battle-stats-close';
    closeButton.setAttribute('aria-label', '閉じる');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => callbacks.onClose());

    titleBar.append(titleWrap, closeButton);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'battle-stats-window-body';
    this.statsDisplay = new PartyMemberStatsDisplay(this.bodyEl);
    this.renderBody();

    windowEl.append(titleBar, this.bodyEl);
    this.root.appendChild(windowEl);
    host.appendChild(this.root);
  }

  update(): void {
    this.statsDisplay.update(this.dataSource);
  }

  private renderBody(): void {
    this.statsDisplay.clear();

    const rows = this.dataSource.getDisplayRows();
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'battle-stats-empty';
      empty.textContent = 'パーティメンバーがいません';
      this.bodyEl.appendChild(empty);
      return;
    }

    const specs: PartyMemberStatsRowSpec[] = rows.map((row) => ({
      slotIndex: row.slotIndex,
      displayName: row.displayName,
      epithetEn: row.epithetEn,
    }));
    this.statsDisplay.rebuild(specs);
    this.statsDisplay.update(this.dataSource);
  }

  destroy(): void {
    this.root.remove();
  }
}
