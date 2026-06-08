import '../styles/battle-stats-overlay.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { GameData } from '../battle/types.ts';
import { getStageById } from '../progression/stageProgression.ts';

export interface BattleStatsOverlayCallbacks {
  getDisplayRows: () => StageDamageDisplayRow[];
  getCurrentStageId: () => string;
  onClose: () => void;
}

export class BattleStatsOverlay {
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly gameData: GameData,
    private readonly callbacks: BattleStatsOverlayCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'battle-stats-overlay';

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'battle-stats-backdrop';
    backdrop.setAttribute('aria-label', '統計情報を閉じる');
    backdrop.addEventListener('click', () => this.callbacks.onClose());
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
    const stageId = this.callbacks.getCurrentStageId();
    const stage = getStageById(this.gameData.stages, stageId);
    subtitleEl.textContent = stage?.displayName ?? stageId;

    titleWrap.append(titleEl, subtitleEl);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'battle-stats-close';
    closeButton.setAttribute('aria-label', '閉じる');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => this.callbacks.onClose());

    titleBar.append(titleWrap, closeButton);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'battle-stats-window-body';
    this.renderBody(bodyEl);

    windowEl.append(titleBar, bodyEl);
    this.root.appendChild(windowEl);
    host.appendChild(this.root);
  }

  private renderBody(bodyEl: HTMLElement): void {
    bodyEl.replaceChildren();
    const rows = this.callbacks.getDisplayRows();

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'battle-stats-empty';
      empty.textContent = 'パーティメンバーがいません';
      bodyEl.appendChild(empty);
      return;
    }

    bodyEl.append(
      this.createSection('与ダメージ', rows, 'dealt'),
      this.createSection('被ダメージ', rows, 'taken'),
    );
  }

  private createSection(
    title: string,
    rows: StageDamageDisplayRow[],
    kind: 'dealt' | 'taken',
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'battle-stats-section';

    const heading = document.createElement('h3');
    heading.className = 'battle-stats-section-title';
    heading.textContent = title;
    section.appendChild(heading);

    const hasData = rows.some((row) =>
      kind === 'dealt' ? row.damageDealt > 0 : row.damageTaken > 0,
    );

    if (!hasData) {
      const empty = document.createElement('p');
      empty.className = 'battle-stats-section-empty';
      empty.textContent = 'データなし';
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('div');
    list.className = 'battle-stats-bar-list';

    for (const row of rows) {
      const ratio = kind === 'dealt' ? row.dealtRatio : row.takenRatio;
      const value = kind === 'dealt' ? row.damageDealt : row.damageTaken;

      const item = document.createElement('div');
      item.className = 'battle-stats-bar-item';

      const label = document.createElement('span');
      label.className = 'battle-stats-bar-label';
      label.textContent = row.displayName;

      const track = document.createElement('div');
      track.className = 'battle-stats-bar-track';

      const fill = document.createElement('div');
      fill.className =
        kind === 'dealt'
          ? 'battle-stats-bar-fill battle-stats-bar-fill--dealt'
          : 'battle-stats-bar-fill battle-stats-bar-fill--taken';
      fill.style.width = `${Math.round(ratio * 100)}%`;

      const valueLabel = document.createElement('span');
      valueLabel.className = 'battle-stats-bar-value';
      valueLabel.textContent = ratio.toFixed(2);

      track.appendChild(fill);
      item.append(label, track, valueLabel);
      list.appendChild(item);

      if (value <= 0) {
        fill.style.width = '0%';
      }
    }

    section.appendChild(list);
    return section;
  }

  destroy(): void {
    this.root.remove();
  }
}
