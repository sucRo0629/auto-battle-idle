import type { ProblemSeriesOverviewDisplay } from './problemSeriesOverviewViewModel.ts';

export interface ProblemSeriesOverviewPanelCallbacks {
  onBack?: () => void;
  onConfirm?: () => void;
}

export class ProblemSeriesOverviewPanel {
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    display: ProblemSeriesOverviewDisplay,
    callbacks: ProblemSeriesOverviewPanelCallbacks = {},
  ) {
    this.root = document.createElement('div');
    this.root.className = 'problem-series-overview-panel';

    const title = document.createElement('h1');
    title.textContent = '作戦概要';
    this.root.appendChild(title);

    const seedEl = document.createElement('div');
    seedEl.className = 'problem-series-overview-seed';
    seedEl.textContent = `seed: ${display.seed}`;
    this.root.appendChild(seedEl);

    this.root.appendChild(this.createConditionsSection(display.operationConditions));

    const waveAdjustmentNote = document.createElement('div');
    waveAdjustmentNote.className = 'problem-series-overview-wave-adjustment-note';
    waveAdjustmentNote.textContent =
      'Wave間準備では、編成・CombatModule・作戦内パッシブを変更できます。';
    this.root.appendChild(waveAdjustmentNote);

    const wavesEl = document.createElement('div');
    wavesEl.className = 'problem-series-overview-waves';

    for (const wave of display.waves) {
      const waveEl = document.createElement('div');
      waveEl.className = 'problem-series-overview-wave';

      const waveHeading = document.createElement('h2');
      waveHeading.textContent = `Wave ${wave.waveNumber}`;
      waveEl.appendChild(waveHeading);

      const grantEl = document.createElement('div');
      grantEl.className = 'problem-series-overview-wave-grant';
      grantEl.textContent = `作戦ポイント付与予定: ${wave.prepResourceGrant}`;
      waveEl.appendChild(grantEl);

      const groupsEl = document.createElement('div');
      groupsEl.className = 'problem-series-overview-enemy-groups';

      for (const group of wave.enemyGroups) {
        const groupEl = document.createElement('div');
        groupEl.className = 'problem-series-overview-enemy-group';

        const classEl = document.createElement('div');
        classEl.className = 'problem-series-overview-enemy-class';
        classEl.textContent = group.classDisplayName;
        groupEl.appendChild(classEl);

        const countEl = document.createElement('div');
        countEl.className = 'problem-series-overview-enemy-count';
        countEl.textContent = `×${group.count}`;
        groupEl.appendChild(countEl);

        const moduleEl = document.createElement('div');
        moduleEl.className = 'problem-series-overview-enemy-module';
        moduleEl.textContent = `CombatModule: ${group.combatModuleDisplayName}`;
        groupEl.appendChild(moduleEl);

        if (group.scaleSummary !== '') {
          const scaleEl = document.createElement('div');
          scaleEl.className = 'problem-series-overview-enemy-scale';
          scaleEl.textContent = group.scaleSummary;
          groupEl.appendChild(scaleEl);
        }

        groupsEl.appendChild(groupEl);
      }

      waveEl.appendChild(groupsEl);
      wavesEl.appendChild(waveEl);
    }

    this.root.appendChild(wavesEl);

    const actions = document.createElement('div');
    actions.className = 'problem-series-overview-actions';

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'problem-series-overview-back';
    backButton.textContent = '戻る';
    backButton.addEventListener('click', () => callbacks.onBack?.());

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'problem-series-overview-confirm';
    confirmButton.textContent = '初期準備へ';
    confirmButton.addEventListener('click', () => callbacks.onConfirm?.());

    actions.append(backButton, confirmButton);
    this.root.appendChild(actions);

    host.appendChild(this.root);
  }

  private createConditionsSection(
    operationConditions: readonly string[],
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'problem-series-overview-conditions';

    const heading = document.createElement('h2');
    heading.textContent = '作戦固有条件';
    section.appendChild(heading);

    if (operationConditions.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'problem-series-overview-conditions-empty';
      emptyEl.textContent = 'なし';
      section.appendChild(emptyEl);
    } else {
      for (const condition of operationConditions) {
        const conditionEl = document.createElement('div');
        conditionEl.className = 'problem-series-overview-condition';
        conditionEl.textContent = condition;
        section.appendChild(conditionEl);
      }
    }

    return section;
  }

  destroy(): void {
    this.root.remove();
  }
}
