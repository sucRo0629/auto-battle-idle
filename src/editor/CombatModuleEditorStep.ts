import { synthesizeCombatModuleSkill } from '../battle/data/synthesizeCombatModuleSkill.ts';
import type {
  AttackMethod,
  ClassPreset,
  CombatModuleActionDef,
  CombatModuleDef,
  TargetSpec,
} from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import { formatActiveDescription } from '../ui/formatSkillText.ts';
import {
  COMBAT_MODULE_ATTACK_METHOD_OPTIONS,
  findCombatModuleDraft,
  listCombatModuleAuthoringClassIds,
  listCombatModulesForClass,
  patchCombatModuleAction,
  summarizeCombatModuleEffectRange,
  upsertCombatModuleDraft,
} from './combatModuleEditor.ts';
import { appendSkillEffectTargetingFields } from './effectTargetingFields.ts';
import {
  appendTargetSpecFields,
  targetSpecForPierceShape,
} from './skillEditorCombatFields.ts';
import {
  appendGrid,
  createActionButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSection,
  createSelect,
  createTextarea,
  createTextInput,
  preserveScrollDuring,
} from './formUtils.ts';

export interface CombatModuleEditorStepOptions {
  getDraft: () => CombatModuleDef[];
  classRegistry: Record<string, ClassPreset>;
  onDraftChange: (draft: CombatModuleDef[]) => void;
  onSave: () => void;
  saving: boolean;
}

function defaultModuleActionTarget(
  action: CombatModuleActionDef,
): TargetSpec {
  if (action.target) {
    return action.target as TargetSpec;
  }
  return {
    kind: 'distance',
    side: 'enemy',
    order: 'nearest',
  };
}

export class CombatModuleEditorStep {
  private readonly host: HTMLElement;
  private readonly options: CombatModuleEditorStepOptions;
  private selectedClassId: string = R5_COMBAT_MODULE_CLASS_IDS[0];
  private selectedModuleId: string | null = null;

  constructor(host: HTMLElement, options: CombatModuleEditorStepOptions) {
    this.host = host;
    this.options = options;
    this.ensureSelection();
    this.render();
  }

  refresh(): void {
    this.ensureSelection();
    this.render();
  }

  destroy(): void {
    this.host.replaceChildren();
  }

  private ensureSelection(): void {
    const draft = this.options.getDraft();
    const classIds = listCombatModuleAuthoringClassIds(draft);
    if (!classIds.includes(this.selectedClassId)) {
      this.selectedClassId = classIds[0] ?? R5_COMBAT_MODULE_CLASS_IDS[0];
    }
    const classModules = listCombatModulesForClass(draft, this.selectedClassId);
    if (
      this.selectedModuleId === null ||
      !classModules.some((module) => module.id === this.selectedModuleId)
    ) {
      this.selectedModuleId = classModules[0]?.id ?? null;
    }
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.host.replaceChildren();
      this.host.appendChild(this.buildContent());
    });
  }

  private updateModule(
    mutate: (module: CombatModuleDef) => CombatModuleDef,
    options?: { rerender?: boolean },
  ): void {
    const draft = this.options.getDraft();
    const current = findCombatModuleDraft(draft, this.selectedModuleId ?? '');
    if (!current) return;
    const nextModule = mutate(structuredClone(current));
    this.options.onDraftChange(upsertCombatModuleDraft(draft, nextModule));
    if (options?.rerender !== false) {
      this.render();
    }
  }

  private buildContent(): HTMLElement {
    const draft = this.options.getDraft();
    const root = createEl('div', 'editor-combat-modules');

    root.appendChild(
      createEl(
        'p',
        'editor-help',
        '戦闘方式（CombatModule）の攻撃間隔・効果範囲を編集します。範囲形式は設計用語（単体 / 地点 / 範囲 / 周囲 / 前方）に寄せた表示で、保存時は既存の targetShape 等を維持します。',
      ),
    );

    const picker = createSection('方式の選択');
    const pickerGrid = appendGrid(picker);
    const classIds = listCombatModuleAuthoringClassIds(draft);
    pickerGrid.appendChild(
      createFieldRow(
        '兵科',
        createSelect(
          this.selectedClassId,
          classIds.map((classId) => {
            const preset = this.options.classRegistry[classId];
            return {
              value: classId,
              label: preset
                ? `${preset.displayName} (${classId})`
                : classId,
            };
          }),
          (classId) => {
            this.selectedClassId = classId;
            this.selectedModuleId = null;
            this.ensureSelection();
            this.render();
          },
        ),
      ),
    );

    const classModules = listCombatModulesForClass(draft, this.selectedClassId);
    pickerGrid.appendChild(
      createFieldRow(
        '戦闘方式',
        createSelect(
          this.selectedModuleId ?? '',
          classModules.map((module) => ({
            value: module.id,
            label: `${module.displayName} (${module.id})`,
          })),
          (moduleId) => {
            this.selectedModuleId = moduleId;
            this.render();
          },
        ),
      ),
    );
    root.appendChild(picker);

    const selected = findCombatModuleDraft(draft, this.selectedModuleId ?? '');
    if (!selected) {
      root.appendChild(
        createEl('p', 'editor-warning', '選択可能な戦闘方式がありません。'),
      );
      return root;
    }

    const isR5Class = (R5_COMBAT_MODULE_CLASS_IDS as readonly string[]).includes(
      selected.classId,
    );
    if (!isR5Class) {
      root.appendChild(
        createEl(
          'p',
          'editor-help',
          'R5 対象外兵科の方式です。メタデータと効果範囲は編集できますが、2 件必須 validate は R5 兵科のみです。',
        ),
      );
    }

    root.appendChild(this.buildMetaSection(selected));
    root.appendChild(this.buildEffectRangeSection(selected));
    root.appendChild(this.buildPreviewSection(selected));

    const actions = createEl('div', 'editor-actions');
    const saveBtn = createActionButton(
      this.options.saving ? '保存中…' : '保存',
      'editor-btn editor-btn-primary',
      () => this.options.onSave(),
    );
    saveBtn.disabled = this.options.saving;
    actions.appendChild(saveBtn);
    root.appendChild(actions);

    return root;
  }

  private buildMetaSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('基本');
    const grid = appendGrid(section);
    const readonly = this.options.saving;

    grid.appendChild(
      createFieldRow(
        'id（読取専用）',
        createTextInput(module.id, () => undefined, {
          readonly: true,
          field: 'combat-module-id',
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'classId（読取専用）',
        createTextInput(module.classId, () => undefined, {
          readonly: true,
          field: 'combat-module-class-id',
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '表示名',
        createTextInput(
          module.displayName,
          (displayName) => {
            this.updateModule(
              (current) => ({ ...current, displayName }),
              { rerender: false },
            );
          },
          { readonly, field: 'combat-module-display-name' },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '説明',
        createTextarea(
          module.description,
          (description) => {
            this.updateModule(
              (current) => ({ ...current, description }),
              { rerender: false },
            );
          },
          { readonly, rows: 3, field: 'combat-module-description' },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '攻撃間隔（秒）',
        createNumberInput(
          module.attackIntervalSec,
          (attackIntervalSec) => {
            if (!(attackIntervalSec > 0)) return;
            this.updateModule(
              (current) => ({ ...current, attackIntervalSec }),
              { rerender: false },
            );
          },
          { min: 0.1, step: 0.1, readonly, field: 'combat-module-interval' },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '攻撃手段（attackMethod）',
        createSelect(
          module.action.attackMethod ?? '',
          COMBAT_MODULE_ATTACK_METHOD_OPTIONS,
          (value) => {
            this.updateModule((current) => {
              const next = patchCombatModuleAction(current, (action) => {
                if (value === '') {
                  delete action.attackMethod;
                } else {
                  action.attackMethod = value as AttackMethod;
                }
              });
              return next;
            });
          },
        ),
      ),
    );

    return section;
  }

  private buildEffectRangeSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('効果範囲');
    section.appendChild(
      createEl(
        'p',
        'editor-hint',
        '範囲形式・対象数 / Hit・適用方式（即時 / 進行 / 持続 / 乱打）をここにまとめます。保存フィールドは従来の targetShape / aoeRadiusPx / pierceDurationSec / scatter* です。',
      ),
    );

    const fieldsWrap = createEl('div', 'editor-combat-module-effect-range');
    section.appendChild(fieldsWrap);

    const action = module.action;
    const lockSelfOrigin = (action.targetShape ?? 'single') === 'pierce';
    appendTargetSpecFields(
      fieldsWrap,
      defaultModuleActionTarget(action),
      (target) => {
        this.updateModule((current) =>
          patchCombatModuleAction(current, (nextAction) => {
            nextAction.target = lockSelfOrigin
              ? targetSpecForPierceShape(target)
              : target;
          }),
        );
      },
      { lockSelfOrigin, hostileTargetMode: true },
    );

    appendSkillEffectTargetingFields(
      fieldsWrap,
      action as Parameters<typeof appendSkillEffectTargetingFields>[1],
      (patch, patchOptions) => {
        this.updateModule(
          (current) =>
            patchCombatModuleAction(current, (nextAction) => {
              const prevShape = nextAction.targetShape;
              const patched = patch(
                nextAction as Parameters<
                  typeof appendSkillEffectTargetingFields
                >[1],
              );
              Object.assign(nextAction, patched);
              if (
                nextAction.targetShape === 'pierce' &&
                prevShape !== 'pierce'
              ) {
                nextAction.target = targetSpecForPierceShape(
                  (nextAction.target as TargetSpec | undefined) ??
                    defaultModuleActionTarget(nextAction),
                );
              }
            }),
          { rerender: patchOptions?.rerender !== false },
        );
      },
      {
        traitsRangePx:
          this.options.classRegistry[module.classId]?.traits.rangePx ?? 0,
      },
    );

    return section;
  }

  private buildPreviewSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('プレビュー');
    section.appendChild(
      createEl(
        'p',
        'editor-preview-line',
        `効果範囲要約: ${summarizeCombatModuleEffectRange(module)}`,
      ),
    );
    try {
      const synthesized = synthesizeCombatModuleSkill(module);
      section.appendChild(
        createEl(
          'p',
          'editor-preview-line',
          `合成説明: ${formatActiveDescription(synthesized)}`,
        ),
      );
    } catch (error) {
      section.appendChild(
        createEl(
          'p',
          'editor-warning editor-warning-error',
          error instanceof Error
            ? `preview 失敗: ${error.message}`
            : 'preview 失敗',
        ),
      );
    }
    return section;
  }
}
