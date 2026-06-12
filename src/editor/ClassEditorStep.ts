import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  FORMATION_ROW_OPTIONS,
  GROWTH_PRESET_KEY_LABELS,
  GROWTH_PRESET_KEY_OPTIONS,
  GROWTH_TIER_LABELS,
  GROWTH_TIER_OPTIONS,
  REG_OPTIONS,
  ROLE_OPTIONS,
  VFX_PRESET_OPTIONS,
} from "../battle/data/gameDataSchema.ts";
import type {
  DamageType,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  Role,
  SkillVfxPresetId,
} from "../battle/types.ts";
import {
  CONFIGURABLE_RANGE_PX_MAX,
  configurableRangeHintJa,
  formatRangeBandJa,
  parseConfigurableRangePxInput,
} from "../battle/rangeLimits.ts";
import levelCurvesJson from "../../data/levelCurves.json";
import {
  computeBasicAttackDps,
  computeEffectiveBasicAttackIntervalSec,
  formatBasicAttackDps,
} from "../progression/basicAttackPreview.ts";
import {
  computeStatsAtLevel,
  getBasicCooldownRate,
  loadLevelCurves,
  resolveStatGrowth,
} from "../progression/levelGrowth.ts";
import { computePreviewCombatStats } from "../progression/passiveStatPreview.ts";
import type { ClassPresetBeforeEnrich } from "../progression/skillUnlocks.ts";
import type { SkillRegistry } from "../battle/types.ts";
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
  createCollapsibleSection,
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
  back: "後列",
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

function formatPreviewStatLine(
  label: string,
  base: number,
  effective: number,
  perLevel: number,
): string {
  if (effective !== base) {
    return `${label}: ${effective}（基礎 ${base}、+${perLevel}/Lv、パッシブ込）`;
  }
  return `${label}: ${base}（+${perLevel}/Lv）`;
}

function renderGrowthPreview(
  parent: HTMLElement,
  classPreset: ClassPresetBeforeEnrich,
  skillRegistry?: SkillRegistry,
): void {
  ensureClassGrowthFields(classPreset);
  const growth = resolveStatGrowth(classPreset, LEVEL_CURVES);
  const preview = skillRegistry
    ? computePreviewCombatStats(
        classPreset,
        PREVIEW_LEVEL,
        LEVEL_CURVES,
        skillRegistry,
      )
    : null;
  const baseStats =
    preview?.base ??
    computeStatsAtLevel(
      {
        maxHp: classPreset.maxHp,
        atk: classPreset.atk,
        def: classPreset.def,
        reg: classPreset.reg,
      },
      classPreset,
      PREVIEW_LEVEL,
      LEVEL_CURVES,
    );
  const lv10 = preview?.effective ?? baseStats;

  const speedTier = classPreset.attackSpeedTier ?? "normal";
  const cdRate = getBasicCooldownRate(speedTier, LEVEL_CURVES);
  const attackSpeedMul = preview?.attackSpeedMultiplier ?? 1;
  const effectiveCd = computeEffectiveBasicAttackIntervalSec(
    speedTier,
    LEVEL_CURVES,
    DEFAULT_BASIC_INTERVAL_SEC,
    attackSpeedMul,
  );
  const basicDps = computeBasicAttackDps(
    lv10.atk,
    speedTier,
    LEVEL_CURVES,
    attackSpeedMul,
  );

  const box = createEl("div", "editor-preview");
  box.appendChild(
    createEl(
      "p",
      "editor-preview-title",
      `Lv${PREVIEW_LEVEL} 試算（Lv1 + 成長 × ${PREVIEW_LEVEL - 1}）`,
    ),
  );
  const list = createEl("ul", "editor-preview-list");
  for (const [label, effective, perLevel, base] of [
    ["HP", lv10.maxHp, growth.maxHp, baseStats?.maxHp ?? lv10.maxHp],
    ["ATK", lv10.atk, growth.atk, baseStats?.atk ?? lv10.atk],
    ["DEF", lv10.def, growth.def, baseStats?.def ?? lv10.def],
  ] as const) {
    const item = createEl("li");
    item.textContent = formatPreviewStatLine(label, base, effective, perLevel);
    list.appendChild(item);
  }
  if (preview && lv10.reg !== (baseStats?.reg ?? lv10.reg)) {
    const item = createEl("li");
    item.textContent = formatPreviewStatLine(
      "REG",
      baseStats?.reg ?? lv10.reg,
      lv10.reg,
      0,
    );
    list.appendChild(item);
  }
  box.appendChild(list);

  let speedNote =
    `攻撃速度: ${ATTACK_SPEED_TIER_LABELS[speedTier]}` +
    ` — 基本攻撃 CD 係数 ${cdRate.toFixed(3)}`;
  if (attackSpeedMul !== 1) {
    speedNote += ` × パッシブ ${attackSpeedMul.toFixed(3)}`;
  }
  speedNote +=
    `（interval ${DEFAULT_BASIC_INTERVAL_SEC}s 想定 → 約 ${effectiveCd.toFixed(2)}s/発` +
    `、基本攻撃 DPS ${formatBasicAttackDps(basicDps)}）`;
  box.appendChild(createEl("p", "editor-preview-note", speedNote));

  if (preview?.hasPassiveStatModifiers) {
    box.appendChild(
      createEl(
        "p",
        "editor-preview-note",
        "パッシブ: Lv 時点で習得済みの自身向け stat バフを満HP想定で反映（HP比率バフ・味方全体バフは除く）。",
      ),
    );
  }

  parent.appendChild(box);
}

export interface ClassEditorStepOptions {
  getDraft: () => ClassDraft;
  getPreviewClassPreset?: () => ClassPresetBeforeEnrich;
  getSkillRegistry?: () => SkillRegistry;
  classes: ClassPresetBeforeEnrich[];
  selectedClassId: string;
  onDraftChange: (draft: ClassDraft, options?: DraftChangeOptions) => void;
  onSelectClass: (classId: string) => void;
  onSave: () => void;
  saving?: boolean;
  hidePicker?: boolean;
  hideSave?: boolean;
  sectionExpandedState?: Map<string, boolean>;
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

  updatePreview(): void {
    if (!this.previewHost) return;
    const contentStart = this.previewHost.querySelector(".editor-preview");
    if (contentStart) contentStart.remove();
    const classPreset =
      this.options.getPreviewClassPreset?.() ?? this.options.getDraft().class;
    renderGrowthPreview(
      this.previewHost,
      classPreset,
      this.options.getSkillRegistry?.(),
    );
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
        preserveScrollDuring(() => this.updatePreview());
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
        select.appendChild(opt);
      }
      if (selectedClassId && classes.some((cls) => cls.id === selectedClassId)) {
        select.value = selectedClassId;
      }
      select.addEventListener("change", () => {
        if (select.value) onSelectClass(select.value);
      });
      picker.appendChild(createEl("span", "editor-picker-label", "既存クラス"));
      picker.appendChild(select);
      this.container.appendChild(picker);
    }

    const sectionExpandedState =
      this.options.sectionExpandedState ?? new Map<string, boolean>();

    const basicSummary = [
      ROLE_LABELS[draft.class.role],
      ROW_LABELS[draft.class.formationRow],
      `射程${draft.class.traits.rangePx ?? 0}px（${formatRangeBandJa(draft.class.traits.rangePx ?? 0)}）`,
      draft.class.traits.damageType ?? "physical",
    ].join(" · ");
    const { details: basicDetails, body: basicBody } = createCollapsibleSection({
      id: "class-basic",
      title: "基本",
      summaryExtra: basicSummary,
      expandedState: sectionExpandedState,
    });
    this.container.appendChild(basicDetails);
    const identityGrid = appendGrid(basicBody);
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
      identityGrid.appendChild(
        createFieldRow(
          "英語名 (epithetEn)",
          createTextInput(draft.class.epithetEn ?? "", (epithetEn) => {
            commitDraft((next) => {
              const trimmed = epithetEn.trim();
              if (trimmed) {
                next.class.epithetEn = trimmed;
              } else {
                delete next.class.epithetEn;
              }
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
        "射程 (px)",
        createNumberInput(
          draft.class.traits.rangePx ?? 0,
          (rangePx) => {
            commitDraft((next) => {
              next.class.traits.rangePx = rangePx;
            });
          },
          {
            min: 0,
            max: CONFIGURABLE_RANGE_PX_MAX,
            step: 1,
            parseInput: (raw) =>
              parseConfigurableRangePxInput(
                raw,
                draft.class.traits.rangePx ?? 0,
              ),
          },
        )
      )
    );
    identityGrid.appendChild(
      createEl("p", "editor-hint", configurableRangeHintJa())
    );
    identityGrid.appendChild(
      createFieldRow(
        "ダメージ種",
        createSelect(
          draft.class.traits.damageType ?? "physical",
          DAMAGE_TYPE_OPTIONS.map((value) => ({
            value,
            label: value,
          })),
          (damageType: DamageType) => {
            commitDraft((next) => {
              next.class.traits.damageType = damageType;
            }, { rerender: true });
          }
        )
      )
    );
    identityGrid.appendChild(
      createFieldRow(
        "通常攻撃 VFX",
        createSelect(
          draft.class.traits.basicAttackVfx?.preset ?? "",
          [
            { value: "", label: "（traits から自動）" },
            ...VFX_PRESET_OPTIONS.map((value) => ({
              value,
              label: value,
            })),
          ],
          (preset) => {
            commitDraft((next) => {
              if (!preset) {
                delete next.class.traits.basicAttackVfx;
                return;
              }
              next.class.traits.basicAttackVfx = {
                preset: preset as SkillVfxPresetId,
                ...(preset === "arrow" ? { arc: true } : {}),
              };
            }, { rerender: true });
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

    const statsSummary = `HP ${draft.class.maxHp} ATK ${draft.class.atk} DEF ${draft.class.def} REG ${draft.class.reg}`;
    const { details: statsDetails, body: statsBody } = createCollapsibleSection({
      id: "class-stats",
      title: "Lv1 ステータス",
      summaryExtra: statsSummary,
      expandedState: sectionExpandedState,
    });
    this.container.appendChild(statsDetails);
    statsBody.appendChild(
      createEl(
        "p",
        "editor-hint",
        "maxHp / atk / def は Lv1 基準値。reg と攻撃速度は Lv とともに変化しません。"
      )
    );
    const statsGrid = appendGrid(statsBody);
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
          {}
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
          {}
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
          {}
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

    const growthSummaryParts = [
      `HP:${GROWTH_TIER_LABELS[growthTier.maxHp]}`,
      `ATK:${GROWTH_TIER_LABELS[growthTier.atk]}`,
      `DEF:${GROWTH_TIER_LABELS[growthTier.def]}`,
    ];
    if (draft.class.role === "attacker") {
      const presetKey: GrowthPresetKey =
        draft.class.growthPresetKey === "caster" ? "caster" : "attacker";
      growthSummaryParts.push(GROWTH_PRESET_KEY_LABELS[presetKey]);
    }
    const { details: growthDetails, body: growthBody } = createCollapsibleSection({
      id: "class-growth",
      title: "成長段階（LvUP 加算）",
      summaryExtra: growthSummaryParts.join(" · "),
      expandedState: sectionExpandedState,
    });
    this.container.appendChild(growthDetails);
    growthBody.appendChild(
      createEl(
        "p",
        "editor-hint",
        "低・中・高は levelCurves.json の growthPresets から実数を解決します。"
      )
    );
    const growthGrid = appendGrid(growthBody);
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
        growthBody.appendChild(
          createEl(
            "p",
            "editor-hint",
            "caster: HP/DEF → supporter 表、ATK → attacker 表"
          )
        );
      }
    }

    const speedTier = draft.class.attackSpeedTier ?? "normal";
    const { details: speedDetails, body: speedBody } = createCollapsibleSection({
      id: "class-speed",
      title: "攻撃速度（基本攻撃 CD）",
      summaryExtra: ATTACK_SPEED_TIER_LABELS[speedTier],
      expandedState: sectionExpandedState,
    });
    this.container.appendChild(speedDetails);
    const speedGrid = appendGrid(speedBody);
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
    previewSection.classList.add("editor-panel-preview-emphasis");
    this.container.appendChild(previewSection);
    this.previewHost = previewSection;
    const previewClassPreset =
      this.options.getPreviewClassPreset?.() ?? draft.class;
    renderGrowthPreview(
      previewSection,
      previewClassPreset,
      this.options.getSkillRegistry?.(),
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
