import { ProblemSeriesEntryPanel } from '../ui/ProblemSeriesEntryPanel.ts';

export interface ProblemSeriesEntryScreenHostCallbacks {
  onPrepare: (normalizedSeed: string) => void;
  onBack?: () => void;
}

/** Mounts ProblemSeriesEntryPanel on the problem-series entry screen host. */
export class ProblemSeriesEntryScreenHost {
  private panel: ProblemSeriesEntryPanel | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ProblemSeriesEntryScreenHostCallbacks,
  ) {}

  show(): void {
    if (!this.panel) {
      this.panel = new ProblemSeriesEntryPanel(this.host, {
        onPrepare: (normalizedSeed) => this.callbacks.onPrepare(normalizedSeed),
        onBack: () => this.callbacks.onBack?.(),
      });
    }
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
