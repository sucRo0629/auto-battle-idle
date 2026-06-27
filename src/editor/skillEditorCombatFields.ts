import {
  BUFF_FILTER_TAGS,
  DAMAGE_INCREASE_CONDITION_KIND_LABELS,
  DAMAGE_INCREASE_CONDITION_KINDS,
  DEBUFF_FILTER_TAGS,
  DOT_FLAVOR_LABELS,
  DOT_FLAVORS,
  DISPEL_PRIORITIES,
  DISPEL_PRIORITY_LABELS,
  DEFENSE_IGNORE_DEF_MODE_LABELS,
  DEFENSE_IGNORE_DEF_MODES,
  ENEMY_COUNT_SCOPE_LABELS,
  ENEMY_COUNT_SCOPES,
  FIRE_CONDITION_KIND_LABELS,
  FIRE_CONDITION_KIND_OPTIONS,
  type FireConditionKind,
  FIRE_POLICY_LABELS,
  FIRE_POLICY_OPTIONS,
  HP_RATIO_COMPARE_LABELS,
  HP_RATIO_COMPARE_OPTIONS,
  HEAL_SUB_KINDS,
  HEAL_SUB_KIND_LABELS,
  TARGET_DISTANCE_ORDER_LABELS,
  TARGET_DISTANCE_ORDER_OPTIONS,
  TARGET_SIDE_LABELS,
  TARGET_SPEC_KIND_LABELS,
  TARGET_SPEC_KINDS,
  TARGET_STAT_LABELS,
  TARGET_STAT_ORDER_LABELS,
  TARGET_STAT_OPTIONS,
  TARGET_STAT_ORDER_OPTIONS,
} from "../battle/data/gameDataSchema.ts";
import { GLOBAL_MAX_CHARGES_CAP } from "../battle/skills/chargeBank.ts";
import {
  formatTargetLabel,
  distanceSpecIncludesSelf,
  normalizeTarget,
} from "../battle/skills/targetSpec.ts";
import {
  PASSIVE_DISPEL_TRIGGER_KINDS,
  PASSIVE_PERIODIC_TRIGGER_LABELS,
  isPassiveBarrierBuff,
  resolvePassivePeriodicTrigger,
  usesBuffAuraMode,
  usesDebuffAuraMode,
  usesHotAuraMode,
  usesPassiveTriggerChance,
} from "../battle/passivePeriodicTrigger.ts";
import type { PassiveDispelTriggerKind } from "../battle/passivePeriodicTrigger.ts";
import {
  applyBuffEffectToPassive,
  passiveBuffToEffectDef,
} from "../battle/passiveBuffBridge.ts";
import {
  applyDamageReductionEffectToPassive,
  passiveDamageReductionToEffectDef,
} from "../battle/passiveDamageReductionBridge.ts";
import {
  applyHotEffectToPassive,
  passiveHotToEffectDef,
} from "../battle/passiveHotBridge.ts";
import {
  applyDebuffEffectToPassive,
  passiveDebuffToEffectDef,
} from "../battle/passiveDebuffBridge.ts";
import {
  applyDispelEffectToPassive,
  passiveDispelToEffectDef,
} from "../battle/passiveDispelBridge.ts";
import type {
  ActiveSkillDef,
  BuffSubKind,
  DebuffSubKind,
  BuffFilterTag,
  DamageIncreaseCondition,
  DamageIncreaseSpec,
  DebuffFilterTag,
  DispelPriority,
  DefenseIgnoreSpec,
  FireCondition,
  FirePolicy,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillEffectDef,
  SpecialEffectApplyTo,
  StatusEffectStat,
  TargetSpec,
} from "../battle/types.ts";
import { attackTypeRangedBandEditorHintJa } from "../battle/rangeLimits.ts";
import {
  defaultStatBuffModifierEntry,
  parseStatBuffModifiers,
  syncPassiveBuffStatModifiers,
} from "../battle/statBuffModifiers.ts";
import type { StatBuffModifierEntry } from "../battle/types.ts";
import type { TargetSpecKind } from "../battle/data/gameDataSchema.ts";
import {
  createActionButton,
  createButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSelect,
  createSection,
} from "./formUtils.ts";
import { appendSkillEffectTargetingFields } from "./effectTargetingFields.ts";
import type { ActiveSkillDef } from "../battle/types.ts";

function defaultDamageIncrease(): DamageIncreaseSpec {
  return {
    scale: 1.2,
    conditions: [{ kind: "debuff", tags: ["def"] }],
  };
}

function defaultDefenseIgnore(): DefenseIgnoreSpec {
  return { def: { mode: "percent", amount: 0.2 } };
}

export function appendDebuffFilterCheckboxes(
  parent: HTMLElement,
  selected: DebuffFilterTag[],
  onChange: (tags: DebuffFilterTag[]) => void
): void {
  const wrap = createEl("div", "editor-debuff-tag-checkboxes");
  for (const tag of DEBUFF_FILTER_TAGS) {
    const row = createEl("div", "editor-field editor-field-checkbox");
    const input = createEl("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = selected.includes(tag.id);
    input.addEventListener("change", () => {
      const next = new Set(selected);
      if (input.checked) next.add(tag.id);
      else next.delete(tag.id);
      onChange([...next]);
    });
    row.appendChild(createEl("label", undefined, tag.label));
    row.appendChild(input);
    wrap.appendChild(row);
  }
  parent.appendChild(wrap);
}

function appendDamageIncreaseConditionFields(
  parent: HTMLElement,
  condition: DamageIncreaseCondition,
  onChange: (
    condition: DamageIncreaseCondition,
    options?: CombatFieldChangeOptions
  ) => void,
  onRemove: () => void
): void {
  const card = createEl("div", "editor-condition-card");
  card.appendChild(
    createFieldRow(
      "条件種別",
      createSelect(
        condition.kind,
        DAMAGE_INCREASE_CONDITION_KINDS.map((kind) => ({
          value: kind,
          label: DAMAGE_INCREASE_CONDITION_KIND_LABELS[kind],
        })),
        (kind) => {
          if (kind === "debuff") {
            onChange({ kind, tags: ["def"] }, { rerender: true });
          } else if (kind === "attackType") {
            onChange({ kind: "attackType", ranged: true }, { rerender: true });
          } else if (kind === "hasDot") {
            onChange({ kind: "hasDot" }, { rerender: true });
          } else {
            onChange({ kind: "targetHp", maxHpRatio: 0.5 }, { rerender: true });
          }
        }
      )
    )
  );

  if (condition.kind === "debuff") {
    card.appendChild(createEl("p", "editor-hint", "対象デバフ（いずれか）"));
    appendDebuffFilterCheckboxes(card, condition.tags, (tags) => {
      onChange({ ...condition, tags }, { rerender: false });
    });
    card.appendChild(
      createFieldRow(
        "自分付与のみ",
        createSelect(
          condition.selfAppliedOnly ? "true" : "false",
          [
            { value: "false", label: "いいえ" },
            { value: "true", label: "はい" },
          ],
          (value) => {
            onChange(
              {
                ...condition,
                selfAppliedOnly: value === "true" || undefined,
              },
              { rerender: false }
            );
          }
        )
      )
    );
  } else if (condition.kind === "targetHp") {
    card.appendChild(
      createFieldRow(
        "対象HP残り割合以下",
        createNumberInput(
          condition.maxHpRatio,
          (maxHpRatio) =>
            onChange({ ...condition, maxHpRatio }, { rerender: false }),
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
  } else if (condition.kind === "attackType") {
    const attackRow = createEl("div", "editor-debuff-tag-checkboxes");
    for (const [key, label] of [
      ["physical", "物理"],
      ["magic", "魔法"],
      ["melee", "近接"],
      ["ranged", "遠隔"],
    ] as const) {
      const row = createEl("div", "editor-field editor-field-checkbox");
      const input = createEl("input") as HTMLInputElement;
      input.type = "checkbox";
      input.checked = condition[key] === true;
      input.addEventListener("change", () => {
        const next = { ...condition, [key]: input.checked ? true : undefined };
        const hasAny = next.physical || next.magic || next.melee || next.ranged;
        if (hasAny) onChange(next, { rerender: false });
      });
      row.appendChild(createEl("label", undefined, label));
      row.appendChild(input);
      attackRow.appendChild(row);
    }
    card.appendChild(attackRow);
    card.appendChild(
      createEl("p", "editor-hint", attackTypeRangedBandEditorHintJa())
    );
  } else if (condition.kind === "hasDot") {
    card.appendChild(
      createEl("p", "editor-hint", "対象が DoT 中（overlay: dot）のときに成立")
    );
  }

  card.appendChild(
    createActionButton("条件を削除", "editor-btn editor-btn-small", onRemove)
  );
  parent.appendChild(card);
}

export function appendDamageIncreaseConditionListFields(
  parent: HTMLElement,
  conditions: DamageIncreaseCondition[],
  onChange: (
    mutate: (current: DamageIncreaseCondition[]) => DamageIncreaseCondition[],
    options?: CombatFieldChangeOptions
  ) => void,
  options?: { addButtonLabel?: string; title?: string }
): void {
  if (options?.title) {
    parent.appendChild(
      createEl("h4", "editor-subsection-title", options.title)
    );
  }
  const conditionsWrap = createEl("div", "editor-conditions-list");
  conditions.forEach((condition, index) => {
    appendDamageIncreaseConditionFields(
      conditionsWrap,
      condition,
      (next, changeOptions) => {
        onChange((current) => {
          const nextConditions = [...current];
          nextConditions[index] = next;
          return nextConditions;
        }, changeOptions);
      },
      () => {
        onChange(
          (current) => current.filter((_, i) => i !== index),
          { rerender: false }
        );
      }
    );
  });
  parent.appendChild(conditionsWrap);
  parent.appendChild(
    createActionButton(
      options?.addButtonLabel ?? "条件を追加",
      "editor-btn editor-btn-small",
      () => {
        onChange(
          (current) => [...current, { kind: "debuff", tags: ["def"] }],
          { rerender: false }
        );
      }
    )
  );
}

type CombatFieldChangeOptions = { rerender?: boolean };

export function appendDamageIncreaseFields(
  parent: HTMLElement,
  spec: DamageIncreaseSpec | undefined,
  onChange: (
    spec: DamageIncreaseSpec | undefined,
    options?: CombatFieldChangeOptions
  ) => void,
  options?: { title?: string }
): void {
  const section = createEl("div", "editor-subsection");
  section.appendChild(
    createEl("h4", "editor-subsection-title", options?.title ?? "特効ダメージ")
  );

  const enabledRow = createEl("div", "editor-field editor-field-checkbox");
  const enabledInput = createEl("input") as HTMLInputElement;
  enabledInput.type = "checkbox";
  enabledInput.checked = Boolean(spec);
  enabledInput.addEventListener("change", () => {
    onChange(enabledInput.checked ? defaultDamageIncrease() : undefined, {
      rerender: true,
    });
  });
  enabledRow.appendChild(createEl("label", undefined, "有効"));
  enabledRow.appendChild(enabledInput);
  section.appendChild(enabledRow);

  if (!spec) {
    parent.appendChild(section);
    return;
  }

  section.appendChild(
    createFieldRow(
      "倍率 scale",
      createNumberInput(
        spec.scale,
        (scale) => onChange({ ...spec, scale }, { rerender: false }),
        { step: 0.01 }
      )
    )
  );

  const conditionsWrap = createEl("div", "editor-conditions-list");
  spec.conditions.forEach((condition, index) => {
    appendDamageIncreaseConditionFields(
      conditionsWrap,
      condition,
      (next, changeOptions) => {
        const conditions = [...spec.conditions];
        conditions[index] = next;
        onChange({ ...spec, conditions }, changeOptions);
      },
      () => {
        const conditions = spec.conditions.filter((_, i) => i !== index);
        onChange(
          conditions.length > 0
            ? { ...spec, conditions }
            : { ...spec, conditions: [{ kind: "debuff", tags: ["def"] }] },
          { rerender: false }
        );
      }
    );
  });
  section.appendChild(conditionsWrap);
  section.appendChild(
    createActionButton("増加条件を追加", "editor-btn editor-btn-small", () => {
      onChange(
        {
          ...spec,
          conditions: [...spec.conditions, { kind: "debuff", tags: ["def"] }],
        },
        { rerender: false }
      );
    })
  );
  parent.appendChild(section);
}

export function appendDefenseIgnoreFields(
  parent: HTMLElement,
  spec: DefenseIgnoreSpec | undefined,
  onChange: (
    spec: DefenseIgnoreSpec | undefined,
    options?: CombatFieldChangeOptions
  ) => void
): void {
  const section = createEl("div", "editor-subsection");
  section.appendChild(createEl("h4", "editor-subsection-title", "防御無視"));

  const enabledRow = createEl("div", "editor-field editor-field-checkbox");
  const enabledInput = createEl("input") as HTMLInputElement;
  enabledInput.type = "checkbox";
  enabledInput.checked = Boolean(spec);
  enabledInput.addEventListener("change", () => {
    onChange(enabledInput.checked ? defaultDefenseIgnore() : undefined, {
      rerender: true,
    });
  });
  enabledRow.appendChild(createEl("label", undefined, "有効"));
  enabledRow.appendChild(enabledInput);
  section.appendChild(enabledRow);

  if (!spec) {
    parent.appendChild(section);
    return;
  }

  section.appendChild(
    createFieldRow(
      "発動確率 (0–1)",
      createNumberInput(
        spec.chance ?? 1,
        (chance) => {
          onChange(
            {
              ...spec,
              chance: chance >= 1 ? undefined : chance,
            },
            { rerender: false }
          );
        },
        { min: 0, max: 1, step: 0.01 }
      )
    )
  );

  const defEnabled = Boolean(spec.def);
  const defEnableRow = createEl("div", "editor-field editor-field-checkbox");
  const defEnableInput = createEl("input") as HTMLInputElement;
  defEnableInput.type = "checkbox";
  defEnableInput.checked = defEnabled;
  defEnableInput.addEventListener("change", () => {
    if (defEnableInput.checked) {
      onChange(
        { ...spec, def: { mode: "percent", amount: 0.2 } },
        { rerender: true }
      );
    } else {
      const next = { ...spec };
      delete next.def;
      onChange(Object.keys(next).length > 1 ? next : undefined, {
        rerender: true,
      });
    }
  });
  defEnableRow.appendChild(createEl("label", undefined, "DEF 無視"));
  defEnableRow.appendChild(defEnableInput);
  section.appendChild(defEnableRow);

  if (spec.def) {
    section.appendChild(
      createFieldRow(
        "DEF 無視方式",
        createSelect(
          spec.def.mode,
          DEFENSE_IGNORE_DEF_MODES.map((mode) => ({
            value: mode,
            label: DEFENSE_IGNORE_DEF_MODE_LABELS[mode],
          })),
          (mode) => {
            onChange(
              {
                ...spec,
                def: {
                  mode: mode as "flat" | "percent",
                  amount: spec.def!.amount,
                },
              },
              { rerender: false }
            );
          }
        )
      )
    );
    section.appendChild(
      createFieldRow(
        spec.def.mode === "flat" ? "DEF 固定値" : "DEF 割合 (0–1)",
        createNumberInput(
          spec.def.amount,
          (amount) => {
            onChange(
              { ...spec, def: { ...spec.def!, amount } },
              { rerender: false }
            );
          },
          { step: 0.01 }
        )
      )
    );
  }

  const regEnabled = Boolean(spec.reg);
  const regEnableRow = createEl("div", "editor-field editor-field-checkbox");
  const regEnableInput = createEl("input") as HTMLInputElement;
  regEnableInput.type = "checkbox";
  regEnableInput.checked = regEnabled;
  regEnableInput.addEventListener("change", () => {
    if (regEnableInput.checked) {
      onChange({ ...spec, reg: { percent: 0.2 } }, { rerender: true });
    } else {
      const next = { ...spec };
      delete next.reg;
      onChange(next.def || next.reg ? next : undefined, { rerender: true });
    }
  });
  regEnableRow.appendChild(createEl("label", undefined, "REG無視"));
  regEnableRow.appendChild(regEnableInput);
  section.appendChild(regEnableRow);

  if (spec.reg) {
    section.appendChild(
      createFieldRow(
        "REG割合 (0–1)",
        createNumberInput(
          spec.reg.percent,
          (percent) => {
            onChange({ ...spec, reg: { percent } }, { rerender: false });
          },
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
  }

  parent.appendChild(section);
}

export function appendDispelEffectFields(
  parent: HTMLElement,
  effect: Extract<SkillEffectDef, { type: "dispel" }>,
  patchEffect: (
    patch: SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef),
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createFieldRow(
      "解除数 (0=すべて)",
      createNumberInput(
        effect.dispelCount,
        (dispelCount) => {
          patchEffect((prev) =>
            prev.type === "dispel" ? { ...prev, dispelCount } : prev
          );
        },
        { min: 0, step: 1 }
      )
    )
  );
  parent.appendChild(
    createFieldRow(
      "解除優先度",
      createSelect(
        effect.dispelPriority ?? "longest",
        DISPEL_PRIORITIES.map((value) => ({
          value,
          label: DISPEL_PRIORITY_LABELS[value],
        })),
        (dispelPriority: DispelPriority) => {
          patchEffect((prev) =>
            prev.type === "dispel"
              ? {
                  ...prev,
                  dispelPriority:
                    dispelPriority === "longest" ? undefined : dispelPriority,
                }
              : prev
          );
        }
      )
    )
  );
  parent.appendChild(
    createEl("p", "editor-hint", "解除対象デバフ（未選択=すべて）")
  );
  appendDebuffFilterCheckboxes(parent, effect.dispelTags ?? [], (tags) => {
    patchEffect((prev) =>
      prev.type === "dispel"
        ? { ...prev, dispelTags: tags.length > 0 ? tags : undefined }
        : prev
    );
  });
}

function appendOptionalPassiveNumberField(
  parent: HTMLElement,
  label: string,
  value: number | undefined,
  onChange: (next: number | undefined) => void,
  options: {
    min?: number;
    max?: number;
    step?: number;
    emptyWhen?: number;
    placeholder?: string;
  } = {}
): void {
  parent.appendChild(
    createFieldRow(
      label,
      createNumberInput(
        value ?? options.emptyWhen ?? 0,
        (next) => {
          const emptyWhen = options.emptyWhen ?? 0;
          onChange(next === emptyWhen ? undefined : next);
        },
        {
          min: options.min,
          max: options.max,
          step: options.step ?? 0.01,
          emptyWhen: options.emptyWhen ?? 0,
          placeholder: options.placeholder ?? "未設定",
        }
      )
    )
  );
}

export function appendPassiveThreatControlFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createEl(
      "p",
      "editor-hint",
      "ヘイト維持・上昇。被ダメ / ブロック / 前列 aura のいずれかを 1 つ以上設定してください。"
    )
  );
  appendOptionalPassiveNumberField(
    parent,
    "被ダメ時ヘイト加算（固定）",
    passive.onDamageTakenFlat,
    (onDamageTakenFlat) => {
      patchPassive((current) => {
        if (onDamageTakenFlat === undefined) {
          delete current.onDamageTakenFlat;
        } else {
          current.onDamageTakenFlat = onDamageTakenFlat;
        }
      });
    },
    { min: 0, step: 1 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "被ダメ時ヘイト係数",
    passive.onDamageTakenScale,
    (onDamageTakenScale) => {
      patchPassive((current) => {
        if (onDamageTakenScale === undefined) {
          delete current.onDamageTakenScale;
        } else {
          current.onDamageTakenScale = onDamageTakenScale;
        }
      });
    },
    { min: 0, step: 0.05 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "ブロック成功時ヘイト加算（固定）",
    passive.onBlockFlat,
    (onBlockFlat) => {
      patchPassive((current) => {
        if (onBlockFlat === undefined) {
          delete current.onBlockFlat;
        } else {
          current.onBlockFlat = onBlockFlat;
        }
      });
    },
    { min: 0, step: 1 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "自身ヘイト減衰倍率",
    passive.threatDecayMultiplier,
    (threatDecayMultiplier) => {
      patchPassive((current) => {
        if (threatDecayMultiplier === undefined) {
          delete current.threatDecayMultiplier;
        } else {
          current.threatDecayMultiplier = threatDecayMultiplier;
        }
      });
    },
    { min: 0.01, step: 0.05 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "前列ヘイト下限（source × ratio）",
    passive.frontThreatFloor,
    (frontThreatFloor) => {
      patchPassive((current) => {
        if (frontThreatFloor === undefined) {
          delete current.frontThreatFloor;
        } else {
          current.frontThreatFloor = frontThreatFloor;
        }
      });
    },
    { min: 0.01, max: 1, step: 0.01 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "前列ヘイト減衰倍率",
    passive.frontThreatDecayMultiplier,
    (frontThreatDecayMultiplier) => {
      patchPassive((current) => {
        if (frontThreatDecayMultiplier === undefined) {
          delete current.frontThreatDecayMultiplier;
        } else {
          current.frontThreatDecayMultiplier = frontThreatDecayMultiplier;
        }
      });
    },
    { min: 0.01, step: 0.05 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "前列被ダメ軽減率（0〜1）",
    passive.frontDamageTakenReduction,
    (frontDamageTakenReduction) => {
      patchPassive((current) => {
        if (frontDamageTakenReduction === undefined) {
          delete current.frontDamageTakenReduction;
        } else {
          current.frontDamageTakenReduction = frontDamageTakenReduction;
        }
      });
    },
    { min: 0, max: 0.99, step: 0.01 }
  );
}

export function appendThreatBurstFields(
  parent: HTMLElement,
  effect: Extract<SkillEffectDef, { type: "damage" }>,
  patchEffect: (
    patch: SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef),
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createEl(
      "p",
      "editor-hint",
      "バーストヘイト: 与ダメ成功時の追加ヘイト。通常攻撃には付けません。"
    )
  );
  appendOptionalPassiveNumberField(
    parent,
    "バーストヘイト固定",
    effect.threatBurstFlat,
    (threatBurstFlat) => {
      patchEffect((prev) => {
        if (prev.type !== "damage") return prev;
        const next = { ...prev };
        if (threatBurstFlat === undefined) {
          delete next.threatBurstFlat;
        } else {
          next.threatBurstFlat = threatBurstFlat;
        }
        return next;
      });
    },
    { min: 0, step: 1 }
  );
  appendOptionalPassiveNumberField(
    parent,
    "バーストヘイト係数（appliedDamage ×）",
    effect.threatBurstScale,
    (threatBurstScale) => {
      patchEffect((prev) => {
        if (prev.type !== "damage") return prev;
        const next = { ...prev };
        if (threatBurstScale === undefined) {
          delete next.threatBurstScale;
        } else {
          next.threatBurstScale = threatBurstScale;
        }
        return next;
      });
    },
    { min: 0, step: 0.05 }
  );
}

export function appendDamagePierceFields(
  parent: HTMLElement,
  effect: Extract<SkillEffectDef, { type: "damage" }>,
  patchEffect: (
    patch: SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef),
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createEl(
      "p",
      "editor-hint",
      "貫通フラグ: 断鉄など全軽減貫通用。回避は v1 では対象外。"
    )
  );
  for (const [field, label] of [
    ["ignoreDamageTakenReduction", "DR無視（damageTakenMul=1）"],
    ["pierceBlock", "block 貫通"],
    ["pierceWard", "障壁（wardBarrier）貫通"],
    ["pierceBarrier", "barrierHp 貫通"],
  ] as const) {
    const row = createEl("div", "editor-field editor-field-checkbox");
    const input = createEl("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = effect[field] === true;
    input.addEventListener("change", () => {
      patchEffect((prev) => {
        if (prev.type !== "damage") return prev;
        const next = { ...prev };
        if (input.checked) {
          next[field] = true;
        } else {
          delete next[field];
        }
        return next;
      });
    });
    row.appendChild(createEl("label", undefined, label));
    row.appendChild(input);
    parent.appendChild(row);
  }
}

export function appendPassiveDamageReductionFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  options: { traitsRangePx?: number } = {}
): void {
  appendTargetSpecFields(
    parent,
    passive.damageReductionTargetRule ?? { kind: "self" },
    (damageReductionTargetRule) => {
      patchPassive(
        (current) => {
          current.damageReductionTargetRule = damageReductionTargetRule;
        },
        { rerender: true }
      );
    }
  );
  appendSkillEffectTargetingFields(
    parent,
    passiveDamageReductionToEffectDef(passive),
    (patch, patchOptions) => {
      patchPassive((current) => {
        const prev = passiveDamageReductionToEffectDef(current);
        applyDamageReductionEffectToPassive(current, {
          ...prev,
          ...patch(prev),
        });
      }, patchOptions);
    },
    { traitsRangePx: options.traitsRangePx ?? 0 }
  );
  parent.appendChild(
    createFieldRow(
      "軽減率 (0–1)",
      createNumberInput(
        passive.damageReductionPercent ?? 0,
        (damageReductionPercent) => {
          patchPassive((current) => {
            current.damageReductionPercent = damageReductionPercent;
          });
        },
        { min: 0, max: 1, step: 0.01 }
      )
    )
  );
}

type PassivePeriodicEditorMode = "aura" | "stageStart" | "waveStart";

function resolvePassivePeriodicEditorMode(
  passive: PassiveSkillDef,
  allowAura: boolean
): PassivePeriodicEditorMode {
  if (allowAura && usesHotAuraMode(passive)) return "aura";
  const trigger = resolvePassivePeriodicTrigger(passive);
  if (trigger === "stageStart" || trigger === "waveStart") return trigger;
  if (isPassiveBarrierBuff(passive)) return "stageStart";
  return allowAura ? "aura" : "stageStart";
}

function appendPassivePeriodicTriggerFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  options: { allowAura?: boolean } = {}
): void {
  const allowAura = options.allowAura ?? false;
  const mode = resolvePassivePeriodicEditorMode(passive, allowAura);
  const choices: Array<{ value: PassivePeriodicEditorMode; label: string }> = [
    ...(allowAura ? [{ value: "aura" as const, label: "常時" }] : []),
    { value: "stageStart", label: PASSIVE_PERIODIC_TRIGGER_LABELS.stageStart },
    { value: "waveStart", label: PASSIVE_PERIODIC_TRIGGER_LABELS.waveStart },
  ];

  parent.appendChild(
    createFieldRow(
      "発動タイミング",
      createSelect(mode, choices, (nextMode) => {
        patchPassive(
          (current) => {
            delete current.periodicTrigger;
            delete current.intervalSec;
            if (nextMode === "stageStart" || nextMode === "waveStart") {
              current.periodicTrigger = nextMode;
            } else if (usesPassiveTriggerChance(current)) {
              delete current.chance;
            }
          },
          { rerender: true }
        );
      })
    )
  );

  if (mode !== "aura" && usesPassiveTriggerChance(passive)) {
    parent.appendChild(
      createFieldRow(
        "発動確率 (0–1)",
        createNumberInput(
          passive.chance ?? 1,
          (chance) => {
            patchPassive(
              (current) => {
                if (chance >= 1) {
                  delete current.chance;
                } else {
                  current.chance = chance;
                }
              },
              { rerender: false }
            );
          },
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
  }
}

type PassiveDispelEditorMode = PassiveDispelTriggerKind;

function resolvePassiveDispelEditorMode(
  passive: PassiveSkillDef
): PassiveDispelEditorMode {
  const trigger = resolvePassivePeriodicTrigger(passive);
  if (trigger === "onDebuffReceived") return trigger;
  if (trigger === "stageStart" || trigger === "waveStart") return trigger;
  return "waveStart";
}

function appendPassiveDispelTriggerFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  const mode = resolvePassiveDispelEditorMode(passive);
  const choices = PASSIVE_DISPEL_TRIGGER_KINDS.map((value) => ({
    value,
    label: PASSIVE_PERIODIC_TRIGGER_LABELS[value],
  }));

  parent.appendChild(
    createFieldRow(
      "発動タイミング",
      createSelect(mode, choices, (nextMode) => {
        patchPassive(
          (current) => {
            delete current.intervalSec;
            current.periodicTrigger = nextMode;
          },
          { rerender: true }
        );
      })
    )
  );

  parent.appendChild(
    createFieldRow(
      "発動回数 (Waveごと)",
      createNumberInput(
        passive.dispelTriggerLimit ?? 0,
        (dispelTriggerLimit) => {
          patchPassive((current) => {
            if (dispelTriggerLimit <= 0) {
              delete current.dispelTriggerLimit;
            } else {
              current.dispelTriggerLimit = dispelTriggerLimit;
            }
          });
        },
        { min: 0, step: 1 }
      )
    )
  );
  parent.appendChild(
    createEl("p", "editor-hint", "1 Wave 内の発動上限。0 または未指定 = 無制限")
  );

  if (usesPassiveTriggerChance(passive)) {
    parent.appendChild(
      createFieldRow(
        "発動確率 (0–1)",
        createNumberInput(
          passive.chance ?? 1,
          (chance) => {
            patchPassive(
              (current) => {
                if (chance >= 1) {
                  delete current.chance;
                } else {
                  current.chance = chance;
                }
              },
              { rerender: false }
            );
          },
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
  }
}

export function appendPassiveBarrierFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  appendResourceAmountFields: (
    grid: HTMLElement,
    amount: ResourceAmountSpec,
    onUpdate: (
      amount: ResourceAmountSpec,
      options?: { rerender?: boolean }
    ) => void
  ) => void
): void {
  appendPassivePeriodicTriggerFields(parent, passive, patchPassive);
  appendResourceAmountFields(
    parent,
    passive.barrierAmount ?? { kind: "defBased", defScale: 0.5 },
    (amount, options) => {
      patchPassive((current) => {
        current.barrierAmount = amount;
      }, options);
    }
  );
}

export function appendPassiveHealFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  appendResourceAmountFields: (
    grid: HTMLElement,
    amount: ResourceAmountSpec,
    onUpdate: (
      amount: ResourceAmountSpec,
      options?: { rerender?: boolean }
    ) => void
  ) => void,
  options: { traitsRangePx?: number } = {}
): void {
  parent.appendChild(
    createFieldRow(
      "回復種別",
      createSelect(
        passive.healSubKind ?? "hot",
        HEAL_SUB_KINDS.map((value) => ({
          value,
          label: HEAL_SUB_KIND_LABELS[value],
        })),
        (healSubKind) => {
          patchPassive(
            (current) => {
              current.healSubKind = healSubKind;
            },
            { rerender: true }
          );
        }
      )
    )
  );
  if ((passive.healSubKind ?? "hot") !== "hot") {
    parent.appendChild(
      createEl("p", "editor-hint", "パッシブ回復は HoT のみ対応しています。")
    );
    return;
  }
  appendPassivePeriodicTriggerFields(parent, passive, patchPassive, {
    allowAura: true,
  });
  parent.appendChild(
    createFieldRow(
      "効果時間 (秒, 0=無限)",
      createNumberInput(
        passive.hotDurationSec ?? 0,
        (hotDurationSec) => {
          patchPassive((current) => {
            current.hotDurationSec = hotDurationSec;
          });
        },
        { min: 0, step: 0.1 }
      )
    )
  );
  appendTargetSpecFields(
    parent,
    passive.hotTargetRule ?? { kind: "self" },
    (hotTargetRule) => {
      patchPassive(
        (current) => {
          current.hotTargetRule = hotTargetRule;
        },
        { rerender: true }
      );
    }
  );
  appendSkillEffectTargetingFields(
    parent,
    passiveHotToEffectDef(passive),
    (patch, patchOptions) => {
      patchPassive((current) => {
        const prev = passiveHotToEffectDef(current);
        applyHotEffectToPassive(current, { ...prev, ...patch(prev) });
      }, patchOptions);
    },
    { traitsRangePx: options.traitsRangePx ?? 0 }
  );
  appendResourceAmountFields(
    parent,
    passive.hotAmount ?? { kind: "atkBased", atkScale: 0.05 },
    (amount, options) => {
      patchPassive((current) => {
        current.hotAmount = amount;
      }, options);
    }
  );
}

export function appendPassiveDispelFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  options: { traitsRangePx?: number } = {}
): void {
  appendPassiveDispelTriggerFields(parent, passive, patchPassive);
  appendTargetSpecFields(
    parent,
    passive.dispelTargetRule ?? { kind: "self" },
    (dispelTargetRule) => {
      patchPassive(
        (current) => {
          current.dispelTargetRule = dispelTargetRule;
        },
        { rerender: true }
      );
    }
  );
  appendSkillEffectTargetingFields(
    parent,
    passiveDispelToEffectDef(passive),
    (patch, patchOptions) => {
      patchPassive((current) => {
        const prev = passiveDispelToEffectDef(current);
        applyDispelEffectToPassive(current, { ...prev, ...patch(prev) });
      }, patchOptions);
    },
    { traitsRangePx: options.traitsRangePx ?? 0 }
  );
  parent.appendChild(
    createFieldRow(
      "解除数 (0=すべて)",
      createNumberInput(
        passive.dispelCount ?? 0,
        (dispelCount) => {
          patchPassive((current) => {
            current.dispelCount = dispelCount;
          });
        },
        { min: 0, step: 1 }
      )
    )
  );
  parent.appendChild(
    createFieldRow(
      "解除優先度",
      createSelect(
        passive.dispelPriority ?? "longest",
        DISPEL_PRIORITIES.map((value) => ({
          value,
          label: DISPEL_PRIORITY_LABELS[value],
        })),
        (dispelPriority: DispelPriority) => {
          patchPassive((current) => {
            current.dispelPriority =
              dispelPriority === "longest" ? undefined : dispelPriority;
          });
        }
      )
    )
  );
  parent.appendChild(
    createEl("p", "editor-hint", "解除対象デバフ（未選択=すべて）")
  );
  appendDebuffFilterCheckboxes(parent, passive.dispelTags ?? [], (tags) => {
    patchPassive((current) => {
      current.dispelTags = tags.length > 0 ? tags : undefined;
    });
  });
}

function targetSpecKind(spec: TargetSpec): TargetSpecKind {
  return spec.kind;
}

function defaultTargetForKind(kind: TargetSpecKind): TargetSpec {
  switch (kind) {
    case "self":
      return { kind: "self" };
    case "all":
      return { kind: "all", side: "ally" };
    case "distance":
      return { kind: "distance", side: "enemy", order: "nearest" };
    case "stat":
      return { kind: "stat", side: "enemy", stat: "hp", order: "lowest" };
    case "attackType":
      return { kind: "attackType", physical: true };
    case "status":
      return { kind: "status", side: "enemy", debuffTags: ["def"] };
    case "clusterCenter":
      return { kind: "clusterCenter", side: "enemy" };
    default:
      return { kind: "self" };
  }
}

function appendStatusTagCheckboxes(
  parent: HTMLElement,
  debuffTags: DebuffFilterTag[],
  buffTags: BuffFilterTag[],
  onChange: (debuffTags: DebuffFilterTag[], buffTags: BuffFilterTag[]) => void
): void {
  parent.appendChild(createEl("p", "editor-hint", "デバフ（いずれか）"));
  appendDebuffFilterCheckboxes(parent, debuffTags, (nextDebuff) => {
    onChange(nextDebuff, buffTags);
  });
  parent.appendChild(createEl("p", "editor-hint", "バフ（いずれか）"));
  const buffWrap = createEl("div", "editor-debuff-tag-checkboxes");
  for (const tag of BUFF_FILTER_TAGS) {
    const row = createEl("div", "editor-field editor-field-checkbox");
    const input = createEl("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = buffTags.includes(tag.id);
    input.addEventListener("change", () => {
      const next = new Set(buffTags);
      if (input.checked) next.add(tag.id);
      else next.delete(tag.id);
      onChange(debuffTags, [...next]);
    });
    row.appendChild(createEl("label", undefined, tag.label));
    row.appendChild(input);
    buffWrap.appendChild(row);
  }
  parent.appendChild(buffWrap);
}

export interface AppendTargetSpecFieldsOptions {
  /** 貫通形状時: 距離を自身起点に固定 */
  lockSelfOrigin?: boolean;
  /** stat.poolFromEffectIndex 用: 現在の effect インデックス */
  effectIndex?: number;
}

export function appendSkillSharedTargetingFields(
  parent: HTMLElement,
  skill: ActiveSkillDef,
  patchActive: (
    mutate: (current: ActiveSkillDef) => void,
    options?: { rerender?: boolean },
  ) => void,
  options: { traitsRangePx: number },
): void {
  parent.appendChild(
    createEl(
      'p',
      'editor-hint',
      '複数 effect が同じ対象集合へ効果を付与する場合、ここで target / 形状を 1 箇所だけ指定します。各 effect は「スキル共通ターゲットを使う」が ON のとき継承します。',
    ),
  );
  appendTargetSpecFields(
    parent,
    skill.target ?? { kind: 'distance', side: 'enemy', order: 'nearest' },
    (target) => {
      patchActive((current) => {
        current.target = target;
      }, { rerender: true });
    },
  );
  appendSkillEffectTargetingFields(
    parent,
    skill,
    (patch, patchOptions) => {
      patchActive((current) => {
        Object.assign(current, patch(current));
      }, patchOptions);
    },
    options,
  );
}

export function appendTargetSpecFields(
  parent: HTMLElement,
  target: TargetSpec,
  onChange: (target: TargetSpec) => void,
  options?: AppendTargetSpecFieldsOptions
): void {
  const wrap = createEl("div", "editor-target-spec-fields");
  const normalized = normalizeTarget(target);
  const kind = targetSpecKind(normalized);

  wrap.appendChild(
    createFieldRow(
      "種別",
      createSelect(
        kind,
        TARGET_SPEC_KINDS.map((value) => ({
          value,
          label: TARGET_SPEC_KIND_LABELS[value],
        })),
        (nextKind) => onChange(defaultTargetForKind(nextKind))
      )
    )
  );

  if (normalized.kind === "distance") {
    const order =
      options?.lockSelfOrigin === true ? "selfOrigin" : normalized.order;
    const distanceSelect = createSelect(
      order,
      TARGET_DISTANCE_ORDER_OPTIONS.map((value) => ({
        value,
        label: TARGET_DISTANCE_ORDER_LABELS[value],
      })),
      (nextOrder) => onChange({ ...normalized, order: nextOrder })
    );
    if (options?.lockSelfOrigin === true) {
      distanceSelect.disabled = true;
    }
    wrap.appendChild(createFieldRow("距離", distanceSelect));
    if (options?.lockSelfOrigin === true) {
      wrap.appendChild(
        createEl(
          "p",
          "editor-hint",
          "貫通は常に自身起点。使用者の向いている方向に、射程分の直線範囲で命中します。"
        )
      );
    }
    wrap.appendChild(
      createFieldRow(
        "対象側",
        createSelect(
          normalized.side,
          (["ally", "enemy"] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...normalized, side })
        )
      )
    );
    if (normalized.side === "ally") {
      const includeRow = createEl("div", "editor-field editor-field-checkbox");
      const includeInput = createEl("input") as HTMLInputElement;
      includeInput.type = "checkbox";
      includeInput.checked = distanceSpecIncludesSelf(normalized);
      includeInput.disabled = order === "selfOrigin";
      includeInput.addEventListener("change", () => {
        onChange({
          ...normalized,
          includeSelf: includeInput.checked ? true : undefined,
        });
      });
      includeRow.appendChild(
        createEl("label", undefined, "自身を対象に含める")
      );
      includeRow.appendChild(includeInput);
      wrap.appendChild(includeRow);
      if (order === "selfOrigin") {
        wrap.appendChild(
          createEl(
            "p",
            "editor-hint",
            "自身起点では使用者自身を自動で含めます。敵側の自身起点では使用者自身は含めません。"
          )
        );
      }
    }
  }

  if (normalized.kind === "stat") {
    wrap.appendChild(
      createFieldRow(
        "対象側",
        createSelect(
          normalized.side,
          (["ally", "enemy"] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...normalized, side })
        )
      )
    );
    wrap.appendChild(
      createFieldRow(
        "ステータス",
        createSelect(
          normalized.stat,
          TARGET_STAT_OPTIONS.map((value) => ({
            value,
            label: TARGET_STAT_LABELS[value],
          })),
          (stat) =>
            onChange({
              ...normalized,
              stat,
              order:
                stat === "hp"
                  ? normalized.order
                  : normalized.order === "ratio"
                  ? "lowest"
                  : normalized.order,
            })
        )
      )
    );
    const orderOptions =
      normalized.stat === "hp"
        ? TARGET_STAT_ORDER_OPTIONS
        : TARGET_STAT_ORDER_OPTIONS.filter((value) => value !== "ratio");
    wrap.appendChild(
      createFieldRow(
        "順序",
        createSelect(
          normalized.order,
          orderOptions.map((value) => ({
            value,
            label: TARGET_STAT_ORDER_LABELS[value],
          })),
          (order) => onChange({ ...normalized, order })
        )
      )
    );
    if (
      options?.effectIndex !== undefined &&
      options.effectIndex > 0
    ) {
      wrap.appendChild(
        createFieldRow(
          "先行 effect プール",
          createNumberInput(
            normalized.poolFromEffectIndex ?? -1,
            (poolFromEffectIndex) => {
              onChange({
                ...normalized,
                poolFromEffectIndex:
                  poolFromEffectIndex < 0 ? undefined : poolFromEffectIndex,
              });
            },
            {
              min: 0,
              max: options.effectIndex - 1,
              step: 1,
              emptyWhen: -1,
            },
          ),
        ),
      );
      wrap.appendChild(
        createEl(
          "p",
          "editor-hint",
          "指定した effect の命中プール内だけで stat 選定します。空欄 = 通常の全体プール。"
        )
      );
    }
  }

  if (normalized.kind === "attackType") {
    const attackRow = createEl("div", "editor-debuff-tag-checkboxes");
    for (const [key, label] of [
      ["physical", "物理"],
      ["magic", "魔法"],
      ["melee", "近接"],
      ["ranged", "遠隔"],
    ] as const) {
      const row = createEl("div", "editor-field editor-field-checkbox");
      const input = createEl("input") as HTMLInputElement;
      input.type = "checkbox";
      input.checked = normalized[key] === true;
      input.addEventListener("change", () => {
        const next = { ...normalized, [key]: input.checked ? true : undefined };
        const hasAny = next.physical || next.magic || next.melee || next.ranged;
        if (hasAny) onChange(next);
      });
      row.appendChild(createEl("label", undefined, label));
      row.appendChild(input);
      attackRow.appendChild(row);
    }
    wrap.appendChild(attackRow);
    wrap.appendChild(
      createEl("p", "editor-hint", attackTypeRangedBandEditorHintJa())
    );
  }

  if (normalized.kind === "status") {
    wrap.appendChild(
      createFieldRow(
        "対象側",
        createSelect(
          normalized.side ?? "enemy",
          (["ally", "enemy"] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...normalized, side })
        )
      )
    );
    appendStatusTagCheckboxes(
      wrap,
      normalized.debuffTags ?? [],
      normalized.buffTags ?? [],
      (debuffTags, buffTags) =>
        onChange({
          ...normalized,
          debuffTags: debuffTags.length > 0 ? debuffTags : undefined,
          buffTags: buffTags.length > 0 ? buffTags : undefined,
        })
    );
  }

  if (normalized.kind === "clusterCenter") {
    wrap.appendChild(
      createFieldRow(
        "対象側",
        createSelect(
          normalized.side,
          (["ally", "enemy"] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...normalized, side })
        )
      )
    );
    wrap.appendChild(
      createEl(
        "p",
        "editor-hint",
        "生存ユニットの battleX 重心。placedField の配置 anchor などに使用"
      )
    );
  }

  if (normalized.kind === "all") {
    wrap.appendChild(
      createFieldRow(
        "対象側",
        createSelect(
          normalized.side,
          (["ally", "enemy"] as const).map((value) => ({
            value,
            label: value === "ally" ? "味方全員" : "敵全員",
          })),
          (side) => onChange({ ...normalized, side })
        )
      )
    );
  }

  wrap.appendChild(
    createEl("p", "editor-hint", `プレビュー: ${formatTargetLabel(normalized)}`)
  );
  parent.appendChild(wrap);
}

/** @deprecated appendTargetSpecFields を使用 */
export function appendTargetDebuffFilterFields(): void {}

export function appendPassiveDamageIncreaseFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  appendDamageIncreaseFields(
    parent,
    passive.specialEffect,
    (specialEffect, options) => {
      patchPassive((current) => {
        current.specialEffectApplyTo ??= "damage";
        current.specialEffect = specialEffect;
      }, options);
    }
  );
}

export function appendPassiveDefenseIgnoreFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  appendDefenseIgnoreFields(
    parent,
    passive.defenseIgnore,
    (defenseIgnore, options) => {
      patchPassive((current) => {
        current.defenseIgnore = defenseIgnore;
      }, options);
    }
  );
}

const PASSIVE_BUFF_STAT_OPTIONS: Array<{
  value: StatusEffectStat;
  label: string;
}> = [
  { value: "hp", label: "HP" },
  { value: "atk", label: "攻撃" },
  { value: "def", label: "防御" },
  { value: "reg", label: "耐魔" },
  { value: "damageTaken", label: "被ダメ" },
  { value: "attackSpeed", label: "攻撃速度" },
];

function appendPassiveBuffStatModifierListFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
): void {
  const section = createSection("ステータスバフ");
  parent.appendChild(section);

  const entries = parseStatBuffModifiers(passive);
  const displayEntries =
    entries.length > 0 ? entries : [defaultStatBuffModifierEntry()];

  const patchEntries = (
    mutate: (current: StatBuffModifierEntry[]) => StatBuffModifierEntry[],
    options?: { rerender?: boolean },
  ) => {
    patchPassive((current) => {
      syncPassiveBuffStatModifiers(current, mutate(parseStatBuffModifiers(current)));
    }, options);
  };

  displayEntries.forEach((entry, index) => {
    const block = createEl("div", "editor-effect-block");
    const header = createEl("div", "editor-effect-header");
    header.appendChild(
      createEl("span", "editor-effect-label", `バフ ${index + 1}`)
    );
    if (displayEntries.length > 1) {
      header.appendChild(
        createButton("削除", "editor-btn editor-btn-small", () => {
          patchEntries(
            (current) => current.filter((_, i) => i !== index),
            { rerender: true },
          );
        })
      );
    }
    block.appendChild(header);

    const grid = createEl("div", "editor-subgrid");
    grid.appendChild(
      createFieldRow(
        "対象ステ",
        createSelect(
          entry.stat,
          PASSIVE_BUFF_STAT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          })),
          (stat) => {
            patchEntries((current) =>
              current.map((row, i) => (i === index ? { ...row, stat } : row)),
            );
          },
        )
      )
    );
    grid.appendChild(
      createFieldRow(
        "倍率",
        createNumberInput(
          entry.multiplier ?? 1,
          (multiplier) => {
            patchEntries((current) =>
              current.map((row, i) =>
                i === index
                  ? {
                      ...row,
                      multiplier: multiplier !== 1 ? multiplier : undefined,
                    }
                  : row,
              ),
            );
          },
          { step: 0.01 },
        )
      )
    );
    grid.appendChild(
      createFieldRow(
        "固定値",
        createNumberInput(
          entry.flatBonus ?? 0,
          (flatBonus) => {
            patchEntries((current) =>
              current.map((row, i) =>
                i === index
                  ? {
                      ...row,
                      flatBonus: flatBonus > 0 ? flatBonus : undefined,
                    }
                  : row,
              ),
            );
          },
          { step: 1 },
        )
      )
    );
    block.appendChild(grid);
    section.appendChild(block);
  });

  section.appendChild(
    createButton("+ バフを追加", "editor-btn editor-btn-small", () => {
      patchEntries(
        (current) => [...current, defaultStatBuffModifierEntry()],
        { rerender: true },
      );
    })
  );
}

const PASSIVE_BUFF_SUB_KIND_OPTIONS: Array<{
  value: BuffSubKind;
  label: string;
}> = [
  { value: "stat", label: "ステータス" },
  { value: "block", label: "ブロック" },
  { value: "evasion", label: "回避" },
  { value: "damageDelay", label: "ダメージ遅延" },
  { value: "barrier", label: "バリア" },
];

const PASSIVE_DEBUFF_SUB_KIND_OPTIONS: Array<{
  value: DebuffSubKind;
  label: string;
}> = [
  { value: "stat", label: "ステータス" },
  { value: "dot", label: "DoT" },
  { value: "stun", label: "スタン" },
];

const PASSIVE_SPECIAL_APPLY_TO_OPTIONS: Array<{
  value: SpecialEffectApplyTo;
  label: string;
}> = [
  { value: "damage", label: "ダメージ" },
  { value: "heal", label: "回復" },
];

export function appendPassiveBuffFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  appendResourceAmountFields?: (
    grid: HTMLElement,
    amount: ResourceAmountSpec,
    onUpdate: (
      amount: ResourceAmountSpec,
      options?: { rerender?: boolean }
    ) => void
  ) => void,
  options: { traitsRangePx?: number } = {}
): void {
  parent.appendChild(
    createFieldRow(
      "バフ種別",
      createSelect(
        passive.buffSubKind ?? "stat",
        PASSIVE_BUFF_SUB_KIND_OPTIONS,
        (buffSubKind) => {
          patchPassive(
            (current) => {
              current.buffSubKind = buffSubKind;
              current.buffTargetRule ??= { kind: "self" };
              if (buffSubKind === "damageDelay") {
                current.ratio ??= 0.1;
              } else if (buffSubKind === "block" || buffSubKind === "evasion") {
                current.chance ??= 0.1;
              } else if (buffSubKind === "barrier") {
                current.barrierAmount ??= { kind: "defBased", defScale: 0.5 };
                current.periodicTrigger ??= "stageStart";
              }
            },
            { rerender: true }
          );
        }
      )
    )
  );
  appendTargetSpecFields(
    parent,
    passive.buffTargetRule ?? { kind: "self" },
    (buffTargetRule) => {
      patchPassive(
        (current) => {
          current.buffTargetRule = buffTargetRule;
        },
        { rerender: true }
      );
    }
  );

  appendSkillEffectTargetingFields(
    parent,
    passiveBuffToEffectDef(passive),
    (patch, patchOptions) => {
      patchPassive((current) => {
        const prev = passiveBuffToEffectDef(current);
        applyBuffEffectToPassive(current, { ...prev, ...patch(prev) });
      }, patchOptions);
    },
    { traitsRangePx: options.traitsRangePx ?? 0 }
  );

  const subKind = passive.buffSubKind ?? "stat";
  if (subKind === "barrier") {
    if (!appendResourceAmountFields) {
      parent.appendChild(
        createEl(
          "p",
          "editor-hint",
          "バリア量フィールドを表示できません（リソース量エディタ未接続）。"
        )
      );
      return;
    }
    appendPassiveBarrierFields(
      parent,
      passive,
      patchPassive,
      appendResourceAmountFields
    );
    return;
  }

  appendPassivePeriodicTriggerFields(parent, passive, patchPassive, {
    allowAura: true,
  });

  if (!usesBuffAuraMode(passive)) {
    parent.appendChild(
      createFieldRow(
        "バフ持続（秒）",
        createNumberInput(
          passive.buffDurationSec ?? 3,
          (buffDurationSec) => {
            patchPassive((current) => {
              current.buffDurationSec = buffDurationSec;
            });
          },
          { min: 0.1, step: 0.5 }
        )
      )
    );
  }

  if (subKind === "block" || subKind === "evasion") {
    parent.appendChild(
      createFieldRow(
        "確率 (0–1)",
        createNumberInput(
          passive.chance ?? 0.1,
          (chance) => {
            patchPassive((current) => {
              current.chance = chance;
            });
          },
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
    return;
  }
  if (subKind === "damageDelay") {
    parent.appendChild(
      createFieldRow(
        "ratio",
        createNumberInput(
          passive.ratio ?? 0.1,
          (ratio) => {
            patchPassive((current) => {
              current.ratio = ratio;
            });
          },
          { min: 0, max: 1, step: 0.01 }
        )
      )
    );
    return;
  }

  appendPassiveBuffStatModifierListFields(parent, passive, patchPassive);

}

export function appendPassiveDebuffFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void,
  options: { traitsRangePx?: number } = {}
): void {
  parent.appendChild(
    createFieldRow(
      "デバフ種別",
      createSelect(
        passive.debuffSubKind ?? "stat",
        PASSIVE_DEBUFF_SUB_KIND_OPTIONS,
        (debuffSubKind) => {
          patchPassive(
            (current) => {
              current.debuffSubKind = debuffSubKind;
              current.debuffTargetRule ??= {
                kind: "distance",
                side: "enemy",
                order: "nearest",
              };
            },
            { rerender: true }
          );
        }
      )
    )
  );

  appendPassivePeriodicTriggerFields(parent, passive, patchPassive, {
    allowAura: true,
  });

  appendTargetSpecFields(
    parent,
    passive.debuffTargetRule ?? {
      kind: "distance",
      side: "enemy",
      order: "nearest",
    },
    (debuffTargetRule) => {
      patchPassive(
        (current) => {
          current.debuffTargetRule = debuffTargetRule;
        },
        { rerender: true }
      );
    }
  );

  appendSkillEffectTargetingFields(
    parent,
    passiveDebuffToEffectDef(passive),
    (patch, patchOptions) => {
      patchPassive((current) => {
        const prev = passiveDebuffToEffectDef(current);
        applyDebuffEffectToPassive(current, { ...prev, ...patch(prev) });
      }, patchOptions);
    },
    { traitsRangePx: options.traitsRangePx ?? 0 }
  );

  const subKind = passive.debuffSubKind ?? "stat";
  if (subKind === "stun") {
    parent.appendChild(
      createFieldRow(
        "スタン秒数",
        createNumberInput(
          passive.debuffStunDurationSec ?? 1,
          (debuffStunDurationSec) => {
            patchPassive((current) => {
              current.debuffStunDurationSec = debuffStunDurationSec;
            });
          },
          { min: 0.1, max: 5, step: 0.1 }
        )
      )
    );
    return;
  }
  if (subKind === "dot") {
    parent.appendChild(
      createEl(
        "p",
        "editor-hint",
        "DoT 本体の戦闘適用は今後拡張予定。データ形状はアクティブ debuff（dot）と同一です。"
      )
    );
    parent.appendChild(
      createFieldRow(
        "DoT秒数",
        createNumberInput(
          passive.debuffDotDurationSec ?? 3,
          (debuffDotDurationSec) => {
            patchPassive((current) => {
              current.debuffDotDurationSec = debuffDotDurationSec;
            });
          },
          { min: 0.1, step: 0.5 }
        )
      )
    );
    parent.appendChild(
      createFieldRow(
        "DoTフレーバー",
        createSelect(
          passive.debuffDotFlavor ?? "",
          [
            { value: "", label: "未指定（汎用DoT）" },
            ...DOT_FLAVORS.map((value) => ({
              value,
              label: DOT_FLAVOR_LABELS[value],
            })),
          ],
          (debuffDotFlavor) => {
            patchPassive((current) => {
              if (debuffDotFlavor === "") {
                delete current.debuffDotFlavor;
              } else {
                current.debuffDotFlavor = debuffDotFlavor as PassiveSkillDef["debuffDotFlavor"];
              }
            });
          }
        )
      )
    );
    return;
  }

  if (!usesDebuffAuraMode(passive)) {
    parent.appendChild(
      createFieldRow(
        "デバフ持続（秒）",
        createNumberInput(
          passive.debuffDurationSec ?? 3,
          (debuffDurationSec) => {
            patchPassive((current) => {
              current.debuffDurationSec = debuffDurationSec;
            });
          },
          { min: 0.1, step: 0.5 }
        )
      )
    );
  }

  parent.appendChild(
    createFieldRow(
      "対象ステ",
      createSelect(
        Array.isArray(passive.debuffStat)
          ? passive.debuffStat[0] ?? "atk"
          : passive.debuffStat ?? "atk",
        [
          { value: "atk", label: "攻撃" },
          { value: "def", label: "防御" },
          { value: "reg", label: "耐魔" },
          { value: "damageTaken", label: "被ダメ" },
          { value: "attackSpeed", label: "攻撃速度" },
        ],
        (debuffStat) => {
          patchPassive((current) => {
            current.debuffStat = debuffStat;
          });
        }
      )
    )
  );
  parent.appendChild(
    createFieldRow(
      "倍率",
      createNumberInput(
        passive.debuffMultiplier ?? 0.9,
        (debuffMultiplier) => {
          patchPassive((current) => {
            current.debuffMultiplier = debuffMultiplier;
          });
        },
        { step: 0.01 }
      )
    )
  );
  parent.appendChild(
    createFieldRow(
      "固定値",
      createNumberInput(
        passive.debuffFlatBonus ?? 0,
        (debuffFlatBonus) => {
          patchPassive((current) => {
            current.debuffFlatBonus = debuffFlatBonus || undefined;
          });
        },
        { step: 1 }
      )
    )
  );
}

export function appendPassiveSpecialEffectFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createFieldRow(
      "適用先",
      createSelect(
        passive.specialEffectApplyTo ?? "damage",
        PASSIVE_SPECIAL_APPLY_TO_OPTIONS,
        (specialEffectApplyTo) => {
          patchPassive(
            (current) => {
              current.specialEffectApplyTo = specialEffectApplyTo;
              current.specialEffect ??= defaultDamageIncrease();
            },
            { rerender: true }
          );
        }
      )
    )
  );
  appendDamageIncreaseFields(
    parent,
    passive.specialEffect,
    (specialEffect, options) => {
      patchPassive((current) => {
        current.specialEffect = specialEffect;
      }, options);
    },
    { title: "特効効果" }
  );
}

function appendFireHpRatioFields(
  parent: HTMLElement,
  condition: { maxHpRatio: number; compare?: "lte" | "gte" },
  onChange: (next: { maxHpRatio: number; compare?: "lte" | "gte" }) => void
): void {
  const compare = condition.compare ?? "lte";
  parent.appendChild(
    createFieldRow(
      "比較",
      createSelect(
        compare,
        HP_RATIO_COMPARE_OPTIONS.map((value) => ({
          value,
          label: HP_RATIO_COMPARE_LABELS[value],
        })),
        (value) => {
          onChange({
            maxHpRatio: condition.maxHpRatio,
            compare: value === "lte" ? undefined : "gte",
          });
        }
      )
    )
  );
  parent.appendChild(
    createFieldRow(
      "HP残り割合",
      createNumberInput(
        condition.maxHpRatio,
        (maxHpRatio) => onChange({ ...condition, maxHpRatio }),
        { min: 0, max: 1, step: 0.01 }
      )
    )
  );
}

function defaultFireCondition(kind: FireConditionKind): FireCondition {
  switch (kind) {
    case "debuff":
      return { kind, tags: ["def"] };
    case "targetHp":
    case "selfHp":
      return { kind, maxHpRatio: 0.5 };
    case "minTargets":
      return { kind, count: 2 };
    case "enemyCount":
      return { kind, min: 1 };
    case "allyDamaged":
    case "waveStart":
    case "finalWaveStart":
    case "waveEnd":
      return { kind };
    case "pendingIncomingDamage":
      return { kind, maxHpRatio: 0.3, windowSec: 2 };
    case "targetBarrierBelowGrant":
      return { kind };
    case "blockResonanceStacks":
      return { kind, min: 1 };
    case "hasDot":
      return { kind };
  }
}

function appendFireConditionFields(
  parent: HTMLElement,
  condition: FireCondition,
  onChange: (
    condition: FireCondition,
    options?: CombatFieldChangeOptions
  ) => void,
  onRemove: () => void
): void {
  const card = createEl("div", "editor-condition-card");
  card.appendChild(
    createFieldRow(
      "条件種別",
      createSelect(
        condition.kind,
        FIRE_CONDITION_KIND_OPTIONS.map((kind) => ({
          value: kind,
          label: FIRE_CONDITION_KIND_LABELS[kind],
        })),
        (kind) => {
          onChange(defaultFireCondition(kind as FireConditionKind), {
            rerender: true,
          });
        }
      )
    )
  );

  switch (condition.kind) {
    case "debuff":
      card.appendChild(createEl("p", "editor-hint", "対象デバフ（いずれか）"));
      appendDebuffFilterCheckboxes(card, condition.tags, (tags) => {
        onChange({ ...condition, tags }, { rerender: false });
      });
      card.appendChild(
        createFieldRow(
          "自分付与のみ",
          createSelect(
            condition.selfAppliedOnly ? "true" : "false",
            [
              { value: "false", label: "いいえ" },
              { value: "true", label: "はい" },
            ],
            (value) => {
              onChange(
                {
                  ...condition,
                  selfAppliedOnly: value === "true" || undefined,
                },
                { rerender: false }
              );
            }
          )
        )
      );
      break;
    case "targetHp":
    case "selfHp":
      appendFireHpRatioFields(card, condition, (next) =>
        onChange({ ...condition, ...next }, { rerender: false })
      );
      break;
    case "minTargets":
      card.appendChild(
        createFieldRow(
          "最小ターゲット数",
          createNumberInput(
            condition.count,
            (count) => onChange({ ...condition, count }, { rerender: false }),
            { min: 1, step: 1 }
          )
        )
      );
      break;
    case "enemyCount": {
      const min = condition.min;
      const max = condition.max;
      card.appendChild(
        createFieldRow(
          "最小敵数（省略可）",
          createNumberInput(
            min ?? 0,
            (value) => {
              onChange(
                {
                  ...condition,
                  min: value > 0 ? value : undefined,
                },
                { rerender: false }
              );
            },
            { min: 0, step: 1 }
          )
        )
      );
      card.appendChild(
        createFieldRow(
          "最大敵数（省略可）",
          createNumberInput(
            max ?? 0,
            (value) => {
              onChange(
                {
                  ...condition,
                  max: value > 0 ? value : undefined,
                },
                { rerender: false }
              );
            },
            { min: 0, step: 1 }
          )
        )
      );
      card.appendChild(
        createFieldRow(
          "カウント範囲",
          createSelect(
            condition.scope ?? "living",
            ENEMY_COUNT_SCOPES.map((value) => ({
              value,
              label: ENEMY_COUNT_SCOPE_LABELS[value],
            })),
            (scope) => {
              onChange(
                {
                  ...condition,
                  scope: scope === "living" ? undefined : scope,
                },
                { rerender: false }
              );
            }
          )
        )
      );
      break;
    }
    case "allyDamaged":
    case "waveStart":
    case "finalWaveStart":
    case "waveEnd":
    case "targetBarrierBelowGrant":
      break;
    case "pendingIncomingDamage":
      card.appendChild(
        createFieldRow(
          "HP割合しきい値",
          createNumberInput(
            condition.maxHpRatio,
            (maxHpRatio) =>
              onChange({ ...condition, maxHpRatio }, { rerender: false }),
            { step: 0.05, min: 0.01, max: 1 }
          )
        )
      );
      card.appendChild(
        createFieldRow(
          "ウィンドウ秒",
          createNumberInput(
            condition.windowSec,
            (windowSec) =>
              onChange({ ...condition, windowSec }, { rerender: false }),
            { step: 0.1, min: 0.1 }
          )
        )
      );
      break;
    case "blockResonanceStacks":
      card.appendChild(
        createFieldRow(
          "最小スタック",
          createNumberInput(
            condition.min,
            (min) => onChange({ ...condition, min }, { rerender: false }),
            { min: 1, step: 1 }
          )
        )
      );
      break;
    case "hasDot":
      card.appendChild(
        createEl("p", "editor-hint", "対象が DoT 中（overlay: dot）のときに成立")
      );
      break;
  }

  card.appendChild(
    createActionButton("条件を削除", "editor-btn editor-btn-small", onRemove)
  );
  parent.appendChild(card);
}

export function appendConditionListFields(
  parent: HTMLElement,
  conditions: FireCondition[],
  onChange: (
    mutate: (current: FireCondition[]) => FireCondition[],
    options?: CombatFieldChangeOptions
  ) => void,
  options?: {
    addButtonLabel?: string;
    emptyFallback?: () => FireCondition[];
  }
): void {
  const emptyFallback =
    options?.emptyFallback ?? (() => [{ kind: "enemyCount" as const, min: 1 }]);
  const conditionsWrap = createEl("div", "editor-conditions-list");
  conditions.forEach((condition, index) => {
    appendFireConditionFields(
      conditionsWrap,
      condition,
      (next, changeOptions) => {
        onChange((current) => {
          const nextConditions = [...current];
          nextConditions[index] = next;
          return nextConditions;
        }, changeOptions);
      },
      () => {
        onChange(
          (current) => {
            const nextConditions = current.filter((_, i) => i !== index);
            return nextConditions.length > 0 ? nextConditions : emptyFallback();
          },
          { rerender: false }
        );
      }
    );
  });
  parent.appendChild(conditionsWrap);
  parent.appendChild(
    createActionButton(
      options?.addButtonLabel ?? "条件を追加",
      "editor-btn editor-btn-small",
      () => {
        onChange((current) => [...current, { kind: "enemyCount", min: 1 }], {
          rerender: false,
        });
      }
    )
  );
}

export function appendActiveFireGateFields(
  parent: HTMLElement,
  active: ActiveSkillDef,
  onChange: (
    mutate: (current: ActiveSkillDef) => void,
    options?: CombatFieldChangeOptions
  ) => void
): void {
  const section = createEl("div", "editor-subsection");
  section.appendChild(
    createEl("h4", "editor-subsection-title", "発動ゲート / 多段チャージ")
  );

  const firePolicy: FirePolicy = active.firePolicy ?? "immediate";
  section.appendChild(
    createFieldRow(
      "発動ポリシー",
      createSelect(
        firePolicy,
        FIRE_POLICY_OPTIONS.map((value) => ({
          value,
          label: FIRE_POLICY_LABELS[value],
        })),
        (nextPolicy) => {
          onChange(
            (current) => {
              if (nextPolicy === "immediate") {
                delete current.firePolicy;
                delete current.fireConditions;
                delete current.fireTimeoutSec;
              } else {
                current.firePolicy = "smart";
                current.fireConditions ??= [{ kind: "enemyCount", min: 1 }];
              }
            },
            { rerender: true }
          );
        }
      )
    )
  );

  if (firePolicy === "smart") {
    const conditions = active.fireConditions ?? [
      { kind: "enemyCount", min: 1 },
    ];
    appendConditionListFields(
      section,
      conditions,
      (mutate, changeOptions) => {
        onChange((current) => {
          current.fireConditions = mutate(current.fireConditions ?? conditions);
        }, changeOptions);
      },
      {
        addButtonLabel: "発動条件を追加",
        emptyFallback: () => [{ kind: "enemyCount", min: 1 }],
      }
    );
    section.appendChild(
      createFieldRow(
        "発動待ち上限 (秒, 省略=無限)",
        createNumberInput(
          active.fireTimeoutSec ?? 0,
          (value) => {
            onChange(
              (current) => {
                if (value <= 0) delete current.fireTimeoutSec;
                else current.fireTimeoutSec = value;
              },
              { rerender: false }
            );
          },
          { min: 0, step: 0.1 }
        )
      )
    );
    section.appendChild(
      createEl(
        "p",
        "editor-hint",
        "smart: 条件未成立時はストック処理（多段チャージ）または fireHold。Wave 開始効果はパッシブ waveStart を推奨。"
      )
    );
  }

  section.appendChild(
    createFieldRow(
      `多段チャージ上限 (0–${GLOBAL_MAX_CHARGES_CAP}, 0=省略)`,
      createNumberInput(
        active.maxCharges ?? 0,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.maxCharges;
              else current.maxCharges = Math.min(GLOBAL_MAX_CHARGES_CAP, value);
            },
            { rerender: false }
          );
        },
        { min: 0, max: GLOBAL_MAX_CHARGES_CAP, step: 1 }
      )
    )
  );

  section.appendChild(
    createFieldRow(
      "Stage 発動上限 (0=省略)",
      createNumberInput(
        active.stageTriggerLimit ?? 0,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.stageTriggerLimit;
              else current.stageTriggerLimit = value;
            },
            { rerender: false }
          );
        },
        { min: 0, step: 1 }
      )
    )
  );

  parent.appendChild(section);
}

export function activeSkillHasBlockResonanceConsume(
  active: ActiveSkillDef,
): boolean {
  return active.effect.some((effect) => effect.type === "blockResonanceConsume");
}

export function appendActiveBlockResonanceStanceFields(
  parent: HTMLElement,
  active: ActiveSkillDef,
  onChange: (
    mutate: (current: ActiveSkillDef) => void,
    options?: CombatFieldChangeOptions
  ) => void,
  appendResourceAmountFields: (
    grid: HTMLElement,
    amount: ResourceAmountSpec,
    onUpdate: (
      amount: ResourceAmountSpec,
      options?: { rerender?: boolean }
    ) => void
  ) => void
): void {
  if (!activeSkillHasBlockResonanceConsume(active)) return;

  const section = createEl("div", "editor-subsection");
  section.appendChild(
    createEl("h4", "editor-subsection-title", "城塞の構え（blockResonanceConsume）")
  );

  const grid = createEl("div", "editor-grid");
  section.appendChild(grid);

  grid.appendChild(
    createFieldRow(
      "態勢の基礎持続（秒）",
      createNumberInput(
        active.blockResonanceStanceDurationBaseSec ?? 2,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.blockResonanceStanceDurationBaseSec;
              else current.blockResonanceStanceDurationBaseSec = value;
            },
            { rerender: false }
          );
        },
        { min: 0.1, step: 0.5 }
      )
    )
  );
  grid.appendChild(
    createFieldRow(
      "態勢中 stack あたり被ダメ軽減率",
      createNumberInput(
        active.blockResonanceStanceDamageTakenPerStack ?? 0.04,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) {
                delete current.blockResonanceStanceDamageTakenPerStack;
              } else {
                current.blockResonanceStanceDamageTakenPerStack = value;
              }
            },
            { rerender: false }
          );
        },
        { min: 0, max: 1, step: 0.01 }
      )
    )
  );
  grid.appendChild(
    createFieldRow(
      "態勢中 stack あたり DEF 倍率加算",
      createNumberInput(
        active.blockResonanceStanceDefPerStack ?? 0.05,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.blockResonanceStanceDefPerStack;
              else current.blockResonanceStanceDefPerStack = value;
            },
            { rerender: false }
          );
        },
        { min: 0, step: 0.01 }
      )
    )
  );
  grid.appendChild(
    createFieldRow(
      "態勢中 stack あたりブロック率加算",
      createNumberInput(
        active.blockResonanceStanceBlockPerStack ?? 0.05,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.blockResonanceStanceBlockPerStack;
              else current.blockResonanceStanceBlockPerStack = value;
            },
            { rerender: false }
          );
        },
        { min: 0, max: 1, step: 0.01 }
      )
    )
  );

  appendResourceAmountFields(
    grid,
    active.blockResonanceOnBlockDamage ?? { kind: "defBased", defScale: 1 },
    (amount, options) => {
      onChange(
        (current) => {
          current.blockResonanceOnBlockDamage = amount;
        },
        options
      );
    }
  );

  grid.appendChild(
    createFieldRow(
      "ブロック反撃半径（px）",
      createNumberInput(
        active.blockResonanceOnBlockKnockbackRadiusPx ?? 50,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) delete current.blockResonanceOnBlockKnockbackRadiusPx;
              else current.blockResonanceOnBlockKnockbackRadiusPx = value;
            },
            { rerender: false }
          );
        },
        { min: 1, step: 10 }
      )
    )
  );
  grid.appendChild(
    createFieldRow(
      "ノックバック距離（px）",
      createNumberInput(
        active.blockResonanceOnBlockKnockbackDistancePx ?? 50,
        (value) => {
          onChange(
            (current) => {
              if (value <= 0) {
                delete current.blockResonanceOnBlockKnockbackDistancePx;
              } else {
                current.blockResonanceOnBlockKnockbackDistancePx = value;
              }
            },
            { rerender: false }
          );
        },
        { min: 1, step: 10 }
      )
    )
  );

  section.appendChild(
    createEl(
      "p",
      "editor-hint",
      "硬直・持続秒は「基礎持続 + 消費 stack 数」で戦闘時に決定。useDurationSec は基礎値の目安。"
    )
  );

  parent.appendChild(section);
}

export function appendPassiveSkillPropertyOverrideFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  activeSkillOptions: Array<{ value: string; label: string }>,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ) => void
): void {
  parent.appendChild(
    createFieldRow(
      "maxCharges 加算",
      createNumberInput(
        passive.maxChargesBonus ?? 1,
        (maxChargesBonus) => {
          patchPassive((current) => {
            current.maxChargesBonus = Math.max(1, Math.floor(maxChargesBonus));
          });
        },
        { min: 1, max: GLOBAL_MAX_CHARGES_CAP, step: 1 }
      )
    )
  );

  parent.appendChild(
    createEl(
      "p",
      "editor-hint",
      "Wave 開始時の開幕効果はパッシブ periodicTrigger: waveStart を使用してください。"
    )
  );

  if (activeSkillOptions.length === 0) {
    parent.appendChild(
      createEl("p", "editor-hint", "対象アクティブスキルがありません。")
    );
    return;
  }

  const selected = new Set(passive.skillPropertyTargetSkillIds ?? []);
  parent.appendChild(
    createEl("p", "editor-hint", "対象アクティブ（未選択=全習得アクティブ）")
  );
  const wrap = createEl("div", "editor-debuff-tag-checkboxes");
  for (const option of activeSkillOptions) {
    const row = createEl("div", "editor-field editor-field-checkbox");
    const input = createEl("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = selected.has(option.value);
    input.addEventListener("change", () => {
      patchPassive(
        (current) => {
          const next = new Set(current.skillPropertyTargetSkillIds ?? []);
          if (input.checked) next.add(option.value);
          else next.delete(option.value);
          const ids = [...next];
          if (ids.length === 0) delete current.skillPropertyTargetSkillIds;
          else current.skillPropertyTargetSkillIds = ids;
        },
        { rerender: false }
      );
    });
    row.appendChild(createEl("label", undefined, option.label));
    row.appendChild(input);
    wrap.appendChild(row);
  }
  parent.appendChild(wrap);
}
