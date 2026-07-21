import type { GameData } from '../battle/types.ts';
import { ProblemSeriesEntryScreenHost } from './ProblemSeriesEntryScreenHost.ts';
import { StageSelectionPanel } from '../ui/StageSelectionPanel.ts';

export interface StageSelectionScreenHostCallbacks {
  getCurrentStageId: () => string;
  getClearedStageIds?: () => readonly string[];
  onSortie: (stageId: string) => void;
  onOpenMainOperation?: () => void;
  onPrepareMainOperation?: (normalizedSeed: string) => void;
}

type StageSelectionSubstate = 'fixedStages' | 'mainEntry';

/** Mounts StageSelectionPanel on the stage-selection screen host (`stageSelectHost` / screen `'stageSelect'`). */
export class StageSelectionScreenHost {
  private panel: StageSelectionPanel | null = null;
  private entryScreenHost: ProblemSeriesEntryScreenHost | null = null;
  private substate: StageSelectionSubstate = 'fixedStages';
  private readonly fixedChildHost: HTMLElement;
  private readonly entryChildHost: HTMLElement;

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
  }

  show(): void {
    this.host.hidden = false;
    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.entryChildHost.hidden = true;
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

  destroy(): void {
    this.panel?.destroy();
    this.panel = null;
    this.entryScreenHost?.destroy();
    this.entryScreenHost = null;
    this.fixedChildHost.remove();
    this.entryChildHost.remove();
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
    this.panel?.destroy();
    this.panel = null;
    this.fixedChildHost.hidden = true;

    if (!this.entryScreenHost) {
      this.entryScreenHost = new ProblemSeriesEntryScreenHost(
        this.entryChildHost,
        {
          onPrepare: (normalizedSeed) => {
            this.callbacks.onPrepareMainOperation?.(normalizedSeed);
          },
          onBack: () => this.handleEntryBack(),
        },
      );
    }
    this.entryScreenHost.show();
    this.substate = 'mainEntry';
    this.callbacks.onOpenMainOperation?.();
  }

  private handleEntryBack(): void {
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
