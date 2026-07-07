import type { GameData, StageDef } from '../battle/types.ts';
import { readClassDisplayLabel } from './classDisplayName.ts';
import {
  formatEnemyGroupScaleSummary,
  resolveStageEnemyCompositionPreview,
} from './stageEnemyCompositionPreview.ts';

export const STAGE_DETAIL_FORMATION_HINT_CLASS = 'stage-detail-formation-hint';

export function appendStageFormationHintPlate(
  parent: HTMLElement,
  stage: StageDef,
): HTMLElement | null {
  const hint = stage.formationHintJa?.trim();
  if (!hint) return null;

  const plate = document.createElement('div');
  plate.className = `${STAGE_DETAIL_FORMATION_HINT_CLASS} game-panel-surface`;
  plate.textContent = hint;
  parent.appendChild(plate);
  return plate;
}

export function fillStageDetailEnemySection(
  host: HTMLElement,
  stage: StageDef,
  gameData: GameData,
): void {
  host.replaceChildren();

  const heading = document.createElement('h3');
  heading.className = 'stage-detail-enemy-heading';
  heading.textContent = '敵編成';
  host.appendChild(heading);

  const preview = resolveStageEnemyCompositionPreview(stage);
  const list = document.createElement('ul');
  list.className = 'stage-detail-enemy-list';

  if (preview.usesEnemyGroups) {
    for (const line of preview.enemyGroupLines) {
      const item = document.createElement('li');
      const preset = gameData.classRegistry[line.classId];
      const label = readClassDisplayLabel(preset, line.classId);
      item.textContent = `${label.displayName} ×${line.count}${formatEnemyGroupScaleSummary(line)}`;
      list.appendChild(item);
    }
  } else {
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
  }

  host.appendChild(list);
  appendStageFormationHintPlate(host, stage);
}
