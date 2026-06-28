import '../styles/battle-stats-drawer.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot, GameData } from '../battle/types.ts';
import { getStageById } from '../progression/stageProgression.ts';
import { resolveClassIconKey } from '../render/entityVisuals.ts';
import {
  PartyMemberStatsDisplay,
  type PartyMemberStatsDataSource,
  type PartyMemberStatsFrame,
  type PartyMemberStatsRowSpec,
} from './PartyMemberStatsDisplay.ts';

export interface BattleStatsDrawerCallbacks {
  getDisplayRows: () => StageDamageDisplayRow[];
  getAllySnapshots: () => CombatantSnapshot[];
  getCurrentStageId: () => string;
  onOpenChange: (open: boolean) => void;
}

export interface BattleStatsDrawerOptions {
  themeHost?: HTMLElement;
}

export class BattleStatsDrawer {
  private readonly root: HTMLElement;
  private readonly tabButton: HTMLButtonElement;
  private readonly tabIcon: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly statsDisplay: PartyMemberStatsDisplay;
  private readonly dataSource: PartyMemberStatsDataSource;
  private readonly onEscapeKey: (event: KeyboardEvent) => void;
  private open = false;
  private bodyBuilt = false;

  constructor(
    private readonly gameData: GameData,
    private readonly callbacks: BattleStatsDrawerCallbacks,
    options: BattleStatsDrawerOptions = {},
  ) {
    this.dataSource = {
      getDisplayRows: callbacks.getDisplayRows,
      getAllySnapshots: callbacks.getAllySnapshots,
    };

    this.root = document.createElement('div');
    this.root.className = 'party-hud-drawer';

    this.tabButton = document.createElement('button');
    this.tabButton.type = 'button';
    this.tabButton.className = 'party-hud-drawer-tab';
    this.tabButton.setAttribute('aria-label', '戦闘詳細を開く');
    this.tabButton.setAttribute('aria-expanded', 'false');
    this.tabButton.addEventListener('click', () => {
      this.toggle();
    });

    this.tabIcon = document.createElement('span');
    this.tabIcon.className =
      'party-hud-drawer-tab-icon material-symbols-outlined';
    this.tabIcon.setAttribute('aria-hidden', 'true');
    this.tabIcon.textContent = 'expand_more';
    this.tabButton.appendChild(this.tabIcon);

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'party-hud-drawer-panel';
    this.panelEl.hidden = true;

    const headerEl = document.createElement('div');
    headerEl.className = 'party-hud-drawer-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'party-hud-drawer-title';
    titleEl.textContent = '戦闘詳細';

    this.subtitleEl = document.createElement('p');
    this.subtitleEl.className = 'party-hud-drawer-subtitle';

    headerEl.append(titleEl, this.subtitleEl);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'party-hud-drawer-body';
    this.statsDisplay = new PartyMemberStatsDisplay(this.bodyEl, {
      themeHost: options.themeHost,
    });

    this.panelEl.append(headerEl, this.bodyEl);
    this.root.append(this.tabButton, this.panelEl);

    this.onEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !this.open) return;
      event.preventDefault();
      this.setOpen(false);
    };
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.refreshSubtitle();
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.root.classList.toggle('party-hud-drawer--open', open);
    this.panelEl.hidden = !open;
    this.tabButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.tabButton.setAttribute(
      'aria-label',
      open ? '戦闘詳細を閉じる' : '戦闘詳細を開く',
    );
    this.tabIcon.textContent = open ? 'expand_less' : 'expand_more';

    if (open) {
      this.refreshSubtitle();
      this.ensureBodyBuilt();
      document.addEventListener('keydown', this.onEscapeKey);
    } else {
      document.removeEventListener('keydown', this.onEscapeKey);
    }

    this.callbacks.onOpenChange(open);
  }

  setDisabled(disabled: boolean): void {
    this.tabButton.disabled = disabled;
  }

  update(frame?: PartyMemberStatsFrame): void {
    if (!this.open) return;
    this.statsDisplay.update(this.dataSource, frame);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onEscapeKey);
    this.statsDisplay.destroy();
    this.root.remove();
  }

  private refreshSubtitle(): void {
    const stageId = this.callbacks.getCurrentStageId();
    const stage = getStageById(this.gameData.stages, stageId);
    this.subtitleEl.textContent = stage?.displayName ?? stageId;
  }

  private ensureBodyBuilt(): void {
    if (this.bodyBuilt) return;
    this.bodyBuilt = true;
    this.renderBody();
  }

  private renderBody(): void {
    this.statsDisplay.clear();

    const rows = this.dataSource.getDisplayRows();
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'party-hud-drawer-empty';
      empty.textContent = 'パーティメンバーがいません';
      this.bodyEl.appendChild(empty);
      return;
    }

    const specs: PartyMemberStatsRowSpec[] = rows.map((row) => {
      const preset = this.gameData.classRegistry[row.classId];
      return {
        slotIndex: row.slotIndex,
        displayName: row.displayName,
        iconKey: preset ? resolveClassIconKey(preset) : row.classId,
      };
    });
    this.statsDisplay.rebuild(specs);
    this.statsDisplay.update(this.dataSource);
  }
}
