import type { StageDef } from '../battle/types.ts';
import { resolveStageEnemyCompositionPreview } from '../ui/stageEnemyCompositionPreview.ts';
import { type StageDraft } from './editorApi.ts';
import {
  appendGrid,
  createActionButton,
  createEl,
  createFieldRow,
  createSection,
  preserveScrollDuring,
} from './formUtils.ts';

export interface StageEnemyEditorStepOptions {
  getDraft: () => StageDraft;
  stages: StageDef[];
  selectedStageId: string;
  onSelectStage: (stageId: string) => void;
  saving?: boolean;
}

export class StageEnemyEditorStep {
  constructor(
    private container: HTMLElement,
    private options: StageEnemyEditorStepOptions,
  ) {
    this.render();
  }

  destroy(): void {
    this.container.replaceChildren();
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.renderContent();
    });
  }

  private renderContent(): void {
    const { getDraft, stages, selectedStageId, onSelectStage, saving } = this.options;
    const draft = getDraft();
    this.container.replaceChildren();

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', 'ステージ敵編成'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        'ステージ一覧と編成概要を表示します。編集・保存は後続フェーズで実装します。',
      ),
    );
    this.container.appendChild(header);

    const picker = createEl('div', 'editor-picker');
    const select = createEl('select', 'editor-select') as HTMLSelectElement;
    const emptyOpt = createEl('option') as HTMLOptionElement;
    emptyOpt.value = '';
    emptyOpt.textContent = '— 選択 —';
    select.appendChild(emptyOpt);
    for (const stage of stages) {
      const opt = createEl('option') as HTMLOptionElement;
      opt.value = stage.id;
      opt.textContent = `${stage.displayName} (${stage.id})`;
      if (stage.id === selectedStageId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      if (select.value) onSelectStage(select.value);
    });
    picker.appendChild(createEl('span', 'editor-picker-label', '既存ステージ'));
    picker.appendChild(select);
    this.container.appendChild(picker);

    const identity = createSection('概要');
    this.container.appendChild(identity);
    const identityGrid = appendGrid(identity);
    identityGrid.appendChild(
      createFieldRow(
        'stageId',
        createEl('span', 'editor-readonly-value', draft.id || '—'),
      ),
    );
    identityGrid.appendChild(
      createFieldRow(
        '表示名',
        createEl('span', 'editor-readonly-value', draft.displayName || '—'),
      ),
    );
    identityGrid.appendChild(
      createFieldRow(
        'recommendedLevel',
        createEl(
          'span',
          'editor-readonly-value',
          draft.recommendedLevel !== undefined ? String(draft.recommendedLevel) : '—',
        ),
      ),
    );

    const composition = resolveStageEnemyCompositionPreview(draft as StageDef);
    const compositionSection = createSection('敵編成');
    this.container.appendChild(compositionSection);
    const compositionGrid = appendGrid(compositionSection);
    compositionGrid.appendChild(
      createFieldRow(
        '編成方式',
        createEl(
          'span',
          'editor-readonly-value',
          composition.usesEnemyGroups ? 'enemyGroups（新正本）' : 'legacy（waves / templateId）',
        ),
      ),
    );

    if (composition.usesEnemyGroups) {
      const groupCount = draft.enemyGroups?.length ?? 0;
      compositionGrid.appendChild(
        createFieldRow(
          'グループ数',
          createEl('span', 'editor-readonly-value', String(groupCount)),
        ),
      );
      compositionGrid.appendChild(
        createFieldRow(
          '総体数',
          createEl('span', 'editor-readonly-value', String(composition.totalEnemyCount)),
        ),
      );
    } else {
      const waveCount = draft.waves?.length ?? 0;
      compositionGrid.appendChild(
        createFieldRow(
          'waves 数',
          createEl('span', 'editor-readonly-value', String(waveCount)),
        ),
      );
      for (const line of composition.legacyWaveLines) {
        const templateSummary =
          line.templateIds.length > 0 ? line.templateIds.join(', ') : '（なし）';
        compositionGrid.appendChild(
          createFieldRow(
            `wave ${line.waveIndex}`,
            createEl('span', 'editor-readonly-value', templateSummary),
          ),
        );
      }
    }

    const actions = createEl('div', 'editor-actions');
    const saveBtn = createActionButton(
      '保存（未実装）',
      'editor-btn editor-btn-primary',
      () => {},
    );
    saveBtn.disabled = true;
    if (saving) saveBtn.disabled = true;
    actions.appendChild(saveBtn);
    this.container.appendChild(actions);
  }
}
