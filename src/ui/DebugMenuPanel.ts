import '../styles/debug-menu.css';
import type { GameData, SaveGameState, StageDef } from '../battle/types.ts';
import { t } from '../i18n/t.ts';
import { resolvePlayerDisplayLevel } from '../progression/resolvePlayerDisplayLevel.ts';
import {
  formatEnemyGroupScaleSummary,
  resolveStageEnemyCompositionPreview,
} from './stageEnemyCompositionPreview.ts';

export interface DebugMenuControls {
  isVerifyMode: () => boolean;
  isBattleXDebugDisplayEnabled: () => boolean;
  onBattleXDebugDisplayChange: (enabled: boolean) => void;
  getSave: () => SaveGameState;
  getLoopStageId: () => string | null;
  getLoopWaveIndex: () => number | null;
  onLoopStageChange: (stageId: string | null) => void;
  onLoopWaveChange: (waveIndex: number | null) => void;
  onPlayerLevelChange: (level: number) => void;
  /** R6b: 中間 Wave 終了待機中のみ true */
  isAwaitingNextWave?: () => boolean;
  /** R6b: 次 Wave 開始（待機中のみ成功） */
  onStartNextWave?: () => boolean;
}

export class DebugMenuPanel {
  private readonly root: HTMLElement;
  private readonly rowsHost: HTMLElement;

  constructor(
    private readonly gameData: GameData,
    private readonly controls: DebugMenuControls,
    private readonly onRequestClose?: () => void,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'debug-menu';
    this.root.hidden = true;

    const header = document.createElement('div');
    header.className = 'debug-menu-header';

    const title = document.createElement('div');
    title.className = 'debug-menu-title';
    title.textContent = 'デバッグ';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'debug-menu-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', t('menu.close'));
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onRequestClose?.();
    });

    header.append(title, closeButton);

    this.rowsHost = document.createElement('div');
    this.rowsHost.className = 'debug-menu-rows';

    this.root.append(header, this.rowsHost);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.refresh();
  }

  refresh(): void {
    const verifyMode = this.controls.isVerifyMode();
    this.root.hidden = !verifyMode;
    if (!verifyMode) return;

    const save = this.controls.getSave();
    this.rowsHost.replaceChildren();

    this.rowsHost.append(this.createBattleXDebugToggleRow());

    const awaitingNextWave = this.controls.isAwaitingNextWave?.() ?? false;
    if (awaitingNextWave) {
      this.rowsHost.append(this.createStartNextWaveRow());
    }

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

      if (stage) {
        this.rowsHost.append(
          this.createStageCompositionInfoRow(
            stage,
            this.controls.getLoopWaveIndex(),
          ),
        );
      }
    }

    const playerLevel = resolvePlayerDisplayLevel(save.party);
    this.rowsHost.append(this.createPlayerLevelRow(playerLevel));
  }

  private createStageCompositionInfoRow(
    stage: StageDef,
    waveIndex: number | null,
  ): HTMLElement {
    const preview = resolveStageEnemyCompositionPreview(stage, waveIndex);
    const row = document.createElement('div');
    row.className = 'debug-menu-stage-info';

    const title = document.createElement('div');
    title.className = 'debug-menu-stage-info-title';
    title.textContent = 'ステージ編成';
    row.appendChild(title);

    const recommendedLevel = document.createElement('div');
    recommendedLevel.className = 'debug-menu-stage-info-line';
    recommendedLevel.textContent =
      preview.recommendedLevel === null
        ? '推奨 Lv: —'
        : `推奨 Lv: ${preview.recommendedLevel}`;
    row.appendChild(recommendedLevel);

    const source = document.createElement('div');
    source.className = 'debug-menu-stage-info-line';
    source.textContent = preview.usesEnemyGroups
      ? '編成: enemyGroups'
      : '編成: legacy waves';
    row.appendChild(source);

    const totalCount = document.createElement('div');
    totalCount.className = 'debug-menu-stage-info-line';
    totalCount.textContent = `総体数: ${preview.totalEnemyCount}`;
    row.appendChild(totalCount);

    if (preview.showLargePartyWarning) {
      const warning = document.createElement('div');
      warning.className = 'debug-menu-stage-info-warning';
      warning.textContent = '注意: 5体以上（入力は許容）';
      row.appendChild(warning);
    }

    if (preview.usesEnemyGroups) {
      const list = document.createElement('ul');
      list.className = 'debug-menu-stage-info-list';
      for (const line of preview.enemyGroupLines) {
        const item = document.createElement('li');
        item.textContent = `${line.classId} ×${line.count}${formatEnemyGroupScaleSummary(line)}`;
        list.appendChild(item);
      }
      row.appendChild(list);
    } else if (preview.legacyWaveLines.length > 0) {
      const list = document.createElement('ul');
      list.className = 'debug-menu-stage-info-list';
      for (const line of preview.legacyWaveLines) {
        const item = document.createElement('li');
        const waveLabel =
          preview.legacyWaveLines.length === 1
            ? ''
            : `Wave ${line.waveIndex + 1}: `;
        item.textContent =
          line.templateIds.length > 0
            ? `${waveLabel}${line.templateIds.join(', ')}`
            : `${waveLabel}(なし)`;
        list.appendChild(item);
      }
      row.appendChild(list);
    }

    return row;
  }

  private createStartNextWaveRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'debug-menu-start-next-wave-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-menu-start-next-wave-button';
    button.textContent = '次Wave開始';
    button.addEventListener('click', () => {
      const started = this.controls.onStartNextWave?.() ?? false;
      if (started) {
        this.refresh();
      }
    });

    row.appendChild(button);
    return row;
  }

  private createBattleXDebugToggleRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'debug-menu-toggle-row';

    const label = document.createElement('label');
    label.className = 'debug-menu-toggle-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'debug-menu-toggle-checkbox';
    checkbox.checked = this.controls.isBattleXDebugDisplayEnabled();
    checkbox.addEventListener('change', () => {
      this.controls.onBattleXDebugDisplayChange(checkbox.checked);
    });

    const text = document.createElement('span');
    text.textContent = 'BattleX debug';

    label.append(checkbox, text);
    row.appendChild(label);
    return row;
  }

  private createPlayerLevelRow(currentLevel: number): HTMLElement {
    const presetLevels = [1, 10, 20];
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

    const applyLevel = (level: number): void => {
      const clamped = Math.max(1, Math.min(99, Math.floor(level)));
      levelInput.value = String(clamped);
      if (clamped === currentLevel) return;
      this.controls.onPlayerLevelChange(clamped);
    };

    levelInput.addEventListener('change', () => {
      const parsed = Number.parseInt(levelInput.value, 10);
      if (Number.isNaN(parsed)) {
        levelInput.value = String(currentLevel);
        return;
      }
      applyLevel(parsed);
    });
    levelInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        levelInput.dispatchEvent(new Event('change'));
        levelInput.blur();
      }
    });

    const presetSelect = document.createElement('select');
    presetSelect.className = 'debug-menu-level-select';
    presetSelect.setAttribute('aria-label', 'プレイヤーレベル プリセット');

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = '—';
    presetSelect.appendChild(placeholderOption);

    for (const preset of presetLevels) {
      const option = document.createElement('option');
      option.value = String(preset);
      option.textContent = `Lv ${preset}`;
      presetSelect.appendChild(option);
    }

    presetSelect.value = presetLevels.includes(currentLevel)
      ? String(currentLevel)
      : '';

    presetSelect.addEventListener('change', () => {
      const selected = presetSelect.value;
      if (selected === '') return;
      applyLevel(Number.parseInt(selected, 10));
    });

    const decButton = document.createElement('button');
    decButton.type = 'button';
    decButton.className = 'debug-menu-level-button';
    decButton.textContent = '−';
    decButton.setAttribute('aria-label', 'プレイヤーレベルを下げる');
    decButton.addEventListener('click', () => {
      applyLevel(currentLevel - 1);
    });

    const incButton = document.createElement('button');
    incButton.type = 'button';
    incButton.className = 'debug-menu-level-button';
    incButton.textContent = '+';
    incButton.setAttribute('aria-label', 'プレイヤーレベルを上げる');
    incButton.addEventListener('click', () => {
      applyLevel(currentLevel + 1);
    });

    levelLabel.appendChild(levelInput);
    levelRow.append(levelLabel, presetSelect, decButton, incButton);
    return levelRow;
  }

  destroy(): void {
    this.root.remove();
  }
}
