import type { GameData } from '../battle/types.ts';
import { StageSelectionPanel } from '../ui/StageSelectionPanel.ts';

export interface StageSelectionScreenHostCallbacks {
  getCurrentStageId: () => string;
  getClearedStageIds?: () => readonly string[];
  onSortie: (stageId: string) => void;
  onOpenMainOperation?: () => void;
}

/** Mounts StageSelectionPanel on the stage-selection screen host (`stageSelectHost` / screen `'stageSelect'`). */
export class StageSelectionScreenHost {
  private panel: StageSelectionPanel | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly gameData: GameData,
    private readonly callbacks: StageSelectionScreenHostCallbacks,
    private readonly showFirstPlayGuidance = false,
  ) {}

  show(): void {
    this.host.hidden = false;
    const currentStageId = this.callbacks.getCurrentStageId();
    const clearedStageIds = this.callbacks.getClearedStageIds?.() ?? [];
    if (!this.panel) {
      this.panel = new StageSelectionPanel(
        this.host,
        this.gameData,
        {
          onSortie: (stageId) => this.callbacks.onSortie(stageId),
          onOpenMainOperation: () =>
            this.callbacks.onOpenMainOperation?.(),
        },
        {
          initialStageId: currentStageId,
          showFirstPlayGuidance: this.showFirstPlayGuidance,
          clearedStageIds,
        },
      );
      return;
    }
    this.panel.setClearedStageIds(clearedStageIds);
    this.panel.selectStage(currentStageId);
  }

  hide(): void {
    this.host.hidden = true;
  }

  destroy(): void {
    this.panel?.destroy();
    this.panel = null;
  }
}
