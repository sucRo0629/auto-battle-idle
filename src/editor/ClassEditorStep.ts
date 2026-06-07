import {
  ATTACK_RANGE_OPTIONS,
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  FORMATION_ROW_OPTIONS,
  GROWTH_PRESET_KEY_LABELS,
  GROWTH_PRESET_KEY_OPTIONS,
  GROWTH_TIER_LABELS,
  GROWTH_TIER_OPTIONS,
  REG_OPTIONS,
  ROLE_OPTIONS,
} from "../battle/data/gameDataSchema.ts";
import type {
  AttackRange,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  Role,
} from "../battle/types.ts";
import levelCurvesJson from "../../data/levelCurves.json";
import {
  computeStatsAtLevel,
  getBasicCooldownRate,
  loadLevelCurves,
  resolveStatGrowth,
} from "../progression/levelGrowth.ts";
import type { ClassPresetBeforeEnrich } from "../progression/skillUnlocks.ts";
import {
  type ClassDraft,
  type DraftChangeOptions,
  classDraftFromPreset,
  createEmptyClassDraft,
  defaultAttackSpeedTierForRole,
  defaultBasicAttackId,
  defaultGrowthTierForRole,
  ensureClassGrowthFields,
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
  createTextInput,
  preserveScrollDuring,
} from "./formUtils.ts";

const ROLE_LABELS: Record<Role, string> = {
  defender: "守備 (defender)",
  attacker: "攻撃 (attacker)",
  supporter: "支援 (supporter)",
};

const ROW_LABELS: Record<FormationRow, string> = {
  front: "前列",
  middle: "中列",
  back: "後列",
};

const RANGE_LABELS: Record<AttackRange, string> = {
  melee: "近接",
  ranged: "遠距離",
};

const LEVEL_CURVES = loadLevelCurves(levelCurvesJson);
const PREVIEW_LEVEL = 10;
const DEFAULT_BASIC_INTERVAL_SEC = 2;

function growthTierField(
  label: string,
  value: GrowthTier,
  onChange: (tier: GrowthTier) => void
): HTMLElement {
  return createFieldRow(
    label,
    createSelect(
      value,
      GROWTH_TIER_OPTIONS.map((tier) => ({
        value: tier,
        label: GROWTH_TIER_LABELS[tier],
      })),
      onChange
    )
  );
}

function renderGrowthPreview(parent: HTMLElement, draft: ClassDraft): void {
  ensureClassGrowthFields(draft.class);
  const growth = resolveStatGrowth(draft.class, LEVEL_CURVES);
  const lv10 = computeStatsAtLevel(
    {
      maxHp: draft.class.maxHp,
      atk: draft.class.atk,
      def: draft.class.def,
      reg: draft.class.reg,
    },
    draft.class,
    PREVIEW_LEVEL,
    LEVEL_CURVES
  );
  const speedTier = draft.class.attackSpeedTier ?? "normal";
  const cdRate = getBasicCooldownRate(speedTier, LEVEL_CURVES);
  const effectiveCd = DEFAULT_BASIC_INTERVAL_SEC / cdRate;

  const box = createEl("div", "editor-preview");
  box.appendChild(
    createEl(
      "p",
      "editor-preview-title",
      `Lv${PREVIEW_LEVEL} 試算（Lv1 + 成長 × ${PREVIEW_LEVEL - 1}）`
    )
  );
  const list = createEl("ul", "editor-preview-list");
  for (const [label, total, perLevel] of [
    ["HP", lv10.maxHp, growth.maxHp],
    ["ATK", lv10.atk, growth.atk],
    ["DEF", lv10.def, growth.def],
  ] as const) {
    const item = createEl("li");
    item.textContent = `${label}: ${total}（+${perLevel}/Lv）`;
    list.appendChild(item);
  }
  box.appendChild(list);
  box.appendChild(
    createEl(
      "p",
      "editor-preview-note",
      `攻撃速度: ${
        ATTACK_SPEED_TIER_LABELS[speedTier]
      } — 基本攻撃 CD 係数 ${cdRate.toFixed(3)}` +
        `（interval ${DEFAULT_BASIC_INTERVAL_SEC}s 想定 → 約 ${effectiveCd.toFixed(
          2
        )}s/発）`
    )
  );
  parent.appendChild(box);
}

export interface ClassEditorStepOptions {
  getDraft: () => ClassDraft;
  classes: ClassPresetBeforeEnrich[];
  selectedClassId: string;
  onDraftChange: (draft: ClassDraft, options?: DraftChangeOptions) => void;
  onSelectClass: (classId: string) => void;
  onNewClass: () => void;
  onSave: () => void;
  saving?: boolean;
  hidePicker?: boolean;
  hideSave?: boolean;
}

export class ClassEditorStep {
  private previewHost: HTMLElement | null = null;

  constructor(
    private container: HTMLElement,
    private options: ClassEditorStepOptions
  ) {
    this.render();
  }

  update(options: ClassEditorStepOptions): void {
    this.options = options;
    this.render();
  }

  destroy(): void {
    this.container.replaceChildren();
    this.previewHost = null;
  }

  private updatePreview(): void {
    if (!this.previewHost) return;
    const contentStart = this.previewHost.querySelector(".editor-preview");
    if (contentStart) contentStart.remove();
    renderGrowthPreview(this.previewHost, this.options.getDraft());
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.previewHost = null;
      this.renderContent();
    });
  }

  private renderContent(): void {
    const {
      getDraft,
      classes,
      selectedClassId,
      onDraftChange,
      onSelectClass,
      onNewClass,
      onSave,
      saving,
      hidePicker,
      hideSave,
    } = this.options;
    const draft = getDraft();
    this.container.replaceChildren();

    const commitDraft = (
      mutate: (next: ClassDraft) => void,
      options?: DraftChangeOptions
    ) => {
      const next = structuredClone(getDraft());
      mutate(next);
      onDraftChange(next);
      if (options?.rerender) {
        this.render();
      } else if (options?.updatePreview) {
        this.updatePreview();
      }
    };

    const header = createEl("div", "editor-step-header");
    header.appendChild(createEl("h2", "editor-step-title", "クラス設定"));
    header.appendChild(
      createEl(
        "p",
        "editor-step-desc",
        "クラステンプレートを編集します。スキル定義・習得 Lv は下のセクションで設定します。"
      )
    );
    this.container.appendChild(header);

    if (!hidePicker) {
      const picker = createEl("div", "editor-picker");
      const select = createEl("select", "editor-select") as HTMLSelectElement;
      const emptyOpt = createEl("option") as HTMLOptionElement;
      emptyOpt.value = "";
      emptyOpt.textContent = "— 選択 —";
      select.appendChild(emptyOpt);
      for (const cls of classes) {
        const opt = createEl("option") as HTMLOptionElement;
        opt.value = cls.id;
        opt.textContent = `${cls.displayName} (${cls.id})`;
        if (cls.id === selectedClassId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        if (select.value) onSelectClass(select.value);
      });
      picker.appendChild(createEl("span", "editor-picker-label", "既存クラス"));
      picker.appendChild(select);
      picker.appendChild(
        createButton("新規", "editor-btn editor-btn-secondary", onNewClass)
      );
      this.container.appendChild(picker);
    }

    const identity = createSection("基本");
    this.container.appendChild(identity);
    const identityGrid = appendGrid(identity);
    if (!hidePicker) {
      identityGrid.appendChild(
        createFieldRow(
          "classId",
          createTextInput(draft.class.id, (id) => {
            commitDraft((next) => {
              next.class.id = id;
              if (id.trim()) {
                next.class.basicAttackSkillId = defaultBasicAttackId(id.trim());
              }
            });
          })
        )
      );
      identityGrid.appendChild(
        createFieldRow(
          "表示名",
          createTextInput(draft.class.displayName, (displayName) => {
            commitDraft((next) => {
              next.class.displayName = displayName;
            });
          })
        )
      );
    }
    identityGrid.appendChild(
      createFieldRow(
        "ロール",
        createSelect(
          draft.class.role,
          ROLE_OPTIONS.map((value) => ({ value, label: ROLE_LABELS[value] })),
          (role) => {
            commitDraft(
              (next) => {
                next.class.role = role;
                next.class.growthTier = defaultGrowthTierForRole(role);
                next.class.attackSpeedTier =
                  defaultAttackSpeedTierForRole(role);
                if (role !== "attacker") {
                  delete next.class.growthPresetKey;
                }
              },
              { rerender: true }
            );
          }
        )
      )
    );
    identityGrid.appendChild(
      createFieldRow(
        "配置列",
        createSelect(
          draft.class.formationRow,
          FORMATION_ROW_OPTIONS.map((value) => ({
            value,
            label: ROW_LABELS[value],
          })),
          (formationRow) => {
            commitDraft((next) => {
              next.class.formationRow = formationRow;
            });
          }
        )
      )
    );
    identityGrid.appendChild(
      createFieldRow(
        "jobTier",
        createTextInput("1", () => {}, { readonly: true })
      )
    );

    const traitsSection = createSection("特性");
    this.container.appendChild(traitsSection);
    const traitsGrid = appendGrid(traitsSection);
    traitsGrid.appendChild(
      createFieldRow(
        "攻撃射程",
        createSelect(
          draft.class.traits.attackRange,
          ATTACK_RANGE_OPTIONS.map((value) => ({
            value,
            label: RANGE_LABELS[value],
          })),
          (attackRange) => {
            commitDraft(
              (next) => {
                next.class.traits.attackRange = attackRange;
                if (attackRange === "melee") delete next.class.traits.rangePx;
              },
              { rerender: true }
            );
          }
        )
      )
    );
    if (draft.class.traits.attackRange === "ranged") {
      traitsGrid.appendChild(
        createFieldRow(
          "rangePx",
          createNumberInput(
            draft.class.traits.rangePx ?? 100,
            (rangePx) => {
              commitDraft((next) => {
                next.class.traits.rangePx = rangePx;
              });
            },
            { min: 1, step: 10 }
          )
        )
      );
    }

    const statsSection = createSection("Lv1 ステータス");
    this.container.appendChild(statsSection);
    statsSection.appendChild(
      createEl(
        "p",
        "editor-hint",
        "maxHp / atk / def は Lv1 基準値。reg と攻撃速度は Lv とともに変化しません。"
      )
    );
    const statsGrid = appendGrid(statsSection);
    statsGrid.appendChild(
      createFieldRow(
        "maxHp",
        createNumberInput(
          draft.class.maxHp,
          (maxHp) => {
            commitDraft(
              (next) => {
                next.class.maxHp = maxHp;
              },
              { updatePreview: true }
            );
          },
          { min: 1 }
        )
      )
    );
    statsGrid.appendChild(
      createFieldRow(
        "atk",
        createNumberInput(
          draft.class.atk,
          (atk) => {
            commitDraft(
              (next) => {
                next.class.atk = atk;
              },
              { updatePreview: true }
            );
          },
          { min: 0 }
        )
      )
    );
    statsGrid.appendChild(
      createFieldRow(
        "def",
        createNumberInput(
          draft.class.def,
          (def) => {
            commitDraft(
              (next) => {
                next.class.def = def;
              },
              { updatePreview: true }
            );
          },
          { min: 0 }
        )
      )
    );
    statsGrid.appendChild(
      createFieldRow(
        "reg",
        createSelect(
          draft.class.reg,
          REG_OPTIONS.map((value) => ({ value, label: String(value) })),
          (reg) => {
            commitDraft((next) => {
              next.class.reg = reg;
            });
          }
        )
      )
    );

    ensureClassGrowthFields(draft.class);
    const growthTier = draft.class.growthTier!;

    const growthSection = createSection("成長段階（LvUP 加算）");
    this.container.appendChild(growthSection);
    growthSection.appendChild(
      createEl(
        "p",
        "editor-hint",
        "低・中・高は levelCurves.json の growthPresets から実数を解決します。"
      )
    );
    const growthGrid = appendGrid(growthSection);
    growthGrid.appendChild(
      growthTierField("HP 成長", growthTier.maxHp, (maxHp) => {
        commitDraft(
          (next) => {
            ensureClassGrowthFields(next.class);
            next.class.growthTier!.maxHp = maxHp;
          },
          { updatePreview: true }
        );
      })
    );
    growthGrid.appendChild(
      growthTierField("ATK 成長", growthTier.atk, (atk) => {
        commitDraft(
          (next) => {
            ensureClassGrowthFields(next.class);
            next.class.growthTier!.atk = atk;
          },
          { updatePreview: true }
        );
      })
    );
    growthGrid.appendChild(
      growthTierField("DEF 成長", growthTier.def, (def) => {
        commitDraft(
          (next) => {
            ensureClassGrowthFields(next.class);
            next.class.growthTier!.def = def;
          },
          { updatePreview: true }
        );
      })
    );

    if (draft.class.role === "attacker") {
      const presetKey: GrowthPresetKey =
        draft.class.growthPresetKey === "caster" ? "caster" : "attacker";
      growthGrid.appendChild(
        createFieldRow(
          "成長 preset",
          createSelect(
            presetKey,
            GROWTH_PRESET_KEY_OPTIONS.map((value) => ({
              value,
              label: GROWTH_PRESET_KEY_LABELS[value],
            })),
            (key) => {
              commitDraft(
                (next) => {
                  if (key === "caster") {
                    next.class.growthPresetKey = "caster";
                  } else {
                    delete next.class.growthPresetKey;
                  }
                },
                { rerender: true }
              );
            }
          )
        )
      );
      if (presetKey === "caster") {
        growthSection.appendChild(
          createEl(
            "p",
            "editor-hint",
            "caster: HP/DEF → supporter 表、ATK → attacker 表"
          )
        );
      }
    }

    const speedSection = createSection("攻撃速度（基本攻撃 CD）");
    this.container.appendChild(speedSection);
    const speedGrid = appendGrid(speedSection);
    speedGrid.appendChild(
      createFieldRow(
        "SPD 段階",
        createSelect(
          draft.class.attackSpeedTier ?? "normal",
          ATTACK_SPEED_TIER_OPTIONS.map((value) => ({
            value,
            label: ATTACK_SPEED_TIER_LABELS[value],
          })),
          (attackSpeedTier) => {
            commitDraft(
              (next) => {
                next.class.attackSpeedTier = attackSpeedTier;
              },
              { updatePreview: true }
            );
          }
        )
      )
    );

    const previewSection = createSection("プレビュー");
    this.container.appendChild(previewSection);
    this.previewHost = previewSection;
    renderGrowthPreview(previewSection, draft);

    const assetsSection = createSection("見た目キー");
    this.container.appendChild(assetsSection);
    const assetsGrid = appendGrid(assetsSection);
    assetsGrid.appendChild(
      createFieldRow(
        "spriteKey",
        createTextInput(draft.class.spriteKey ?? "", (spriteKey) => {
          commitDraft((next) => {
            next.class.spriteKey = spriteKey.trim() || undefined;
          });
        })
      )
    );
    assetsGrid.appendChild(
      createFieldRow(
        "iconKey",
        createTextInput(draft.class.iconKey ?? "", (iconKey) => {
          commitDraft((next) => {
            next.class.iconKey = iconKey.trim() || undefined;
          });
        })
      )
    );

    if (!hideSave) {
      const actions = createEl("div", "editor-actions");
      const saveBtn = createActionButton(
        saving ? "保存中…" : "保存",
        "editor-btn editor-btn-primary",
        onSave
      );
      saveBtn.disabled = Boolean(saving);
      actions.appendChild(saveBtn);
      this.container.appendChild(actions);
    }
  }
}

export function loadClassDraftById(
  classes: ClassPresetBeforeEnrich[],
  classId: string
): ClassDraft {
  const preset = classes.find((cls) => cls.id === classId);
  return preset ? classDraftFromPreset(preset) : createEmptyClassDraft();
}
