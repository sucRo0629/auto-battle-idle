import type { GameData } from '../battle/types.ts';
import { StageSelectionPanel } from '../ui/StageSelectionPanel.ts';

export interface StageSelectionScreenHostCallbacks {
  getCurrentStageId: () => string;
  onSortie: (stageId: string) => void;
}

/** Mounts StageSelectionPanel on the stage-selection screen host (internal: mapHost / screen `'map'`). */
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
    if (!this.panel) {
      this.panel = new StageSelectionPanel(
        this.host,
        this.gameData,
        { onSortie: (stageId) => this.callbacks.onSortie(stageId) },
        {
          initialStageId: currentStageId,
          showFirstPlayGuidance: this.showFirstPlayGuidance,
        },
      );
      return;
    }
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
