import {
  DAMAGE_TYPE_OPTIONS,
  REG_OPTIONS,
  VFX_PRESET_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import type {
  DamageType,
  EnemyTemplate,
  SkillVfxPresetId,
} from '../battle/types.ts';
import {
  CONFIGURABLE_RANGE_PX_MAX,
  configurableRangeHintJa,
} from '../battle/rangeLimits.ts';
import {
  createEmptyEnemyDraft,
  enemyDraftFromTemplate,
  type EnemyDraft,
  type DraftChangeOptions,
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
  createTextInput,
  preserveScrollDuring,
} from './formUtils.ts';

export interface EnemyEditorStepOptions {
  getDraft: () => EnemyDraft;
  enemies: EnemyTemplate[];
  selectedEnemyId: string;
  onDraftChange: (draft: EnemyDraft, options?: DraftChangeOptions) => void;
  onSelectEnemy: (enemyId: string) => void;
  onSave: () => void;
  saving?: boolean;
  hidePicker?: boolean;
  hideSkillIds?: boolean;
  hideSave?: boolean;
}

export class EnemyEditorStep {
  constructor(
    private container: HTMLElement,
    private options: EnemyEditorStepOptions,
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
    const {
      getDraft,
      enemies,
      selectedEnemyId,
      onDraftChange,
      onSelectEnemy,
      onSave,
      saving,
      hidePicker,
      hideSkillIds,
      hideSave,
    } = this.options;
    const draft = getDraft();
    this.container.replaceChildren();

    const commitDraft = (
      mutate: (next: EnemyDraft) => void,
      options?: DraftChangeOptions,
    ) => {
      const next = structuredClone(getDraft());
      mutate(next);
      onDraftChange(next);
      if (options?.rerender) {
        this.render();
      }
    };

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', '敵テンプレート'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        hideSkillIds
          ? 'ステータス等を編集します。通常攻撃枠はスキル定義に常に含まれます。enemyId 変更時は通常攻撃 ID のみ同期されます。'
          : '敵テンプレートとパッシブ / アクティブスキル ID を編集します。',
      ),
    );
    this.container.appendChild(header);

    if (!hidePicker) {
      const picker = createEl('div', 'editor-picker');
    const select = createEl('select', 'editor-select') as HTMLSelectElement;
    const emptyOpt = createEl('option') as HTMLOptionElement;
    emptyOpt.value = '';
    emptyOpt.textContent = '— 選択 —';
    select.appendChild(emptyOpt);
    for (const enemy of enemies) {
      const opt = createEl('option') as HTMLOptionElement;
      opt.value = enemy.id;
      opt.textContent = `${enemy.displayName} (${enemy.id})`;
      if (enemy.id === selectedEnemyId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      if (select.value) onSelectEnemy(select.value);
    });
    picker.appendChild(createEl('span', 'editor-picker-label', '既存の敵'));
    picker.appendChild(select);
    this.container.appendChild(picker);
    }

    const identity = createSection('基本');
    this.container.appendChild(identity);
    const identityGrid = appendGrid(identity);
    if (!hidePicker || hideSkillIds) {
      identityGrid.appendChild(
        createFieldRow(
          'enemyId',
          createTextInput(draft.enemy.id, (id) => {
            commitDraft((next) => {
              next.enemy.id = id;
            });
          }),
        ),
      );
      identityGrid.appendChild(
        createFieldRow(
          '表示名',
          createTextInput(draft.enemy.displayName, (displayName) => {
            commitDraft((next) => {
              next.enemy.displayName = displayName;
            });
          }),
        ),
      );
    }
    const statsSection = createSection('ステータス');
    this.container.appendChild(statsSection);
    const statsGrid = appendGrid(statsSection);
    statsGrid.appendChild(
      createFieldRow(
        'maxHp',
        createNumberInput(draft.enemy.maxHp, (maxHp) => {
          commitDraft((next) => {
            next.enemy.maxHp = maxHp;
          });
        }),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        'atk',
        createNumberInput(draft.enemy.atk, (atk) => {
          commitDraft((next) => {
            next.enemy.atk = atk;
          });
        }),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        'def',
        createNumberInput(draft.enemy.def, (def) => {
          commitDraft((next) => {
            next.enemy.def = def;
          });
        }),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        'reg',
        createSelect(
          draft.enemy.reg,
          REG_OPTIONS.map((value) => ({ value, label: String(value) })),
          (reg) => {
            commitDraft((next) => {
              next.enemy.reg = reg;
            });
          },
        ),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        'exp',
        createNumberInput(draft.enemy.exp, (exp) => {
          commitDraft((next) => {
            next.enemy.exp = exp;
          });
        }),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        '射程 (px)',
        createNumberInput(
          draft.enemy.traits?.rangePx ?? 0,
          (rangePx) => {
            commitDraft((next) => {
              if (!next.enemy.traits) next.enemy.traits = {};
              next.enemy.traits.rangePx = rangePx;
            });
          },
          { min: 0, max: CONFIGURABLE_RANGE_PX_MAX, step: 1 },
        ),
      ),
    );
    statsGrid.appendChild(
      createEl('p', 'editor-hint', configurableRangeHintJa()),
    );
    statsGrid.appendChild(
      createFieldRow(
        'ダメージ種',
        createSelect(
          draft.enemy.traits?.damageType ?? 'physical',
          DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
          (damageType: DamageType) => {
            commitDraft((next) => {
              if (!next.enemy.traits) next.enemy.traits = {};
              next.enemy.traits.damageType = damageType;
            });
          },
        ),
      ),
    );
    statsGrid.appendChild(
      createFieldRow(
        '通常攻撃 VFX',
        createSelect(
          draft.enemy.traits?.basicAttackVfx?.preset ?? '',
          [
            { value: '', label: '（traits から自動）' },
            ...VFX_PRESET_OPTIONS.map((value) => ({ value, label: value })),
          ],
          (preset) => {
            commitDraft((next) => {
              if (!next.enemy.traits) next.enemy.traits = {};
              if (!preset) {
                delete next.enemy.traits.basicAttackVfx;
                return;
              }
              next.enemy.traits.basicAttackVfx = {
                preset: preset as SkillVfxPresetId,
                ...(preset === 'arrow' ? { arc: true } : {}),
              };
            });
          },
        ),
      ),
    );

    if (!hideSkillIds) {
      const passiveSection = createSection('パッシブスキル ID');
      this.container.appendChild(passiveSection);
      this.renderIdRows(passiveSection, 'passiveIds', getDraft, commitDraft);

      const activeSection = createSection('アクティブスキル ID');
      this.container.appendChild(activeSection);
      this.renderIdRows(activeSection, 'activeIds', getDraft, commitDraft);
    }

    if (!hideSave) {
      const actions = createEl('div', 'editor-actions');
      const saveBtn = createActionButton(
        saving ? '保存中…' : '保存',
        'editor-btn editor-btn-primary',
        onSave,
      );
      saveBtn.disabled = Boolean(saving);
      actions.appendChild(saveBtn);
      this.container.appendChild(actions);
    }
  }

  private renderIdRows(
    parent: HTMLElement,
    key: 'passiveIds' | 'activeIds',
    getDraft: () => EnemyDraft,
    commitDraft: (mutate: (next: EnemyDraft) => void, options?: DraftChangeOptions) => void,
  ): void {
    const ids = getDraft()[key];
    ids.forEach((value, index) => {
      const row = createEl('div', 'editor-id-row');
      row.appendChild(
        createTextInput(value, (skillId) => {
          commitDraft((next) => {
            next[key][index] = skillId;
          });
        }),
      );
      if (ids.length > 1) {
        row.appendChild(
          createButton('削除', 'editor-btn editor-btn-small', () => {
            commitDraft(
              (next) => {
                next[key] = next[key].filter((_, i) => i !== index);
              },
              { rerender: true },
            );
          }),
        );
      }
      parent.appendChild(row);
    });
    parent.appendChild(
      createButton('+ 追加', 'editor-btn editor-btn-small', () => {
        commitDraft(
          (next) => {
            next[key].push('');
          },
          { rerender: true },
        );
      }),
    );
  }
}

export function loadEnemyDraftById(
  enemies: EnemyTemplate[],
  enemyId: string,
): EnemyDraft {
  const template = enemies.find((enemy) => enemy.id === enemyId);
  return template ? enemyDraftFromTemplate(template) : createEmptyEnemyDraft();
}
