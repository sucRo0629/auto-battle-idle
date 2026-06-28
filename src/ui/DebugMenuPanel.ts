import '../styles/debug-menu.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot, GameData, SaveGameState } from '../battle/types.ts';
import { resolvePlayerDisplayLevel } from '../progression/resolvePlayerDisplayLevel.ts';
import {
  PartyMemberStatsDisplay,
  type PartyMemberStatsDataSource,
  type PartyMemberStatsRowSpec,
} from './PartyMemberStatsDisplay.ts';

export interface DebugMenuControls {
  isVerifyMode: () => boolean;
  getSave: () => SaveGameState;
  getLoopStageId: () => string | null;
  getLoopWaveIndex: () => number | null;
  getAllySnapshots?: () => CombatantSnapshot[];
  getStageDamageDisplayRows?: () => StageDamageDisplayRow[];
  onLoopStageChange: (stageId: string | null) => void;
  onLoopWaveChange: (waveIndex: number | null) => void;
  onPlayerLevelChange: (level: number) => void;
}

export class DebugMenuPanel {
  private readonly root: HTMLElement;
  private readonly rowsHost: HTMLElement;
  private readonly statsHost: HTMLElement;
  private readonly statsDisplay: PartyMemberStatsDisplay;
  private readonly dataSource: PartyMemberStatsDataSource;

  constructor(
    private readonly gameData: GameData,
    private readonly controls: DebugMenuControls,
  ) {
    this.dataSource = {
      getDisplayRows: () => this.controls.getStageDamageDisplayRows?.() ?? [],
      getAllySnapshots: () => this.controls.getAllySnapshots?.() ?? [],
    };

    this.root = document.createElement('aside');
    this.root.className = 'debug-menu';
    this.root.hidden = true;

    const title = document.createElement('div');
    title.className = 'debug-menu-title';
    title.textContent = 'デバッグ';

    this.rowsHost = document.createElement('div');
    this.rowsHost.className = 'debug-menu-rows';

    this.statsHost = document.createElement('div');
    this.statsDisplay = new PartyMemberStatsDisplay(this.statsHost, {
      listClass: 'party-stats-rows debug-menu-stats-rows',
    });

    this.root.append(title, this.rowsHost);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.refresh();
  }

  updateDamageDisplay(): void {
    this.updateStatsDisplay();
  }

  updateThreatDisplay(): void {
    this.updateStatsDisplay();
  }

  updateExpDisplay(): void {
    this.updateStatsDisplay();
  }

  updateStatsDisplay(): void {
    if (!this.controls.isVerifyMode()) return;
    this.statsDisplay.update(this.dataSource);
  }

  refresh(): void {
    const verifyMode = this.controls.isVerifyMode();
    this.root.hidden = !verifyMode;
    if (!verifyMode) return;

    const save = this.controls.getSave();
    this.rowsHost.replaceChildren();
    this.statsDisplay.clear();

    const stageRow = document.createElement('div');
    stageRow.className = 'debug-menu-stage-row';

    const stageLabel = document.createElement('label');
    stageLabel.className = 'debug-menu-stage-label';
    stageLabel.textContent = '周回ステージ';

    const stageSelect = document.createElement('select');
    stageSelect.className = 'debug-menu-stage-select';

    const normalOption = document.createElement('option');
    normalOption.value = '';
    normalOption.textContent = '通常進行';
    stageSelect.appendChild(normalOption);

    for (const stage of this.gameData.stages) {
      const option = document.createElement('option');
      option.value = stage.id;
      option.textContent = stage.displayName;
      stageSelect.appendChild(option);
    }

    const loopStageId = this.controls.getLoopStageId();
    stageSelect.value = loopStageId ?? '';

    stageSelect.addEventListener('change', () => {
      const selected = stageSelect.value;
      this.controls.onLoopStageChange(selected === '' ? null : selected);
    });

    stageLabel.appendChild(stageSelect);
    stageRow.appendChild(stageLabel);
    this.rowsHost.append(stageRow);

    if (loopStageId !== null) {
      const stage = this.gameData.stages.find((s) => s.id === loopStageId);
      const waveCount = stage?.waves.length ?? 0;

      if (waveCount > 0) {
        const waveRow = document.createElement('div');
        waveRow.className = 'debug-menu-stage-row';

        const waveLabel = document.createElement('label');
        waveLabel.className = 'debug-menu-stage-label';
        waveLabel.textContent = '周回Wave';

        const waveSelect = document.createElement('select');
        waveSelect.className = 'debug-menu-stage-select';

        const allWavesOption = document.createElement('option');
        allWavesOption.value = '';
        allWavesOption.textContent = '全Wave';
        waveSelect.appendChild(allWavesOption);

        for (let waveIndex = 0; waveIndex < waveCount; waveIndex++) {
          const option = document.createElement('option');
          option.value = String(waveIndex);
          option.textContent = `Wave ${waveIndex + 1}`;
          waveSelect.appendChild(option);
        }

        const loopWaveIndex = this.controls.getLoopWaveIndex();
        waveSelect.value =
          loopWaveIndex !== null && loopWaveIndex < waveCount
            ? String(loopWaveIndex)
            : '';

        waveSelect.addEventListener('change', () => {
          const selected = waveSelect.value;
          this.controls.onLoopWaveChange(
            selected === '' ? null : Number.parseInt(selected, 10),
          );
        });

        waveLabel.appendChild(waveSelect);
        waveRow.appendChild(waveLabel);
        this.rowsHost.append(waveRow);
      }
    }

    const playerLevel = resolvePlayerDisplayLevel(save.party);
    this.rowsHost.append(this.createPlayerLevelRow(playerLevel), this.statsHost);

    const specs: PartyMemberStatsRowSpec[] = [];
    save.party.forEach((member, partyIndex) => {
      if (!member) return;
      const preset = this.gameData.classRegistry[member.classId];
      specs.push({
        slotIndex: partyIndex,
        displayName: preset?.displayName ?? member.classId,
      });
    });

    this.statsDisplay.rebuild(specs);
    this.statsDisplay.update(this.dataSource);
  }

  private createPlayerLevelRow(currentLevel: number): HTMLElement {
    const levelRow = document.createElement('div');
    levelRow.className = 'debug-menu-level-row';

    const levelLabel = document.createElement('label');
    levelLabel.className = 'debug-menu-level-label';
    levelLabel.textContent = 'プレイヤー Lv';

    const levelInput = document.createElement('input');
    levelInput.type = 'number';
    levelInput.className = 'debug-menu-level-input';
    levelInput.min = '1';
    levelInput.max = '99';
    levelInput.step = '1';
    levelInput.value = String(currentLevel);

    const applyLevel = (): void => {
      const parsed = Number.parseInt(levelInput.value, 10);
      if (Number.isNaN(parsed)) {
        levelInput.value = String(currentLevel);
        return;
      }
      const clamped = Math.max(1, Math.min(99, parsed));
      levelInput.value = String(clamped);
      if (clamped === currentLevel) return;
      this.controls.onPlayerLevelChange(clamped);
    };

    levelInput.addEventListener('change', applyLevel);
    levelInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyLevel();
        levelInput.blur();
      }
    });

    const decButton = document.createElement('button');
    decButton.type = 'button';
    decButton.className = 'debug-menu-level-button';
    decButton.textContent = '−';
    decButton.setAttribute('aria-label', 'プレイヤーレベルを下げる');
    decButton.addEventListener('click', () => {
      this.controls.onPlayerLevelChange(Math.max(1, currentLevel - 1));
    });

    const incButton = document.createElement('button');
    incButton.type = 'button';
    incButton.className = 'debug-menu-level-button';
    incButton.textContent = '+';
    incButton.setAttribute('aria-label', 'プレイヤーレベルを上げる');
    incButton.addEventListener('click', () => {
      this.controls.onPlayerLevelChange(Math.min(99, currentLevel + 1));
    });

    levelLabel.appendChild(levelInput);
    levelRow.append(levelLabel, decButton, incButton);
    return levelRow;
  }

  destroy(): void {
    this.statsDisplay.destroy();
    this.root.remove();
  }
}
