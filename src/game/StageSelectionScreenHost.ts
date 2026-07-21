import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import type { GameData } from '../battle/types.ts';
import { ProblemSeriesEntryScreenHost } from './ProblemSeriesEntryScreenHost.ts';
import { ProblemSeriesOverviewScreenHost } from './ProblemSeriesOverviewScreenHost.ts';
import { StageSelectionPanel } from '../ui/StageSelectionPanel.ts';

export interface StageSelectionScreenHostCallbacks {
  getCurrentStageId: () => string;
  getClearedStageIds?: () => readonly string[];
  onSortie: (stageId: string) => void;
  onOpenMainOperation?: () => void;
  onPrepareMainOperation?: (normalizedSeed: string) => void;
  getPreparedProblemSeriesOperationStartSnapshot?: () =>
    ProblemSeriesOperationStartSnapshot | null;
  onBackFromMainOperationOverview?: () => void;
  onConfirmMainOperation?: () => void;
}

type StageSelectionSubstate = 'fixedStages' | 'mainEntry' | 'mainOverview';

/** Mounts StageSelectionPanel on the stage-selection screen host (`stageSelectHost` / screen `'stageSelect'`). */
export class StageSelectionScreenHost {
  private panel: StageSelectionPanel | null = null;
  private entryScreenHost: ProblemSeriesEntryScreenHost | null = null;
  private overviewScreenHost: ProblemSeriesOverviewScreenHost | null = null;
  private substate: StageSelectionSubstate = 'fixedStages';
  private readonly fixedChildHost: HTMLElement;
  private readonly entryChildHost: HTMLElement;
  private readonly overviewChildHost: HTMLElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly gameData: GameData,
    private readonly callbacks: StageSelectionScreenHostCallbacks,
    private readonly showFirstPlayGuidance = false,
  ) {
    this.fixedChildHost = document.createElement('div');
    this.fixedChildHost.className = 'stage-selection-fixed-host';
    this.fixedChildHost.hidden = true;
    this.host.appendChild(this.fixedChildHost);

    this.entryChildHost = document.createElement('div');
    this.entryChildHost.className = 'problem-series-entry-screen-host';
    this.entryChildHost.hidden = true;
    this.host.appendChild(this.entryChildHost);

    this.overviewChildHost = document.createElement('div');
    this.overviewChildHost.className = 'problem-series-overview-screen-host';
    this.overviewChildHost.hidden = true;
    this.host.appendChild(this.overviewChildHost);
  }

  show(): void {
    this.host.hidden = false;
    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.entryChildHost.hidden = true;
    this.overviewScreenHost?.destroy();
    this.overviewScreenHost = null;
    this.overviewChildHost.hidden = true;
    this.fixedChildHost.hidden = false;

    const currentStageId = this.callbacks.getCurrentStageId();
    const clearedStageIds = this.callbacks.getClearedStageIds?.() ?? [];
    if (!this.panel) {
      this.panel = this.createStageSelectionPanel(currentStageId, clearedStageIds);
      this.substate = 'fixedStages';
      return;
    }
    this.panel.setClearedStageIds(clearedStageIds);
    this.panel.selectStage(currentStageId);
    this.substate = 'fixedStages';
  }

  hide(): void {
    this.host.hidden = true;
  }

  /**
   * Opens the main-operation seed entry screen with an empty seed input.
   * Returns false without changing DOM or callbacks when the host is hidden.
   */
  showMainOperationEntry(): boolean {
    if (this.host.hidden) {
      return false;
    }

    this.openMainOperationEntry();
    return true;
  }

  /**
   * Shows the main-operation overview from an already-prepared snapshot (no seed re-resolve).
   * Returns false without changing visible substate or DOM when prerequisites are not met.
   */
  showPreparedMainOperationOverview(): boolean {
    if (this.host.hidden) {
      return false;
    }

    const getPreparedSnapshot =
      this.callbacks.getPreparedProblemSeriesOperationStartSnapshot;
    if (!getPreparedSnapshot) {
      return false;
    }

    const snapshot = getPreparedSnapshot();
    if (snapshot === null) {
      return false;
    }

    this.panel?.destroy();
    this.panel = null;
    this.fixedChildHost.hidden = true;

    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.entryChildHost.hidden = true;

    this.showMainOperationOverviewFromPreparedSnapshot(getPreparedSnapshot, {
      recreateOverviewHost: true,
    });
    return true;
  }

  destroy(): void {
    this.panel?.destroy();
    this.panel = null;
    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.overviewScreenHost?.destroy();
    this.overviewScreenHost = null;
    this.fixedChildHost.remove();
    this.entryChildHost.remove();
    this.overviewChildHost.remove();
  }

  private createStageSelectionPanel(
    currentStageId: string,
    clearedStageIds: readonly string[],
  ): StageSelectionPanel {
    return new StageSelectionPanel(
      this.fixedChildHost,
      this.gameData,
      {
        onSortie: (stageId) => this.callbacks.onSortie(stageId),
        onOpenMainOperation: () => this.handleOpenMainOperation(),
      },
      {
        initialStageId: currentStageId,
        showFirstPlayGuidance: this.showFirstPlayGuidance,
        clearedStageIds,
      },
    );
  }

  private handleOpenMainOperation(): void {
    this.openMainOperationEntry();
  }

  private openMainOperationEntry(): void {
    this.panel?.destroy();
    this.panel = null;
    this.fixedChildHost.hidden = true;

    this.overviewScreenHost?.destroy();
    this.overviewScreenHost = null;
    this.overviewChildHost.hidden = true;

    this.entryScreenHost?.destroy();
    this.entryScreenHost = this.createEntryScreenHost();
    this.entryScreenHost.show();
    this.entryChildHost.hidden = false;
    this.substate = 'mainEntry';
    this.callbacks.onOpenMainOperation?.();
  }

  private createEntryScreenHost(): ProblemSeriesEntryScreenHost {
    return new ProblemSeriesEntryScreenHost(this.entryChildHost, {
      onPrepare: (normalizedSeed) => this.handleEntryPrepare(normalizedSeed),
      onBack: () => this.handleEntryBack(),
    });
  }

  private handleEntryPrepare(normalizedSeed: string): void {
    this.callbacks.onPrepareMainOperation?.(normalizedSeed);

    const getPreparedSnapshot =
      this.callbacks.getPreparedProblemSeriesOperationStartSnapshot;
    if (!getPreparedSnapshot) {
      return;
    }

    this.showMainOperationOverviewFromPreparedSnapshot(getPreparedSnapshot);

    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.entryChildHost.hidden = true;
    this.fixedChildHost.hidden = true;
  }

  private showMainOperationOverviewFromPreparedSnapshot(
    getPreparedSnapshot: () => ProblemSeriesOperationStartSnapshot | null,
    options?: { recreateOverviewHost?: boolean },
  ): void {
    if (options?.recreateOverviewHost) {
      this.overviewScreenHost?.destroy();
      this.overviewScreenHost = null;
    }

    if (!this.overviewScreenHost) {
      this.overviewScreenHost = new ProblemSeriesOverviewScreenHost(
        this.overviewChildHost,
        this.gameData,
        {
          getPreparedSnapshot,
          onBack: () => this.handleOverviewBack(),
          onConfirm: () => this.callbacks.onConfirmMainOperation?.(),
        },
      );
    }
    this.overviewScreenHost.show();
    this.overviewChildHost.hidden = false;
    this.substate = 'mainOverview';
  }

  private handleOverviewBack(): void {
    this.callbacks.onBackFromMainOperationOverview?.();

    this.overviewScreenHost?.destroy();
    this.overviewScreenHost = null;
    this.overviewChildHost.hidden = true;

    this.entryScreenHost = this.createEntryScreenHost();
    this.entryScreenHost.show();
    this.entryChildHost.hidden = false;
    this.fixedChildHost.hidden = true;
    this.substate = 'mainEntry';
  }

  private handleEntryBack(): void {
    this.overviewScreenHost?.destroy();
    this.overviewScreenHost = null;
    this.overviewChildHost.hidden = true;
    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.entryChildHost.hidden = true;
    this.fixedChildHost.hidden = false;

    const currentStageId = this.callbacks.getCurrentStageId();
    const clearedStageIds = this.callbacks.getClearedStageIds?.() ?? [];
    this.panel = this.createStageSelectionPanel(currentStageId, clearedStageIds);
    this.substate = 'fixedStages';
  }
}
