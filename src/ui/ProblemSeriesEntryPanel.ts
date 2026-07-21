import { normalizeProblemSeriesSeed } from '../battle/problemSeries/seedResolve.ts';

export interface ProblemSeriesEntryPanelCallbacks {
  onPrepare?: (normalizedSeed: string) => void;
}

export class ProblemSeriesEntryPanel {
  private readonly root: HTMLElement;
  private readonly seedInput: HTMLInputElement;
  private readonly errorEl: HTMLElement;
  private readonly prepareButton: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly callbacks: ProblemSeriesEntryPanelCallbacks = {},
  ) {
    this.root = document.createElement('div');
    this.root.className = 'problem-series-entry-panel';

    const title = document.createElement('h1');
    title.textContent = 'メイン攻略';
    this.root.appendChild(title);

    const seedInputId = 'problem-series-entry-seed-input';

    const label = document.createElement('label');
    label.className = 'problem-series-entry-seed-label';
    label.htmlFor = seedInputId;
    label.textContent = 'seed';
    this.root.appendChild(label);

    this.seedInput = document.createElement('input');
    this.seedInput.type = 'text';
    this.seedInput.id = seedInputId;
    this.seedInput.className = 'problem-series-entry-seed-input';
    this.seedInput.value = '';
    this.seedInput.autocomplete = 'off';
    this.seedInput.addEventListener('input', () => this.validateFromInput());
    this.root.appendChild(this.seedInput);

    this.errorEl = document.createElement('div');
    this.errorEl.className = 'problem-series-entry-seed-error';
    this.errorEl.textContent = 'seedを入力してください';
    this.root.appendChild(this.errorEl);

    this.prepareButton = document.createElement('button');
    this.prepareButton.type = 'button';
    this.prepareButton.className = 'problem-series-entry-prepare';
    this.prepareButton.textContent = '新しい作戦';
    this.prepareButton.disabled = true;
    this.prepareButton.addEventListener('click', () => this.handlePrepareClick());
    this.root.appendChild(this.prepareButton);

    host.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private validateFromInput(): void {
    try {
      normalizeProblemSeriesSeed(this.seedInput.value);
      this.prepareButton.disabled = false;
      this.errorEl.textContent = '';
    } catch {
      this.prepareButton.disabled = true;
      this.errorEl.textContent = 'seedを入力してください';
    }
  }

  private handlePrepareClick(): void {
    try {
      const normalizedSeed = normalizeProblemSeriesSeed(this.seedInput.value);
      this.prepareButton.disabled = false;
      this.errorEl.textContent = '';
      this.callbacks.onPrepare?.(normalizedSeed);
    } catch {
      this.prepareButton.disabled = true;
      this.errorEl.textContent = 'seedを入力してください';
    }
  }
}
