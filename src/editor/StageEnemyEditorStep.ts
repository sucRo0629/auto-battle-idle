import type { ClassId, ClassPreset, CombatModuleDef, StageDef, StageEnemyGroup } from "../battle/types.ts";
import {
  formatEnemyGroupScaleSummary,
  resolveStageEnemyCompositionPreview,
} from "../ui/stageEnemyCompositionPreview.ts";
import {
  addStageDraftWave,
  canRemoveStageDraftWave,
  createDefaultStageEnemyGroup,
  ensureStageDraftWaves,
  removeStageDraftWave,
  resolveStageDraftCompositionMode,
  type StageDraft,
} from "./editorApi.ts";
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
} from "./formUtils.ts";
import {
  listStageEnemyCombatModuleOptions,
  normalizeStageEnemyGroupCombatModuleForClass,
  resolveStageEnemyCombatModuleDescription,
  setStageEnemyGroupCombatModuleId,
  STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED,
  type StageEnemyCombatModuleEditorContext,
} from "./stageEnemyCombatModuleEditor.ts";

const SCALE_MIN = 0.01;
const DEFAULT_SCALE = 1;

type ScaleKey = "hpScale" | "atkScale" | "defScale" | "resScale";

const SCALE_FIELDS: { key: ScaleKey; label: string }[] = [
  { key: "hpScale", label: "hp" },
  { key: "atkScale", label: "attack" },
  { key: "defScale", label: "defense" },
  { key: "resScale", label: "res" },
];

function resolveScale(value: number | undefined): number {
  return value ?? DEFAULT_SCALE;
}

function setOptionalScale(
  group: StageEnemyGroup,
  key: ScaleKey,
  value: number
): void {
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

function summarizeLegacyWaveEnemies(
  wave: NonNullable<StageDraft["waves"]>[number]
): string {
  return wave.enemies.length > 0
    ? wave.enemies.map((enemy) => enemy.templateId).join(", ")
    : "（なし）";
}

interface EnemyGroupsEditorContext {
  classOptions: { id: string; label: string }[];
  defaultClassId: string;
  combatModuleContext: StageEnemyCombatModuleEditorContext;
}

function appendCombatModuleField(
  groupGrid: HTMLElement,
  group: StageEnemyGroup,
  combatModuleContext: StageEnemyCombatModuleEditorContext,
  applyGroupMutation: (
    mutate: (groups: StageEnemyGroup[]) => void,
    rerender?: boolean
  ) => void,
  groupIndex: number
): void {
  const moduleOptions = listStageEnemyCombatModuleOptions(
    group.classId,
    combatModuleContext
  );
  if (moduleOptions.length === 0) return;

  const control = createEl("div", "editor-combat-module-control");
  const selectOptions = [
    {
      value: STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED,
      label: "既定値を使用（未指定）",
    },
    ...moduleOptions.map((option) => ({
      value: option.moduleId,
      label: option.displayName,
    })),
  ];
  const moduleSelect = createSelect(
    group.selectedCombatModuleId ?? STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED,
    selectOptions,
    (moduleId) => {
      applyGroupMutation((targetGroups) => {
        const target = targetGroups[groupIndex];
        if (!target) return;
        setStageEnemyGroupCombatModuleId(target, moduleId);
      });
    }
  );
  moduleSelect.dataset.editorField = "combatModule";

  const description = createEl("p", "editor-hint");
  description.dataset.editorField = "combatModuleDescription";
  description.textContent = resolveStageEnemyCombatModuleDescription(
    group,
    combatModuleContext
  );

  moduleSelect.addEventListener("change", () => {
    const nextGroup: StageEnemyGroup = {
      ...group,
      selectedCombatModuleId:
        moduleSelect.value === STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED
          ? undefined
          : moduleSelect.value,
    };
    description.textContent = resolveStageEnemyCombatModuleDescription(
      nextGroup,
      combatModuleContext
    );
  });

  control.append(moduleSelect, description);
  groupGrid.appendChild(createFieldRow("CombatModule", control));
}

function appendEnemyGroupsEditor(
  parent: HTMLElement,
  groups: StageEnemyGroup[],
  context: EnemyGroupsEditorContext,
  applyGroupMutation: (
    mutate: (groups: StageEnemyGroup[]) => void,
    rerender?: boolean
  ) => void
): void {
  const { classOptions, defaultClassId, combatModuleContext } = context;
  const editGrid = appendGrid(parent);

  if (groups.length === 0) {
    editGrid.appendChild(
      createFieldRow(
        "グループ",
        createEl("span", "editor-readonly-value", "（未追加）")
      )
    );
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    const groupSection = createSection(`グループ ${groupIndex + 1}`);
    parent.appendChild(groupSection);
    const groupGrid = appendGrid(groupSection);

    const classSelectOptions = classOptions.map((option) => ({
      value: option.id,
      label: option.label,
    }));
    if (
      group.classId &&
      !classSelectOptions.some((option) => option.value === group.classId)
    ) {
      classSelectOptions.push({
        value: group.classId,
        label: group.classId,
      });
    }

    groupGrid.appendChild(
      createFieldRow(
        "classId",
        createSelect(group.classId, classSelectOptions, (classId) => {
          applyGroupMutation((targetGroups) => {
            const target = targetGroups[groupIndex];
            if (!target) return;
            target.classId = classId;
            normalizeStageEnemyGroupCombatModuleForClass(
              target,
              combatModuleContext
            );
          }, true);
        })
      )
    );

    appendCombatModuleField(
      groupGrid,
      group,
      combatModuleContext,
      applyGroupMutation,
      groupIndex
    );

    groupGrid.appendChild(
      createFieldRow(
        "count",
        createNumberInput(
          group.count,
          (count) => {
            applyGroupMutation((targetGroups) => {
              const target = targetGroups[groupIndex];
              if (target) target.count = count;
            });
          },
          {
            min: 1,
            parseInput: parsePositiveInteger,
          }
        )
      )
    );

    for (const scaleField of SCALE_FIELDS) {
      groupGrid.appendChild(
        createFieldRow(
          scaleField.label,
          createNumberInput(
            resolveScale(group[scaleField.key]),
            (value) => {
              applyGroupMutation((targetGroups) => {
                const target = targetGroups[groupIndex];
                if (target) setOptionalScale(target, scaleField.key, value);
              });
            },
            {
              min: SCALE_MIN,
              step: 0.01,
              emptyWhen: DEFAULT_SCALE,
              parseInput: parsePositiveScale,
            }
          )
        )
      );
    }

    const groupActions = createEl("div", "editor-actions");
    groupActions.appendChild(
      createButton("グループを削除", "editor-btn editor-btn-small", () => {
        applyGroupMutation((targetGroups) => {
          targetGroups.splice(groupIndex, 1);
        }, true);
      })
    );
    groupSection.appendChild(groupActions);
  }

  const addActions = createEl("div", "editor-actions");
  addActions.appendChild(
    createButton("+ グループを追加", "editor-btn editor-btn-small", () => {
      applyGroupMutation((targetGroups) => {
        targetGroups.push(createDefaultStageEnemyGroup(defaultClassId));
      }, true);
    })
  );
  parent.appendChild(addActions);
}

function appendRecommendedLevelField(
  parent: HTMLElement,
  draft: StageDraft,
  commitDraft: (mutate: (next: StageDraft) => void) => void
): void {
  const grid = appendGrid(parent);
  grid.appendChild(
    createFieldRow(
      "recommendedLevel",
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
        }
      )
    )
  );
}

export interface StageEnemyEditorStepOptions {
  getDraft: () => StageDraft;
  stages: StageDef[];
  selectedStageId: string;
  classOptions: { id: string; label: string }[];
  classRegistry: Record<ClassId, ClassPreset>;
  combatModuleRegistry: Record<string, CombatModuleDef>;
  onSelectStage: (stageId: string) => void;
  onDraftChange: (draft: StageDraft) => void;
  onSave: () => void;
  saving?: boolean;
}

export class StageEnemyEditorStep {
  constructor(
    private container: HTMLElement,
    private options: StageEnemyEditorStepOptions
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
      classRegistry,
      combatModuleRegistry,
      onSelectStage,
      onDraftChange,
      onSave,
      saving,
    } = this.options;
    const draft = getDraft();
    const compositionMode = resolveStageDraftCompositionMode(draft);
    const defaultClassId = classOptions[0]?.id ?? "";
    this.container.replaceChildren();

    const commitDraft = (
      mutate: (next: StageDraft) => void,
      rerender = false
    ) => {
      const next = structuredClone(getDraft());
      mutate(next);
      onDraftChange(next);
      if (rerender) this.render();
    };

    const groupsEditorContext: EnemyGroupsEditorContext = {
      classOptions,
      defaultClassId,
      combatModuleContext: {
        classRegistry,
        combatModuleRegistry,
      },
    };

    const header = createEl("div", "editor-step-header");
    header.appendChild(createEl("h2", "editor-step-title", "ステージ敵編成"));
    header.appendChild(
      createEl(
        "p",
        "editor-step-desc",
        "ステージの recommendedLevel と enemyGroups（直下または Wave ごと）を編集します。legacy waves.enemies は参照のみです。templateId の本体は「敵テンプレ」タブで確認・編集します。"
      )
    );
    this.container.appendChild(header);

    const picker = createEl("div", "editor-picker");
    const select = createEl("select", "editor-select") as HTMLSelectElement;
    const emptyOpt = createEl("option") as HTMLOptionElement;
    emptyOpt.value = "";
    emptyOpt.textContent = "— 選択 —";
    select.appendChild(emptyOpt);
    for (const stage of stages) {
      const opt = createEl("option") as HTMLOptionElement;
      opt.value = stage.id;
      opt.textContent = `${stage.displayName} (${stage.id})`;
      if (stage.id === selectedStageId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      if (select.value) onSelectStage(select.value);
    });
    picker.appendChild(createEl("span", "editor-picker-label", "既存ステージ"));
    picker.appendChild(select);
    this.container.appendChild(picker);

    const identity = createSection("概要");
    this.container.appendChild(identity);
    const identityGrid = appendGrid(identity);
    identityGrid.appendChild(
      createFieldRow(
        "stageId",
        createEl("span", "editor-readonly-value", draft.id || "—")
      )
    );
    identityGrid.appendChild(
      createFieldRow(
        "表示名",
        createEl("span", "editor-readonly-value", draft.displayName || "—")
      )
    );

    this.appendCompositionPreview(draft, compositionMode);

    if (compositionMode === "legacy") {
      const legacySection = createSection("legacy waves（参照のみ）");
      this.container.appendChild(legacySection);
      const legacyGrid = appendGrid(legacySection);
      const waves = draft.waves ?? [];
      if (waves.length === 0) {
        legacyGrid.appendChild(
          createFieldRow(
            "waves",
            createEl("span", "editor-readonly-value", "（なし）")
          )
        );
      } else {
        for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
          const wave = waves[waveIndex]!;
          legacyGrid.appendChild(
            createFieldRow(
              `wave ${waveIndex}`,
              createEl(
                "span",
                "editor-readonly-value",
                summarizeLegacyWaveEnemies(wave)
              )
            )
          );
        }
      }

      const startActions = createEl("div", "editor-actions");
      startActions.appendChild(
        createActionButton("stage 直下 enemyGroups 編集を開始", "editor-btn", () => {
          commitDraft((next) => {
            next.enemyGroups = [];
          }, true);
        })
      );
      startActions.appendChild(
        createActionButton("Wave ごと enemyGroups 編集を開始", "editor-btn", () => {
          commitDraft((next) => {
            ensureStageDraftWaves(next);
            const wave = next.waves![0]!;
            if (wave.enemyGroups === undefined) {
              wave.enemyGroups = [
                createDefaultStageEnemyGroup(defaultClassId),
              ];
            }
          }, true);
        })
      );
      this.container.appendChild(startActions);
    } else if (compositionMode === "stageEnemyGroups") {
      const editSection = createSection("stage 直下 enemyGroups 編集");
      this.container.appendChild(editSection);
      appendRecommendedLevelField(editSection, draft, commitDraft);
      appendEnemyGroupsEditor(
        editSection,
        draft.enemyGroups ?? [],
        groupsEditorContext,
        (mutate, rerender) => {
          commitDraft((next) => {
            const groups = next.enemyGroups ?? [];
            mutate(groups);
            next.enemyGroups = groups;
          }, rerender);
        }
      );

      const hasLegacyTemplates = (draft.waves ?? []).some(
        (wave) => wave.enemies.length > 0
      );
      if (hasLegacyTemplates) {
        const legacyRef = createSection(
          "legacy waves（参照のみ・保存時は維持）"
        );
        this.container.appendChild(legacyRef);
        const legacyRefGrid = appendGrid(legacyRef);
        for (
          let waveIndex = 0;
          waveIndex < (draft.waves ?? []).length;
          waveIndex += 1
        ) {
          const wave = draft.waves![waveIndex]!;
          legacyRefGrid.appendChild(
            createFieldRow(
              `wave ${waveIndex}`,
              createEl(
                "span",
                "editor-readonly-value",
                summarizeLegacyWaveEnemies(wave)
              )
            )
          );
        }
      }
    } else {
      const editSection = createSection("Wave ごと enemyGroups 編集");
      this.container.appendChild(editSection);
      appendRecommendedLevelField(editSection, draft, commitDraft);

      const waves = draft.waves ?? [];
      const allowRemoveWave = canRemoveStageDraftWave(draft);
      for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
        const wave = waves[waveIndex]!;
        const waveSection = createSection(`Wave ${waveIndex}`);
        editSection.appendChild(waveSection);

        if (wave.enemyGroups !== undefined) {
          appendEnemyGroupsEditor(
            waveSection,
            wave.enemyGroups,
            groupsEditorContext,
            (mutate, rerender) => {
              commitDraft((next) => {
                const targetWave = next.waves?.[waveIndex];
                if (!targetWave) return;
                const groups = targetWave.enemyGroups ?? [];
                mutate(groups);
                targetWave.enemyGroups = groups;
              }, rerender);
            }
          );
        } else {
          const waveGrid = appendGrid(waveSection);
          waveGrid.appendChild(
            createFieldRow(
              "legacy enemies",
              createEl(
                "span",
                "editor-readonly-value",
                summarizeLegacyWaveEnemies(wave)
              )
            )
          );
          const waveActions = createEl("div", "editor-actions");
          waveActions.appendChild(
            createButton(
              "この Wave の enemyGroups を編集",
              "editor-btn editor-btn-small",
              () => {
                commitDraft((next) => {
                  ensureStageDraftWaves(next);
                  next.waves![waveIndex]!.enemyGroups = [];
                }, true);
              }
            )
          );
          waveSection.appendChild(waveActions);
        }

        if (wave.enemies.length > 0) {
          const legacyNote = createEl(
            "p",
            "editor-hint",
            "legacy enemies は保存時に維持されます。enemyGroups がある Wave では spawn 時に enemyGroups が優先されます。"
          );
          waveSection.appendChild(legacyNote);
        }

        if (allowRemoveWave) {
          const removeWaveActions = createEl("div", "editor-actions");
          const removeBtn = createButton(
            "Wave を削除",
            "editor-btn editor-btn-small",
            () => {
              commitDraft((next) => {
                if (removeStageDraftWave(next, waveIndex) !== null) return;
              }, true);
            }
          );
          removeBtn.dataset.editorAction = "removeWave";
          removeBtn.dataset.waveIndex = String(waveIndex);
          removeWaveActions.appendChild(removeBtn);
          waveSection.appendChild(removeWaveActions);
        }
      }

      const waveStructureActions = createEl("div", "editor-actions");
      const addWaveBtn = createButton(
        "+ Wave を追加",
        "editor-btn editor-btn-small",
        () => {
          commitDraft((next) => {
            addStageDraftWave(next, {
              defaultClassId: groupsEditorContext.defaultClassId,
            });
          }, true);
        }
      );
      addWaveBtn.dataset.editorAction = "addWave";
      waveStructureActions.appendChild(addWaveBtn);
      editSection.appendChild(waveStructureActions);
    }

    const actions = createEl("div", "editor-actions");
    const saveBtn = createActionButton(
      saving ? "保存中…" : "保存",
      "editor-btn editor-btn-primary",
      onSave
    );
    saveBtn.disabled = Boolean(saving) || !selectedStageId;
    actions.appendChild(saveBtn);
    this.container.appendChild(actions);
  }

  private appendCompositionPreview(
    draft: StageDraft,
    compositionMode: ReturnType<typeof resolveStageDraftCompositionMode>
  ): void {
    const preview = resolveStageEnemyCompositionPreview(draft as StageDef);
    const usesStageEnemyGroupsPreview =
      compositionMode === "stageEnemyGroups" || preview.usesEnemyGroups;
    const usesWaveEnemyGroupsPreview = compositionMode === "waveEnemyGroups";

    let liveTotalCount = preview.totalEnemyCount;
    if (usesStageEnemyGroupsPreview) {
      liveTotalCount = (draft.enemyGroups ?? []).reduce(
        (sum, group) => sum + group.count,
        0
      );
    } else if (usesWaveEnemyGroupsPreview) {
      liveTotalCount = (draft.waves ?? []).reduce((sum, wave) => {
        if (wave.enemyGroups === undefined) {
          return sum + wave.enemies.length;
        }
        return sum + wave.enemyGroups.reduce((groupSum, group) => groupSum + group.count, 0);
      }, 0);
    }

    const showLargePartyWarning = liveTotalCount >= 5;

    const compositionSection = createSection("編成概要");
    this.container.appendChild(compositionSection);
    const compositionGrid = appendGrid(compositionSection);

    const recommendedLevelLabel =
      draft.recommendedLevel ?? preview.recommendedLevel ?? null;
    compositionGrid.appendChild(
      createFieldRow(
        "recommendedLevel",
        createEl(
          "span",
          "editor-readonly-value",
          recommendedLevelLabel === null ? "—" : String(recommendedLevelLabel)
        )
      )
    );

    let compositionLabel = "legacy（waves / templateId）";
    if (compositionMode === "stageEnemyGroups") {
      compositionLabel = "stage 直下 enemyGroups（編集中）";
    } else if (compositionMode === "waveEnemyGroups") {
      compositionLabel = "waves[].enemyGroups（編集中）";
    } else if (preview.usesEnemyGroups) {
      compositionLabel = "stage 直下 enemyGroups（新正本）";
    }

    compositionGrid.appendChild(
      createFieldRow(
        "編成方式",
        createEl("span", "editor-readonly-value", compositionLabel)
      )
    );

    if (usesStageEnemyGroupsPreview) {
      const groupCount =
        draft.enemyGroups?.length ?? preview.enemyGroupLines.length;
      compositionGrid.appendChild(
        createFieldRow(
          "グループ数",
          createEl("span", "editor-readonly-value", String(groupCount))
        )
      );
      compositionGrid.appendChild(
        createFieldRow(
          "総体数",
          createEl("span", "editor-readonly-value", String(liveTotalCount))
        )
      );

      const groupLines =
        draft.enemyGroups !== undefined
          ? (draft.enemyGroups ?? []).map((group) => ({
              classId: group.classId,
              count: group.count,
              hpScale: resolveScale(group.hpScale),
              atkScale: resolveScale(group.atkScale),
              defScale: resolveScale(group.defScale),
              resScale: resolveScale(group.resScale),
            }))
          : preview.enemyGroupLines;

      if (groupLines.length > 0) {
        const list = createEl("ul", "editor-preview-list");
        for (const line of groupLines) {
          const item = createEl("li");
          item.textContent = `${line.classId} ×${
            line.count
          }${formatEnemyGroupScaleSummary(line)}`;
          list.appendChild(item);
        }
        compositionSection.appendChild(list);
      }
    } else if (usesWaveEnemyGroupsPreview) {
      compositionGrid.appendChild(
        createFieldRow(
          "waves 数",
          createEl(
            "span",
            "editor-readonly-value",
            String(draft.waves?.length ?? 0)
          )
        )
      );
      compositionGrid.appendChild(
        createFieldRow(
          "総体数",
          createEl("span", "editor-readonly-value", String(liveTotalCount))
        )
      );

      const list = createEl("ul", "editor-preview-list");
      for (let waveIndex = 0; waveIndex < (draft.waves ?? []).length; waveIndex += 1) {
        const wave = draft.waves![waveIndex]!;
        const item = createEl("li");
        if (wave.enemyGroups !== undefined) {
          const waveSummary = wave.enemyGroups
            .map(
              (group) =>
                `${group.classId} ×${group.count}${formatEnemyGroupScaleSummary({
                  classId: group.classId,
                  count: group.count,
                  hpScale: resolveScale(group.hpScale),
                  atkScale: resolveScale(group.atkScale),
                  defScale: resolveScale(group.defScale),
                  resScale: resolveScale(group.resScale),
                })}`
            )
            .join(", ");
          item.textContent = `wave ${waveIndex}: ${waveSummary || "（未追加）"}`;
        } else {
          item.textContent = `wave ${waveIndex}: legacy ${summarizeLegacyWaveEnemies(wave)}`;
        }
        list.appendChild(item);
      }
      compositionSection.appendChild(list);
    } else {
      compositionGrid.appendChild(
        createFieldRow(
          "enemyGroups",
          createEl("span", "editor-readonly-value", "未設定")
        )
      );
      compositionGrid.appendChild(
        createFieldRow(
          "waves 数",
          createEl(
            "span",
            "editor-readonly-value",
            String(draft.waves?.length ?? 0)
          )
        )
      );

      if (preview.legacyWaveLines.length > 0) {
        const list = createEl("ul", "editor-preview-list");
        for (const line of preview.legacyWaveLines) {
          const item = createEl("li");
          const waveLabel =
            preview.legacyWaveLines.length === 1
              ? ""
              : `wave ${line.waveIndex}: `;
          item.textContent =
            line.templateIds.length > 0
              ? `${waveLabel}${line.templateIds.join(", ")}`
              : `${waveLabel}（なし）`;
          list.appendChild(item);
        }
        compositionSection.appendChild(list);
      }
    }

    if (showLargePartyWarning) {
      compositionSection.appendChild(
        createEl(
          "p",
          "editor-warning",
          "注意: 5体以上は表示・配置の後続調整対象です（入力は許容）。"
        )
      );
    }
  }
}
