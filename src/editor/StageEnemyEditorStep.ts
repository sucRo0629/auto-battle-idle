import type { StageDef, StageEnemyGroup } from '../battle/types.ts';
import { resolveStageEnemyCompositionPreview } from '../ui/stageEnemyCompositionPreview.ts';
import {
  createDefaultStageEnemyGroup,
  type StageDraft,
} from './editorApi.ts';
import {
  appendGrid,
  createActionButton,
  createButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSection,
  createSelect,
  preserveScrollDuring,
} from './formUtils.ts';

const SCALE_MIN = 0.01;
const DEFAULT_SCALE = 1;

type ScaleKey = 'hpScale' | 'atkScale' | 'defScale' | 'regScale';

const SCALE_FIELDS: { key: ScaleKey; label: string }[] = [
  { key: 'hpScale', label: 'hp' },
  { key: 'atkScale', label: 'attack' },
  { key: 'defScale', label: 'defense' },
  { key: 'regScale', label: 'regen' },
];

function resolveScale(value: number | undefined): number {
  return value ?? DEFAULT_SCALE;
}

function setOptionalScale(group: StageEnemyGroup, key: ScaleKey, value: number): void {
  if (value === DEFAULT_SCALE) {
    delete group[key];
  } else {
    group[key] = value;
  }
}

function parsePositiveScale(raw: string): number | null {
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  return Math.max(SCALE_MIN, parsed);
}

function parsePositiveInteger(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export interface StageEnemyEditorStepOptions {
  getDraft: () => StageDraft;
  stages: StageDef[];
  selectedStageId: string;
  classOptions: { id: string; label: string }[];
  onSelectStage: (stageId: string) => void;
  onDraftChange: (draft: StageDraft) => void;
  onSave: () => void;
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

  refresh(): void {
    this.render();
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.renderContent();
    });
  }

  private renderContent(): void {
    const {
      getDraft,
      stages,
      selectedStageId,
      classOptions,
      onSelectStage,
      onDraftChange,
      onSave,
      saving,
    } = this.options;
    const draft = getDraft();
    const editingEnemyGroups = draft.enemyGroups !== undefined;
    this.container.replaceChildren();

    const commitDraft = (mutate: (next: StageDraft) => void, rerender = false) => {
      const next = structuredClone(getDraft());
      mutate(next);
      onDraftChange(next);
      if (rerender) this.render();
    };

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', 'ステージ敵編成'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        'ステージの recommendedLevel と enemyGroups を編集します。legacy waves は参照のみです。',
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

    const composition = resolveStageEnemyCompositionPreview(draft as StageDef);
    const compositionSection = createSection('編成概要');
    this.container.appendChild(compositionSection);
    const compositionGrid = appendGrid(compositionSection);
    compositionGrid.appendChild(
      createFieldRow(
        '編成方式',
        createEl(
          'span',
          'editor-readonly-value',
          editingEnemyGroups
            ? 'enemyGroups（編集中）'
            : composition.usesEnemyGroups
              ? 'enemyGroups（新正本）'
              : 'legacy（waves / templateId）',
        ),
      ),
    );
    if (editingEnemyGroups || composition.usesEnemyGroups) {
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
          createEl(
            'span',
            'editor-readonly-value',
            String(
              editingEnemyGroups
                ? (draft.enemyGroups ?? []).reduce((sum, group) => sum + group.count, 0)
                : composition.totalEnemyCount,
            ),
          ),
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

    if (!editingEnemyGroups) {
      const legacySection = createSection('legacy waves（参照のみ）');
      this.container.appendChild(legacySection);
      const legacyGrid = appendGrid(legacySection);
      const waves = draft.waves ?? [];
      if (waves.length === 0) {
        legacyGrid.appendChild(
          createFieldRow(
            'waves',
            createEl('span', 'editor-readonly-value', '（なし）'),
          ),
        );
      } else {
        for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
          const wave = waves[waveIndex]!;
          const templateSummary =
            wave.enemies.length > 0
              ? wave.enemies.map((enemy) => enemy.templateId).join(', ')
              : '（なし）';
          legacyGrid.appendChild(
            createFieldRow(
              `wave ${waveIndex}`,
              createEl('span', 'editor-readonly-value', templateSummary),
            ),
          );
        }
      }

      const startActions = createEl('div', 'editor-actions');
      startActions.appendChild(
        createActionButton(
          'enemyGroups 編集を開始',
          'editor-btn',
          () => {
            commitDraft((next) => {
              next.enemyGroups = [];
            }, true);
          },
        ),
      );
      this.container.appendChild(startActions);
    } else {
      const editSection = createSection('enemyGroups 編集');
      this.container.appendChild(editSection);
      const editGrid = appendGrid(editSection);

      editGrid.appendChild(
        createFieldRow(
          'recommendedLevel',
          createNumberInput(
            draft.recommendedLevel ?? 1,
            (recommendedLevel) => {
              commitDraft((next) => {
                next.recommendedLevel = recommendedLevel;
              });
            },
            {
              min: 1,
              parseInput: parsePositiveInteger,
            },
          ),
        ),
      );

      const groups = draft.enemyGroups ?? [];
      if (groups.length === 0) {
        editGrid.appendChild(
          createFieldRow(
            'グループ',
            createEl('span', 'editor-readonly-value', '（未追加）'),
          ),
        );
      }

      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex]!;
        const groupSection = createSection(`グループ ${groupIndex + 1}`);
        editSection.appendChild(groupSection);
        const groupGrid = appendGrid(groupSection);

        const classSelectOptions = classOptions.map((option) => ({
          value: option.id,
          label: option.label,
        }));
        if (group.classId && !classSelectOptions.some((option) => option.value === group.classId)) {
          classSelectOptions.push({
            value: group.classId,
            label: group.classId,
          });
        }

        groupGrid.appendChild(
          createFieldRow(
            'classId',
            createSelect(group.classId, classSelectOptions, (classId) => {
              commitDraft((next) => {
                const target = next.enemyGroups?.[groupIndex];
                if (target) target.classId = classId;
              });
            }),
          ),
        );

        groupGrid.appendChild(
          createFieldRow(
            'count',
            createNumberInput(group.count, (count) => {
              commitDraft((next) => {
                const target = next.enemyGroups?.[groupIndex];
                if (target) target.count = count;
              });
            }, {
              min: 1,
              parseInput: parsePositiveInteger,
            }),
          ),
        );

        for (const scaleField of SCALE_FIELDS) {
          groupGrid.appendChild(
            createFieldRow(
              scaleField.label,
              createNumberInput(
                resolveScale(group[scaleField.key]),
                (value) => {
                  commitDraft((next) => {
                    const target = next.enemyGroups?.[groupIndex];
                    if (target) setOptionalScale(target, scaleField.key, value);
                  });
                },
                {
                  min: SCALE_MIN,
                  step: 0.01,
                  emptyWhen: DEFAULT_SCALE,
                  parseInput: parsePositiveScale,
                },
              ),
            ),
          );
        }

        const groupActions = createEl('div', 'editor-actions');
        groupActions.appendChild(
          createButton('グループを削除', 'editor-btn editor-btn-small', () => {
            commitDraft((next) => {
              next.enemyGroups = (next.enemyGroups ?? []).filter(
                (_, index) => index !== groupIndex,
              );
            }, true);
          }),
        );
        groupSection.appendChild(groupActions);
      }

      const addActions = createEl('div', 'editor-actions');
      addActions.appendChild(
        createButton('+ グループを追加', 'editor-btn editor-btn-small', () => {
          const defaultClassId = classOptions[0]?.id ?? '';
          commitDraft((next) => {
            const list = next.enemyGroups ?? [];
            list.push(createDefaultStageEnemyGroup(defaultClassId));
            next.enemyGroups = list;
          }, true);
        }),
      );
      editSection.appendChild(addActions);

      const hasLegacyTemplates = (draft.waves ?? []).some((wave) => wave.enemies.length > 0);
      if (hasLegacyTemplates) {
        const legacyRef = createSection('legacy waves（参照のみ・保存時は維持）');
        this.container.appendChild(legacyRef);
        const legacyRefGrid = appendGrid(legacyRef);
        for (let waveIndex = 0; waveIndex < (draft.waves ?? []).length; waveIndex += 1) {
          const wave = draft.waves![waveIndex]!;
          const templateSummary =
            wave.enemies.length > 0
              ? wave.enemies.map((enemy) => enemy.templateId).join(', ')
              : '（なし）';
          legacyRefGrid.appendChild(
            createFieldRow(
              `wave ${waveIndex}`,
              createEl('span', 'editor-readonly-value', templateSummary),
            ),
          );
        }
      }
    }

    const actions = createEl('div', 'editor-actions');
    const saveBtn = createActionButton(
      saving ? '保存中…' : '保存',
      'editor-btn editor-btn-primary',
      onSave,
    );
    saveBtn.disabled = Boolean(saving) || !selectedStageId;
    actions.appendChild(saveBtn);
    this.container.appendChild(actions);
  }
}
