import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import type { GameData } from '../battle/types.ts';
import { ProblemSeriesOverviewPanel } from '../ui/ProblemSeriesOverviewPanel.ts';
import { createProblemSeriesOverviewDisplayFromSnapshot } from '../ui/problemSeriesOverviewViewModel.ts';

export interface ProblemSeriesOverviewScreenHostCallbacks {
  getPreparedSnapshot: () => ProblemSeriesOperationStartSnapshot | null;
  onBack: () => void;
  onConfirm: () => void;
}

/** Mounts ProblemSeriesOverviewPanel on the problem-series overview screen host. */
export class ProblemSeriesOverviewScreenHost {
  private panel: ProblemSeriesOverviewPanel | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly gameData: Pick<GameData, 'classRegistry' | 'combatModuleRegistry'>,
    private readonly callbacks: ProblemSeriesOverviewScreenHostCallbacks,
  ) {}

  show(): void {
    const snapshot = this.callbacks.getPreparedSnapshot();
    if (snapshot === null) {
      throw new Error('problem series overview requires prepared snapshot');
    }

    this.panel?.destroy();
    const display = createProblemSeriesOverviewDisplayFromSnapshot(
      snapshot,
      this.gameData,
    );
    this.panel = new ProblemSeriesOverviewPanel(this.host, display, {
      onBack: () => this.callbacks.onBack(),
      onConfirm: () => this.callbacks.onConfirm(),
    });
    this.host.hidden = false;
  }

  hide(): void {
    this.host.hidden = true;
  }

  destroy(): void {
    this.panel?.destroy();
    this.panel = null;
  }
}
