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
  COMBAT_MODULE_RUNTIME_EFFECT_KIND_OPTIONS,
  DAMAGE_TAKEN_DAMAGE_TYPE_OPTIONS,
  damageTakenDamageTypesSelectValue,
  findCombatModuleDraft,
  listCombatModuleAuthoringClassIds,
  listCombatModulesForClass,
  parseDamageTakenDamageTypesSelect,
  patchCombatModuleAction,
  runtimeEffectKindValue,
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
    root.appendChild(this.buildRuntimeEffectSection(selected));
    root.appendChild(this.buildPrimaryBuffSection(selected));
    root.appendChild(this.buildPrimaryHealSection(selected));
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

  private buildRuntimeEffectSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('runtimeEffect（CombatModule 専用）');
    section.appendChild(
      createEl(
        'p',
        'editor-hint',
        '通常 action では表現しない選択中永続効果・被 Hit リアクション等。鉄衛士 / 護法士 M1・M2 など。',
      ),
    );
    const grid = appendGrid(section);
    const readonly = this.options.saving;
    const kind = runtimeEffectKindValue(module);

    grid.appendChild(
      createFieldRow(
        'kind',
        (() => {
          const select = createSelect(
            kind,
            COMBAT_MODULE_RUNTIME_EFFECT_KIND_OPTIONS,
            (value) => {
              this.updateModule((current) => {
                const next = structuredClone(current);
                if (value === '') {
                  delete next.runtimeEffect;
                  return next;
                }
                if (value === 'physicalDamageTakenReduction') {
                  const takenMultiplier =
                    next.runtimeEffect?.kind === 'physicalDamageTakenReduction'
                      ? next.runtimeEffect.takenMultiplier
                      : 0.85;
                  next.runtimeEffect = {
                    kind: 'physicalDamageTakenReduction',
                    takenMultiplier,
                  };
                  return next;
                }
                if (value === 'protectFrontlineAllies') {
                  const prev =
                    next.runtimeEffect?.kind === 'protectFrontlineAllies'
                      ? next.runtimeEffect
                      : undefined;
                  next.runtimeEffect = {
                    kind: 'protectFrontlineAllies',
                    maxTargets: prev?.maxTargets ?? 4,
                    magicDamageTakenMultiplier:
                      prev?.magicDamageTakenMultiplier ?? 0.85,
                    ...(prev?.allDamageTakenMultiplier !== undefined
                      ? {
                          allDamageTakenMultiplier:
                            prev.allDamageTakenMultiplier,
                        }
                      : { allDamageTakenMultiplier: 0.95 }),
                  };
                  return next;
                }
                if (value === 'protectDangerTarget') {
                  const prev =
                    next.runtimeEffect?.kind === 'protectDangerTarget'
                      ? next.runtimeEffect
                      : undefined;
                  next.runtimeEffect = {
                    kind: 'protectDangerTarget',
                    maxTargets: prev?.maxTargets ?? 1,
                    windowSec: prev?.windowSec ?? 2,
                    allDamageTakenMultiplier:
                      prev?.allDamageTakenMultiplier ?? 0.85,
                    magicDamageTakenMultiplier:
                      prev?.magicDamageTakenMultiplier ?? 0.85,
                    durationSec: prev?.durationSec ?? 4,
                  };
                  return next;
                }
                const flatAmount =
                  next.runtimeEffect?.kind === 'healOnEnemyAttackHpHit'
                    ? next.runtimeEffect.flatAmount
                    : 20;
                next.runtimeEffect = {
                  kind: 'healOnEnemyAttackHpHit',
                  flatAmount,
                };
                return next;
              });
            },
          );
          select.disabled = readonly;
          return select;
        })(),
      ),
    );

    if (kind === 'healOnEnemyAttackHpHit') {
      grid.appendChild(
        createFieldRow(
          'flatAmount（Hitごと固定回復）',
          createNumberInput(
            module.runtimeEffect?.kind === 'healOnEnemyAttackHpHit'
              ? module.runtimeEffect.flatAmount
              : 20,
            (flatAmount) => {
              if (!(flatAmount > 0) || !Number.isFinite(flatAmount)) return;
              this.updateModule((current) => {
                const next = structuredClone(current);
                next.runtimeEffect = {
                  kind: 'healOnEnemyAttackHpHit',
                  flatAmount,
                };
                return next;
              }, { rerender: false });
            },
            { min: 0.1, step: 1, readonly, field: 'combat-module-runtime-flat' },
          ),
        ),
      );
    }

    if (kind === 'physicalDamageTakenReduction') {
      grid.appendChild(
        createFieldRow(
          'takenMultiplier（物理被ダメ倍率・永続）',
          createNumberInput(
            module.runtimeEffect?.kind === 'physicalDamageTakenReduction'
              ? module.runtimeEffect.takenMultiplier
              : 0.85,
            (takenMultiplier) => {
              if (
                !(takenMultiplier > 0) ||
                takenMultiplier > 1 ||
                !Number.isFinite(takenMultiplier)
              ) {
                return;
              }
              this.updateModule((current) => {
                const next = structuredClone(current);
                next.runtimeEffect = {
                  kind: 'physicalDamageTakenReduction',
                  takenMultiplier,
                };
                return next;
              }, { rerender: false });
            },
            {
              min: 0.01,
              max: 1,
              step: 0.01,
              readonly,
              field: 'combat-module-runtime-taken-mul',
            },
          ),
        ),
      );
    }

    if (kind === 'protectFrontlineAllies') {
      const effect =
        module.runtimeEffect?.kind === 'protectFrontlineAllies'
          ? module.runtimeEffect
          : undefined;
      grid.appendChild(
        createFieldRow(
          'maxTargets（前線味方上限）',
          createNumberInput(effect?.maxTargets ?? 4, (maxTargets) => {
            if (!(maxTargets >= 1) || !Number.isFinite(maxTargets)) return;
            this.updateModule((current) => {
              const next = structuredClone(current);
              const prev =
                next.runtimeEffect?.kind === 'protectFrontlineAllies'
                  ? next.runtimeEffect
                  : {
                      kind: 'protectFrontlineAllies' as const,
                      maxTargets: 4,
                      magicDamageTakenMultiplier: 0.85,
                    };
              next.runtimeEffect = {
                ...prev,
                kind: 'protectFrontlineAllies',
                maxTargets: Math.floor(maxTargets),
              };
              return next;
            }, { rerender: false });
          }, { min: 1, step: 1, readonly, field: 'combat-module-runtime-m1-max' }),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'magicDamageTakenMultiplier',
          createNumberInput(
            effect?.magicDamageTakenMultiplier ?? 0.85,
            (magicDamageTakenMultiplier) => {
              if (
                !(magicDamageTakenMultiplier > 0) ||
                magicDamageTakenMultiplier > 1 ||
                !Number.isFinite(magicDamageTakenMultiplier)
              ) {
                return;
              }
              this.updateModule((current) => {
                const next = structuredClone(current);
                const prev =
                  next.runtimeEffect?.kind === 'protectFrontlineAllies'
                    ? next.runtimeEffect
                    : {
                        kind: 'protectFrontlineAllies' as const,
                        maxTargets: 4,
                        magicDamageTakenMultiplier: 0.85,
                      };
                next.runtimeEffect = {
                  ...prev,
                  kind: 'protectFrontlineAllies',
                  magicDamageTakenMultiplier,
                };
                return next;
              }, { rerender: false });
            },
            {
              min: 0.01,
              max: 1,
              step: 0.01,
              readonly,
              field: 'combat-module-runtime-m1-magic',
            },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'allDamageTakenMultiplier（任意）',
          createNumberInput(
            effect?.allDamageTakenMultiplier ?? 0.95,
            (allDamageTakenMultiplier) => {
              if (
                !(allDamageTakenMultiplier > 0) ||
                allDamageTakenMultiplier > 1 ||
                !Number.isFinite(allDamageTakenMultiplier)
              ) {
                return;
              }
              this.updateModule((current) => {
                const next = structuredClone(current);
                const prev =
                  next.runtimeEffect?.kind === 'protectFrontlineAllies'
                    ? next.runtimeEffect
                    : {
                        kind: 'protectFrontlineAllies' as const,
                        maxTargets: 4,
                        magicDamageTakenMultiplier: 0.85,
                      };
                next.runtimeEffect = {
                  ...prev,
                  kind: 'protectFrontlineAllies',
                  allDamageTakenMultiplier,
                };
                return next;
              }, { rerender: false });
            },
            {
              min: 0.01,
              max: 1,
              step: 0.01,
              readonly,
              field: 'combat-module-runtime-m1-all',
            },
          ),
        ),
      );
    }

    if (kind === 'protectDangerTarget') {
      const effect =
        module.runtimeEffect?.kind === 'protectDangerTarget'
          ? module.runtimeEffect
          : undefined;
      const patchM2 = (
        patch: Partial<{
          maxTargets: number;
          windowSec: number;
          allDamageTakenMultiplier: number;
          magicDamageTakenMultiplier: number;
          durationSec: number;
        }>,
      ) => {
        this.updateModule((current) => {
          const next = structuredClone(current);
          const prev =
            next.runtimeEffect?.kind === 'protectDangerTarget'
              ? next.runtimeEffect
              : {
                  kind: 'protectDangerTarget' as const,
                  maxTargets: 1,
                  windowSec: 2,
                  allDamageTakenMultiplier: 0.85,
                  magicDamageTakenMultiplier: 0.85,
                  durationSec: 4,
                };
          next.runtimeEffect = {
            ...prev,
            kind: 'protectDangerTarget',
            ...patch,
          };
          return next;
        }, { rerender: false });
      };
      grid.appendChild(
        createFieldRow(
          'maxTargets（danger）',
          createNumberInput(effect?.maxTargets ?? 1, (maxTargets) => {
            if (!(maxTargets >= 1) || !Number.isFinite(maxTargets)) return;
            patchM2({ maxTargets: Math.floor(maxTargets) });
          }, { min: 1, step: 1, readonly, field: 'combat-module-runtime-m2-max' }),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'windowSec（danger）',
          createNumberInput(effect?.windowSec ?? 2, (windowSec) => {
            if (!(windowSec >= 0) || !Number.isFinite(windowSec)) return;
            patchM2({ windowSec });
          }, { min: 0, step: 0.1, readonly, field: 'combat-module-runtime-m2-window' }),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'allDamageTakenMultiplier',
          createNumberInput(
            effect?.allDamageTakenMultiplier ?? 0.85,
            (allDamageTakenMultiplier) => {
              if (
                !(allDamageTakenMultiplier > 0) ||
                allDamageTakenMultiplier > 1 ||
                !Number.isFinite(allDamageTakenMultiplier)
              ) {
                return;
              }
              patchM2({ allDamageTakenMultiplier });
            },
            {
              min: 0.01,
              max: 1,
              step: 0.01,
              readonly,
              field: 'combat-module-runtime-m2-all',
            },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'magicDamageTakenMultiplier（追加）',
          createNumberInput(
            effect?.magicDamageTakenMultiplier ?? 0.85,
            (magicDamageTakenMultiplier) => {
              if (
                !(magicDamageTakenMultiplier > 0) ||
                magicDamageTakenMultiplier > 1 ||
                !Number.isFinite(magicDamageTakenMultiplier)
              ) {
                return;
              }
              patchM2({ magicDamageTakenMultiplier });
            },
            {
              min: 0.01,
              max: 1,
              step: 0.01,
              readonly,
              field: 'combat-module-runtime-m2-magic',
            },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          'durationSec',
          createNumberInput(effect?.durationSec ?? 4, (durationSec) => {
            if (!(durationSec > 0) || !Number.isFinite(durationSec)) return;
            patchM2({ durationSec });
          }, { min: 0.1, step: 0.1, readonly, field: 'combat-module-runtime-m2-dur' }),
        ),
      );
    }

    return section;
  }

  private buildPrimaryBuffSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('主効果（effect[0] buff）');
    section.appendChild(
      createEl(
        'p',
        'editor-hint',
        '鉄衛士 M1 など self buff の倍率・属性限定を編集します。damage 主効果の module では変更しないでください。',
      ),
    );
    const primary = module.action.effect[0];
    if (!primary || primary.type !== 'buff' || primary.buffSubKind !== 'stat') {
      section.appendChild(
        createEl(
          'p',
          'editor-help',
          'effect[0] が buff/stat ではないため、この欄は非表示相当です。',
        ),
      );
      return section;
    }

    const grid = appendGrid(section);
    const readonly = this.options.saving;
    const buffStat = Array.isArray(primary.buffStat)
      ? primary.buffStat[0] ?? 'damageTaken'
      : primary.buffStat ?? 'damageTaken';

    grid.appendChild(
      createFieldRow(
        'buffStat（読取）',
        createTextInput(String(buffStat), () => undefined, {
          readonly: true,
          field: 'combat-module-buff-stat',
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'buffMultiplier',
        createNumberInput(
          primary.buffMultiplier ?? 1,
          (buffMultiplier) => {
            if (!Number.isFinite(buffMultiplier) || buffMultiplier <= 0) return;
            this.updateModule((current) =>
              patchCombatModuleAction(current, (action) => {
                const effect = action.effect[0];
                if (!effect || effect.type !== 'buff') return;
                effect.buffMultiplier = buffMultiplier;
              }),
              { rerender: false },
            );
          },
          { min: 0.01, step: 0.01, readonly, field: 'combat-module-buff-mul' },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'buffDurationSec',
        createNumberInput(
          primary.buffDurationSec ?? 1,
          (buffDurationSec) => {
            if (!(buffDurationSec > 0)) return;
            this.updateModule((current) =>
              patchCombatModuleAction(current, (action) => {
                const effect = action.effect[0];
                if (!effect || effect.type !== 'buff') return;
                effect.buffDurationSec = buffDurationSec;
              }),
              { rerender: false },
            );
          },
          { min: 0.1, step: 0.1, readonly, field: 'combat-module-buff-dur' },
        ),
      ),
    );

    if (buffStat === 'damageTaken') {
      grid.appendChild(
        createFieldRow(
          'damageTakenDamageTypes',
          (() => {
            const select = createSelect(
              damageTakenDamageTypesSelectValue(primary.damageTakenDamageTypes),
              DAMAGE_TAKEN_DAMAGE_TYPE_OPTIONS,
              (value) => {
                this.updateModule((current) =>
                  patchCombatModuleAction(current, (action) => {
                    const effect = action.effect[0];
                    if (!effect || effect.type !== 'buff') return;
                    const types = parseDamageTakenDamageTypesSelect(value);
                    if (types === undefined) {
                      delete effect.damageTakenDamageTypes;
                    } else {
                      effect.damageTakenDamageTypes = types;
                    }
                  }),
                );
              },
            );
            select.disabled = readonly;
            return select;
          })(),
        ),
      );
    }

    return section;
  }

  private buildPrimaryHealSection(module: CombatModuleDef): HTMLElement {
    const section = createSection('主効果（effect[0] heal）');
    section.appendChild(
      createEl(
        'p',
        'editor-hint',
        '療養師 M1/M2 など instant heal の回復量（atkScale）を編集します。数値の本調整は R12i。',
      ),
    );
    const primary = module.action.effect[0];
    if (
      !primary ||
      primary.type !== 'heal' ||
      (primary.healSubKind ?? 'instant') !== 'instant'
    ) {
      section.appendChild(
        createEl(
          'p',
          'editor-help',
          'effect[0] が instant heal ではないため、この欄は非表示相当です。',
        ),
      );
      return section;
    }

    const grid = appendGrid(section);
    const readonly = this.options.saving;
    const amount = primary.amount;
    const atkScale =
      amount?.kind === 'atkBased' ? (amount.atkScale ?? 1) : 1;

    grid.appendChild(
      createFieldRow(
        'amount.kind（読取）',
        createTextInput(amount?.kind ?? 'atkBased', () => undefined, {
          readonly: true,
          field: 'combat-module-heal-amount-kind',
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'atkScale（回復量倍率・仮）',
        createNumberInput(
          atkScale,
          (nextScale) => {
            if (!(nextScale > 0) || !Number.isFinite(nextScale)) return;
            this.updateModule((current) =>
              patchCombatModuleAction(current, (action) => {
                const effect = action.effect[0];
                if (!effect || effect.type !== 'heal') return;
                effect.amount = { kind: 'atkBased', atkScale: nextScale };
              }),
              { rerender: false },
            );
          },
          {
            min: 0.01,
            step: 0.05,
            readonly,
            field: 'combat-module-heal-atk-scale',
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
