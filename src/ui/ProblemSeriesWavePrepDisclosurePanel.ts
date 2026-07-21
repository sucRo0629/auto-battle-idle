import type { ProblemSeriesOverviewEnemyGroupDisplay } from './problemSeriesOverviewViewModel.ts';
import type {
  ProblemSeriesWavePrepDisclosureDisplay,
  ProblemSeriesWavePrepEnemyChangeDisplay,
} from './problemSeriesWavePrepDisclosureViewModel.ts';
import type { ProblemSeriesOverviewWaveDisplay } from './problemSeriesOverviewViewModel.ts';

export class ProblemSeriesWavePrepDisclosurePanel {
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    display: ProblemSeriesWavePrepDisclosureDisplay,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'problem-series-wave-prep-disclosure';

    this.root.appendChild(this.createConditionsSection(display.operationConditions));
    this.root.appendChild(this.createNextWaveSection(display.nextWave));
    this.root.appendChild(this.createChangesSection(display.enemyChanges));
    this.root.appendChild(this.createRemainingSection(display.remainingWaves));

    host.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private createConditionsSection(
    operationConditions: readonly string[],
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'problem-series-wave-prep-disclosure__conditions';

    const heading = document.createElement('h2');
    heading.textContent = '作戦固有条件';
    section.appendChild(heading);

    if (operationConditions.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = 'なし';
      section.appendChild(emptyEl);
    } else {
      for (const condition of operationConditions) {
        const conditionEl = document.createElement('div');
        conditionEl.textContent = condition;
        section.appendChild(conditionEl);
      }
    }

    return section;
  }

  private createNextWaveSection(nextWave: ProblemSeriesOverviewWaveDisplay): HTMLElement {
    const section = document.createElement('section');
    section.className = 'problem-series-wave-prep-disclosure__next-wave';

    const heading = document.createElement('h2');
    heading.textContent = '次Waveの完全情報';
    section.appendChild(heading);

    section.appendChild(this.createWaveElement(nextWave));

    return section;
  }

  private createChangesSection(
    enemyChanges: readonly ProblemSeriesWavePrepEnemyChangeDisplay[],
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'problem-series-wave-prep-disclosure__changes';

    const heading = document.createElement('h2');
    heading.textContent = '前Waveからの変化';
    section.appendChild(heading);

    if (enemyChanges.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = '変更なし';
      section.appendChild(emptyEl);
    } else {
      for (const change of enemyChanges) {
        section.appendChild(this.createChangeElement(change));
      }
    }

    return section;
  }

  private createChangeElement(
    change: ProblemSeriesWavePrepEnemyChangeDisplay,
  ): HTMLElement {
    const changeEl = document.createElement('div');

    const classEl = document.createElement('div');
    classEl.textContent = change.classDisplayName;
    changeEl.appendChild(classEl);

    const previousLabel = document.createElement('div');
    previousLabel.textContent = '前Wave';
    changeEl.appendChild(previousLabel);

    if (change.previousGroups.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = 'なし';
      changeEl.appendChild(emptyEl);
    } else {
      for (const group of change.previousGroups) {
        changeEl.appendChild(this.createEnemyGroupElement(group));
      }
    }

    const nextLabel = document.createElement('div');
    nextLabel.textContent = '次Wave';
    changeEl.appendChild(nextLabel);

    if (change.nextGroups.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = 'なし';
      changeEl.appendChild(emptyEl);
    } else {
      for (const group of change.nextGroups) {
        changeEl.appendChild(this.createEnemyGroupElement(group));
      }
    }

    return changeEl;
  }

  private createRemainingSection(
    remainingWaves: readonly ProblemSeriesOverviewWaveDisplay[],
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'problem-series-wave-prep-disclosure__remaining';

    const heading = document.createElement('h2');
    heading.textContent = '残りWave概要';
    section.appendChild(heading);

    const subsequentWaves = remainingWaves.slice(1);

    if (subsequentWaves.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = '次Wave以降のWaveなし';
      section.appendChild(emptyEl);
    } else {
      for (const wave of subsequentWaves) {
        section.appendChild(this.createWaveElement(wave));
      }
    }

    return section;
  }

  private createWaveElement(wave: ProblemSeriesOverviewWaveDisplay): HTMLElement {
    const waveEl = document.createElement('div');
    waveEl.className = 'problem-series-wave-prep-disclosure__wave';

    const waveHeading = document.createElement('h3');
    waveHeading.textContent = `Wave ${wave.waveNumber}`;
    waveEl.appendChild(waveHeading);

    const grantEl = document.createElement('div');
    grantEl.textContent = `作戦ポイント付与予定: ${wave.prepResourceGrant}`;
    waveEl.appendChild(grantEl);

    for (const group of wave.enemyGroups) {
      waveEl.appendChild(this.createEnemyGroupElement(group));
    }

    return waveEl;
  }

  private createEnemyGroupElement(
    group: ProblemSeriesOverviewEnemyGroupDisplay,
  ): HTMLElement {
    const groupEl = document.createElement('div');
    groupEl.className = 'problem-series-wave-prep-disclosure__enemy-group';

    const classEl = document.createElement('div');
    classEl.textContent = group.classDisplayName;
    groupEl.appendChild(classEl);

    const countEl = document.createElement('div');
    countEl.textContent = `×${group.count}`;
    groupEl.appendChild(countEl);

    const moduleEl = document.createElement('div');
    moduleEl.textContent = `CombatModule: ${group.combatModuleDisplayName}`;
    groupEl.appendChild(moduleEl);

    if (group.scaleSummary !== '') {
      const scaleEl = document.createElement('div');
      scaleEl.className = 'problem-series-wave-prep-disclosure__scale';
      scaleEl.textContent = group.scaleSummary;
      groupEl.appendChild(scaleEl);
    }

    return groupEl;
  }
}
