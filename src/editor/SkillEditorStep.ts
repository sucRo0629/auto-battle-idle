import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  BUFF_SUB_KIND_LABELS,
  BUFF_SUB_KINDS,
  DEBUFF_SUB_KIND_LABELS,
  DEBUFF_SUB_KINDS,
  DOT_FLAVOR_LABELS,
  DOT_FLAVORS,
  DAMAGE_TYPE_OPTIONS,
  EDITOR_ACTIVE_EFFECT_CATEGORIES,
  EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS,
  EDITOR_ACTIVE_EFFECT_KIND_GROUPS,
  EDITOR_PASSIVE_EFFECT_KIND_GROUPS,
  HEAL_SUB_KIND_LABELS,
  HEAL_SUB_KINDS,
  MOVE_MODE_LABELS,
  MOVE_MODES,
  PASSIVE_EFFECT_KIND_LABELS,
  COUNTER_RESPONSE_KIND_LABELS,
  COUNTER_RESPONSE_KINDS,
  PASSIVE_COUNTER_TRIGGER_KIND_LABELS,
  PASSIVE_COUNTER_TRIGGER_KINDS,
  MAX_HP_REF_LABELS,
  MAX_HP_REFERENCES,
  RESOURCE_AMOUNT_KIND_LABELS,
  RESOURCE_AMOUNT_KIND_OPTIONS,
  SKILL_EFFECT_ANIM_LABELS,
  SKILL_EFFECT_ANIM_OPTIONS,
  SKILL_TRIGGER_KIND_LABELS,
  SKILL_TRIGGER_KIND_OPTIONS,
  SKILL_TRIGGER_VALUE_LABELS,
  STATUS_EFFECT_STAT_OPTIONS,
  TARGET_RULE_OVERRIDE_APPLY_TO_LABELS,
  TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS,
  TARGET_SHAPE_LABELS,
  TARGET_SHAPE_OPTIONS,
  POWER_STEP_MODE_LABELS,
  POWER_STEP_MODES,
} from "../battle/data/gameDataSchema.ts";
import {
  normalizePassiveSkillForEditor,
  stripBasicAttackTraitFieldsFromEffect,
} from "../battle/data/validateGameData.ts";
import {
  activeEffectHasAmount,
  getActiveEffectAmountSpec,
  getPassiveAmountSpec,
  inferPassiveAmountField,
  isActiveSkillAmountOverrideTarget,
  isPassiveSkillAmountOverrideTarget,
} from "../battle/skillAmountOverride.ts";
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  CounterAttackRangeBandFilter,
  CounterResponseDef,
  CounterResponseKind,
  CounterSkillEffect,
  DamageType,
  DebuffSkillEffect,
  MoveSkillEffect,
  MaxHpReference,
  PassiveSkillDef,
  ResourceAmountSpec,
  HealSubKind,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillEffectKind,
  SkillTriggerKind,
  StatusEffectStat,
  TargetShape,
  PowerStepMode,
} from "../battle/types.ts";
import {
  CONFIGURABLE_RANGE_PX_MAX,
  configurableRangeHintJa,
  counterAttackRangeBandEditorHintJa,
  parseConfigurableRangePxInput,
} from "../battle/rangeLimits.ts";
import {
  defaultTargetForEffectType,
  getEffectTarget,
} from "../battle/skills/targetSpec.ts";
import { skillHasMoveEffect } from "../battle/skills/skillSequence.ts";
import {
  effectInheritsSkillSharedTargeting,
  hasSkillSharedTargeting,
  mergeEffectWithSkillTargeting,
  SKILL_SHARED_TARGETING_KEYS,
} from "../battle/skills/skillSharedTargeting.ts";
import { resolveSkillTrigger } from "../battle/skillTrigger.ts";
import {
  formatActiveDescription,
  formatPassiveDescription,
} from "../ui/formatSkillText.ts";
import { annotateGameTerms } from "../ui/annotateGameTerms.ts";
import { GameTermPanel } from "../ui/GameTermPanel.ts";
import type { SkillDraftEntry, SkillSlotKind } from "./editorApi.ts";
import {
  appendDefenseIgnoreFields,
  appendDispelEffectFields,
  appendDamageIncreaseFields,
  appendDamageIncreaseConditionListFields,
  appendPassiveDamageIncreaseFields,
  appendPassiveDefenseIgnoreFields,
  appendPassiveDebuffFields,
  appendPassiveDispelFields,
  appendPassiveDamageReductionFields,
  appendPassiveHealFields,
  appendHerbalPotencyPassiveFields,
  appendPassiveBuffFields,
  appendPassiveSpecialEffectFields,
  appendActiveFireGateFields,
  appendActiveBlockResonanceStanceFields,
  appendConditionListFields,
  appendPassiveSkillPropertyOverrideFields,
  appendPassiveThreatControlFields,
  appendTargetSpecFields,
  appendSkillSharedTargetingFields,
  appendThreatBurstFields,
  appendDamagePierceFields,
} from "./skillEditorCombatFields.ts";
import {
  appendGrid,
  createActionButton,
  createButton,
  createCollapsibleSection,
  createEl,
  createFieldRow,
  createNumberInput,
  createRadioGroup,
  createSection,
  createGroupedSelect,
  createSelect,
  createTextInput,
  preserveScrollDuring,
} from "./formUtils.ts";

const STAT_LABELS: Record<StatusEffectStat, string> = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  reg: "魔法耐性",
  damageTaken: "被ダメ",
  attackSpeed: "攻撃速度",
};

const DEFAULT_DOT_DURATION_SEC = 5;

function defaultResourceAmount(atkScale = 1): ResourceAmountSpec {
  return { kind: "atkBased", atkScale };
}

function defaultDefResourceAmount(defScale = 1): ResourceAmountSpec {
  return { kind: "defBased", defScale };
}

function formatAmountPreview(spec: ResourceAmountSpec | undefined): string {
  if (!spec) return "—";
  switch (spec.kind) {
    case "atkBased":
      return `ATK×${spec.atkScale ?? 1}`;
    case "defBased":
      return `DEF×${spec.defScale ?? 1}`;
    case "flat":
      return `固定 ${spec.flatAmount ?? 0}`;
    case "percentMaxHp":
      return `maxHP ${((spec.percentOfMaxHp ?? 0) * 100).toFixed(0)}%`;
  }
}

function resolveSkillAmountOverrideOriginal(
  entries: SkillDraftEntry[],
  targetSkillId: string,
  effectIndex?: number,
  passiveAmountField?: PassiveSkillDef["passiveAmountField"]
): ResourceAmountSpec | undefined {
  const entry = entries.find(
    (item) =>
      item.passive?.id === targetSkillId || item.active?.id === targetSkillId
  );
  if (!entry?.active && !entry?.passive) return undefined;
  if (entry.active) {
    if (effectIndex !== undefined) {
      const effect = entry.active.effect[effectIndex];
      return effect ? getActiveEffectAmountSpec(effect) : undefined;
    }
    for (const effect of entry.active.effect) {
      const spec = getActiveEffectAmountSpec(effect);
      if (spec) return spec;
    }
    return undefined;
  }
  const field = passiveAmountField ?? inferPassiveAmountField(entry.passive!);
  return field ? getPassiveAmountSpec(entry.passive!, field) : undefined;
}

function defaultCounterResponse(kind: CounterResponseKind): CounterResponseDef {
  switch (kind) {
    case "damage":
      return {
        kind: "damage",
        amount: defaultDefResourceAmount(0.5),
        damageType: "physical",
      };
    case "debuff":
      return {
        kind: "debuff",
        debuffStat: "atk",
        debuffMultiplier: 0.8,
        debuffDurationSec: 3,
      };
    case "dot":
      return {
        kind: "dot",
        durationSec: 3,
        powerMultiplier: 0.5,
        damageType: "physical",
      };
    case "stun":
      return { kind: "stun", durationSec: 1 };
    case "knockback":
      return { kind: "knockback", distancePx: 30 };
  }
}

function counterHasResponse(
  effect: CounterSkillEffect,
  kind: CounterResponseKind
): boolean {
  return effect.responses.some((response) => response.kind === kind);
}

function patchCounterResponses(
  effect: CounterSkillEffect,
  kind: CounterResponseKind,
  enabled: boolean
): CounterResponseDef[] {
  const rest = effect.responses.filter((response) => response.kind !== kind);
  if (!enabled) {
    return rest.length > 0 ? rest : [defaultCounterResponse("damage")];
  }
  return [...rest, defaultCounterResponse(kind)];
}

function findCounterResponse<T extends CounterResponseKind>(
  effect: CounterSkillEffect,
  kind: T
): Extract<CounterResponseDef, { kind: T }> | undefined {
  return effect.responses.find(
    (response): response is Extract<CounterResponseDef, { kind: T }> =>
      response.kind === kind
  );
}

function appendCounterAttackRangeBandFields(
  parent: HTMLElement,
  filter: CounterAttackRangeBandFilter,
  onChange: (next: CounterAttackRangeBandFilter) => void
): void {
  const row = createEl("div", "editor-debuff-tag-checkboxes");
  for (const [key, label] of [
    ["counterMelee", "近接"],
    ["counterRanged", "遠隔"],
  ] as const) {
    const fieldRow = createEl("div", "editor-field editor-field-checkbox");
    const input = createEl("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = filter[key] === true;
    input.addEventListener("change", () => {
      const next: CounterAttackRangeBandFilter = {
        ...filter,
        [key]: input.checked ? true : undefined,
      };
      if (!next.counterMelee && !next.counterRanged) {
        delete next.counterMelee;
        delete next.counterRanged;
      }
      onChange(next);
    });
    fieldRow.appendChild(createEl("label", undefined, label));
    fieldRow.appendChild(input);
    row.appendChild(fieldRow);
  }
  parent.appendChild(createFieldRow("反撃可能対象", row));
  parent.appendChild(
    createEl("p", "editor-hint", counterAttackRangeBandEditorHintJa())
  );
}

function appendCounterEffectFields(
  parent: HTMLElement,
  effect: CounterSkillEffect,
  patchEffect: (
    patch: (prev: CounterSkillEffect) => CounterSkillEffect,
    options?: { rerender?: boolean }
  ) => void,
  options?: { showDuration?: boolean; traitsRangePx?: number }
): void {
  const showDuration = options?.showDuration ?? true;
  const traitsRangePx = options?.traitsRangePx ?? 0;
  const grid = appendGrid(parent);
  grid.appendChild(
    createEl(
      "p",
      "editor-hint",
      showDuration
        ? "付与対象: 自身（固定）。反撃は設定射程内の攻撃を受けたとき攻撃者へ適用。"
        : "常時受付。被攻撃のたびに発動確率を判定し、成功時に反撃内容を適用。"
    )
  );
  grid.appendChild(
    createFieldRow(
      "反撃射程 (px)",
      createNumberInput(
        effect.range ?? 0,
        (range) =>
          patchEffect((prev) => ({
            ...prev,
            range,
          })),
        {
          min: 0,
          max: CONFIGURABLE_RANGE_PX_MAX,
          step: 1,
          parseInput: (raw) =>
            parseConfigurableRangePxInput(raw, traitsRangePx),
        }
      )
    )
  );
  appendCounterAttackRangeBandFields(
    grid,
    {
      counterMelee: effect.counterMelee,
      counterRanged: effect.counterRanged,
    },
    (next) =>
      patchEffect((prev) => ({
        ...prev,
        counterMelee: next.counterMelee,
        counterRanged: next.counterRanged,
      }))
  );
  if (showDuration) {
    grid.appendChild(
      createFieldRow(
        "秒数",
        createNumberInput(
          effect.durationSec,
          (durationSec) => patchEffect((prev) => ({ ...prev, durationSec })),
          { min: 0.1, step: 0.5 }
        )
      )
    );
  }

  const responseSection = createSection("反撃内容（1種別以上）");
  grid.appendChild(responseSection);
  for (const kind of COUNTER_RESPONSE_KINDS) {
    const enabled = counterHasResponse(effect, kind);
    const toggleRow = createEl("div", "editor-field editor-field-checkbox");
    const toggleInput = createEl("input") as HTMLInputElement;
    toggleInput.type = "checkbox";
    toggleInput.checked = enabled;
    toggleInput.addEventListener("change", () => {
      patchEffect(
        (prev) => ({
          ...prev,
          responses: patchCounterResponses(prev, kind, toggleInput.checked),
        }),
        { rerender: true }
      );
    });
    toggleRow.appendChild(
      createEl("label", undefined, COUNTER_RESPONSE_KIND_LABELS[kind])
    );
    toggleRow.appendChild(toggleInput);
    responseSection.appendChild(toggleRow);

    if (!enabled) continue;
    const response = findCounterResponse(effect, kind);
    if (!response) continue;

    if (kind === "damage" && response.kind === "damage") {
      appendResourceAmountFields(responseSection, response.amount, (amount) =>
        patchEffect((prev) => ({
          ...prev,
          responses: prev.responses.map((entry) =>
            entry.kind === "damage" ? { ...entry, amount } : entry
          ),
        }))
      );
      responseSection.appendChild(
        createFieldRow(
          "ダメージ種別",
          createSelect(
            response.damageType ?? "physical",
            DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
            (damageType) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "damage" ? { ...entry, damageType } : entry
                ),
              }))
          )
        )
      );
    }

    if (kind === "debuff" && response.kind === "debuff") {
      responseSection.appendChild(
        createFieldRow(
          "デバフ stat",
          createSelect(
            Array.isArray(response.debuffStat)
              ? response.debuffStat[0] ?? "atk"
              : response.debuffStat,
            STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
              value,
              label: STAT_LABELS[value],
            })),
            (debuffStat) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "debuff" ? { ...entry, debuffStat } : entry
                ),
              }))
          )
        )
      );
      responseSection.appendChild(
        createFieldRow(
          "倍率",
          createNumberInput(
            response.debuffMultiplier ?? 1,
            (debuffMultiplier) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "debuff"
                    ? { ...entry, debuffMultiplier }
                    : entry
                ),
              })),
            { step: 0.05 }
          )
        )
      );
      responseSection.appendChild(
        createFieldRow(
          "秒数",
          createNumberInput(
            response.debuffDurationSec,
            (debuffDurationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "debuff"
                    ? { ...entry, debuffDurationSec }
                    : entry
                ),
              })),
            { min: 0.1, step: 0.5 }
          )
        )
      );
    }

    if (kind === "dot" && response.kind === "dot") {
      responseSection.appendChild(
        createFieldRow(
          "威力倍率",
          createNumberInput(
            response.powerMultiplier,
            (powerMultiplier) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "dot" ? { ...entry, powerMultiplier } : entry
                ),
              })),
            { step: 0.05 }
          )
        )
      );
      responseSection.appendChild(
        createFieldRow(
          "秒数",
          createNumberInput(
            response.durationSec,
            (durationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "dot" ? { ...entry, durationSec } : entry
                ),
              })),
            { min: 0.1, step: 0.5 }
          )
        )
      );
    }

    if (kind === "stun" && response.kind === "stun") {
      responseSection.appendChild(
        createFieldRow(
          "秒数",
          createNumberInput(
            response.durationSec,
            (durationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "stun" ? { ...entry, durationSec } : entry
                ),
              })),
            { min: 0.1, step: 0.5 }
          )
        )
      );
    }

    if (kind === "knockback" && response.kind === "knockback") {
      responseSection.appendChild(
        createFieldRow(
          "距離 px",
          createNumberInput(
            response.distancePx,
            (distancePx) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === "knockback" ? { ...entry, distancePx } : entry
                ),
              })),
            { min: 1, step: 5 }
          )
        )
      );
    }
  }
}

function applyPassiveEffectDefaults(passive: PassiveSkillDef): void {
  switch (passive.effect) {
    case "targetRuleOverride":
      passive.targetRuleOverrideApplyTo ??= "enemy";
      passive.targetRuleOverride ??= {
        kind: "distance",
        side: "enemy",
        order: "nearest",
      };
      break;
    case "evasionChance":
      passive.evasionChance ??= 0.1;
      break;
    case "block":
      passive.blockChance ??= 0.15;
      break;
    case "damageIncrease":
    case "specialEffect":
      passive.specialEffectApplyTo ??= "damage";
      passive.specialEffect ??= {
        scale: 1.2,
        conditions: [{ kind: "debuff", tags: ["def"] }],
      };
      break;
    case "defenseIgnore":
      passive.defenseIgnore ??= { def: { mode: "percent", amount: 0.2 } };
      break;
    case "ignoredDefBonusDamage":
      passive.ignoredDefBonusScale ??= 0.5;
      break;
    case "bonusBasicAttackOnHit":
      passive.chance ??= 0.5;
      passive.bonusBasicAttackHpRatio ??= 0.3;
      break;
    case "seedFlameOnActiveHit":
      break;
    case "bonusActiveOnHit":
      passive.bonusActiveSkillId ??= "at_sorcerer_active_1";
      break;
    case "blazingFlameDetonate":
      passive.blazingFlameDetonateSpreadRadiusPx ??= 50;
      passive.blazingFlameDetonatePerSeedScale ??= 0.5;
      passive.blazingFlameDetonateMultiplier ??= 1.3;
      passive.blazingFlameUncap ??= true;
      break;
    case "periodicDispel":
      passive.periodicTrigger ??= "waveStart";
      passive.dispelTargetRule ??= { kind: "self" };
      passive.dispelCount ??= 0;
      break;
    case "heal":
      passive.healSubKind ??= "hot";
      passive.hotTargetRule ??= { kind: "self" };
      passive.hotAmount ??= { kind: "atkBased", atkScale: 0.05 };
      passive.hotDurationSec ??= 0;
      break;
    case "damageReduction":
      passive.damageReductionTargetRule ??= { kind: "self" };
      passive.damageReductionPercent ??= 0.2;
      break;
    case "threatControl":
      if (
        passive.onDamageTakenFlat === undefined &&
        passive.onDamageTakenScale === undefined &&
        passive.onBlockFlat === undefined &&
        passive.threatDecayMultiplier === undefined &&
        passive.frontThreatFloor === undefined &&
        passive.frontThreatDecayMultiplier === undefined &&
        passive.frontDamageTakenReduction === undefined
      ) {
        passive.onDamageTakenScale = 0.5;
      }
      break;
    case "excessHealToBarrier":
      passive.barrierScale ??= 1;
      passive.excessHealSources ??= ["outgoing"];
      break;
    case "selfHpRatioBuff":
      passive.buffStat ??= "atk";
      passive.buffMultiplierMax ??= 1.5;
      passive.maxBuffAtHpRatio ??= 0;
      break;
    case "excessHealRedirect":
      passive.redirectScale ??= 0.5;
      passive.excessHealSources ??= ["outgoing"];
      break;
    case "targetHpRatioHealScale":
      passive.healScaleMax ??= 1.1;
      passive.maxScaleAtHpRatio ??= 0.4;
      break;
    case "targetHpRatioDamageScale":
      passive.damageScaleMax ??= 1.35;
      passive.minScaleAtHpRatio ??= 0.35;
      break;
    case "idleAtkRamp":
      passive.rampToMaxSec ??= 2.5;
      passive.atkMulMin ??= 1.25;
      passive.atkMulMax ??= 1.6;
      passive.fullRampAttackSpeedMul ??= 0.7;
      break;
    case "ballistaMark":
      passive.ballistaMarkSplashRadiusPx ??= 50;
      passive.ballistaMarkSplashDamageScale ??= 0.3;
      passive.ballistaMarkSelfAttackSpeedMul ??= 0.85;
      break;
    case "dotCompressAssist":
      passive.dotCompressRatio ??= 0.7;
      break;
    case "allyBasicAttackDotProc":
      passive.chance ??= 0.2;
      passive.debuffDotDurationSec ??= 5;
      passive.debuffDotAmount ??= defaultResourceAmount(10, "flat");
      passive.debuffDotDamageType ??= "magic";
      passive.debuffDotFlavor ??= "poison";
      break;
    case "dotDurationMultiplierOnApply":
      passive.dotDurationMultiplierOnApply ??= 1.5;
      break;
    case "dottedEnemyHealReceivedDebuff":
      passive.dottedEnemyHealReceivedMultiplier ??= 0.8;
      break;
    case "conditionalEnemyDamageTakenAura":
      passive.enemyDamageTakenMultiplier ??= 1.2;
      passive.auraConditions ??= [
        { kind: "hasDot" },
        { kind: "targetHp", maxHpRatio: 0.5 },
      ];
      break;
    case "healReservation":
      passive.grantOnHealMaxHpRatio ??= 0.6;
      passive.stackDurationSec ??= 8;
      passive.triggerHpRatio ??= 0.35;
      passive.healAmount ??= defaultResourceAmount(0.75);
      passive.buffDisplayName ??= "癒しの残響";
      break;
    case "barrierBreakRegen":
      passive.barrierAmount ??= defaultResourceAmount(0.85);
      break;
    case "barrierDepletionHeal":
      passive.healAmount ??= defaultResourceAmount(0.65);
      break;
    case "aoeCrowdBonus":
      passive.perExtraTargetScale ??= 0.1;
      passive.maxExtraTargets ??= 4;
      break;
    case "skillAmountOverride":
      passive.targetSkillId ??= "";
      passive.amount ??= defaultResourceAmount(1);
      break;
    case "skillPropertyOverride":
      passive.maxChargesBonus ??= 1;
      break;
    case "extendSelfAppliedDebuff":
      passive.extendSec ??= 2;
      break;
    case "healReceivedIncrease":
      passive.percent ??= 0.2;
      break;
    case "counterChance":
    case "counter":
      passive.counterChance ??= 0.3;
      passive.chance ??= passive.counterChance;
      passive.counterResponses ??= [defaultCounterResponse("damage")];
      passive.counterRange ??= 0;
      break;
    case "buff":
      passive.buffSubKind ??= "stat";
      passive.buffTargetRule ??= { kind: "self" };
      if (passive.buffSubKind === "damageDelay") {
        passive.ratio ??= 0.1;
      } else if (
        passive.buffSubKind === "block" ||
        passive.buffSubKind === "evasion"
      ) {
        passive.chance ??= 0.1;
      } else if (passive.buffSubKind === "barrier") {
        passive.barrierAmount ??= { kind: "defBased", defScale: 0.5 };
        passive.periodicTrigger ??= "stageStart";
      } else {
        passive.buffStat ??= "atk";
        passive.buffMultiplier ??= 1.2;
      }
      break;
    case "debuff":
      passive.debuffSubKind ??= "stat";
      passive.debuffTargetRule ??= {
        kind: "distance",
        side: "enemy",
        order: "nearest",
      };
      passive.debuffStat ??= "atk";
      passive.debuffMultiplier ??= 0.9;
      break;
    case "duelistPride":
      passive.prideHpRatioMin ??= 0.5;
      passive.prideHealMultiplier ??= 0.25;
      break;
    case "lowHpCover":
      passive.coverHpRatioThreshold ??= 0.35;
      passive.coverWaveLimit ??= 3;
      break;
    case "lastStandGuts":
      passive.lastStandGutsDurationSec ??= 4;
      passive.lastStandGutsEndStunSec ??= 1.5;
      passive.lastStandGutsEndKnockbackPx ??= 15;
      break;
    case "bloodlustDuelist":
      passive.bloodlustBlockChance ??= 0.05;
      passive.bloodlustDefMaxBuffAtHpRatio ??= 0.5;
      passive.bloodlustDefBuffMultiplierMax ??= 1.6;
      passive.bloodlustAtkMaxBuffAtHpRatio ??= 0;
      passive.bloodlustAtkBuffMultiplierMax ??= 4;
      passive.bloodlustAtkBuffCurveExponent ??= 1;
      break;
  }
}

function passiveToCounterEffect(passive: PassiveSkillDef): CounterSkillEffect {
  return {
    type: "counter",
    target: { kind: "self" },
    chance: passive.chance ?? passive.counterChance,
    durationSec: 5,
    range: passive.counterRange,
    counterMelee: passive.counterMelee,
    counterRanged: passive.counterRanged,
    responses: passive.counterResponses ?? [defaultCounterResponse("damage")],
  };
}

function applyCounterEffectToPassive(
  passive: PassiveSkillDef,
  effect: CounterSkillEffect
): void {
  passive.counterRange = effect.range;
  passive.counterMelee = effect.counterMelee;
  passive.counterRanged = effect.counterRanged;
  passive.counterResponses = effect.responses;
  if (effect.chance !== undefined) {
    passive.chance = effect.chance;
    passive.counterChance = effect.chance;
  }
}

type EditorActiveEffectCategory =
  (typeof EDITOR_ACTIVE_EFFECT_CATEGORIES)[number];

function categoryToEffectType(
  category: EditorActiveEffectCategory
): SkillEffectKind {
  return category;
}

function effectTypeToCategory(
  type: SkillEffectDef["type"]
): EditorActiveEffectCategory {
  if ((EDITOR_ACTIVE_EFFECT_CATEGORIES as readonly string[]).includes(type)) {
    return type as EditorActiveEffectCategory;
  }
  if (type === "hot") return "heal";
  if (
    type === "dot" ||
    type === "stun" ||
    type === "dispel" ||
    type === "block"
  ) {
    return "debuff";
  }
  if (type === "barrier") return "buff";
  return "damage";
}

const BASIC_ATTACK_EFFECT_CATEGORIES = ["damage", "heal", "barrier"] as const;
type BasicAttackEffectCategory =
  (typeof BASIC_ATTACK_EFFECT_CATEGORIES)[number];

const BASIC_ATTACK_EFFECT_CATEGORY_LABELS: Record<
  BasicAttackEffectCategory,
  string
> = {
  damage: "ダメージ",
  heal: "回復",
  barrier: "バリア",
};

function defaultBasicAttackEffectForCategory(
  category: BasicAttackEffectCategory
): SkillEffectDef {
  if (category === "barrier") {
    return stripBasicAttackTraitFieldsFromEffect({
      target: {
        kind: "stat",
        side: "ally",
        stat: "hp",
        order: "ratio",
      },
      type: "buff",
      buffSubKind: "barrier",
      amount: defaultResourceAmount(),
    });
  }
  return defaultBasicAttackEffect(category);
}

function basicAttackEffectToCategory(
  effect: SkillEffectDef
): BasicAttackEffectCategory {
  if (effect.type === "heal") return "heal";
  if (effect.type === "buff" && effect.buffSubKind === "barrier")
    return "barrier";
  return "damage";
}

function withDebuffDotDefaults(
  effect: Extract<SkillEffectDef, { type: "debuff" }>
): Extract<SkillEffectDef, { type: "debuff" }> {
  return {
    ...effect,
    durationSec:
      effect.durationSec ??
      effect.debuffDurationSec ??
      DEFAULT_DOT_DURATION_SEC,
    amount: effect.amount ?? normalizeEffectAmount(effect),
    damageType: effect.damageType ?? "physical",
  };
}

const DEFAULT_HOT_DURATION_SEC = 5;

function withEditorEffectDefaults(effect: SkillEffectDef): SkillEffectDef {
  const normalized = normalizeLegacyEffect(effect);
  if (
    normalized.type === "heal" &&
    (normalized.healSubKind ?? "instant") === "hot"
  ) {
    return applyActiveHealSubKindChange(normalized, "hot");
  }
  if (normalized.type === "debuff" && normalized.debuffSubKind === "dot") {
    return withDebuffDotDefaults(normalized);
  }
  return normalized;
}

function editorEffectNeedsDefaultSync(
  before: SkillEffectDef,
  after: SkillEffectDef
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function normalizeLegacyEffect(effect: SkillEffectDef): SkillEffectDef {
  if (effect.type === "hot") {
    return {
      ...effect,
      type: "heal",
      healSubKind: "hot",
      amount: effect.amount,
      durationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  if (effect.type === "dot") {
    return withDebuffDotDefaults({
      ...effect,
      type: "debuff",
      debuffSubKind: "dot",
    } as Extract<SkillEffectDef, { type: "debuff" }>);
  }
  if (effect.type === "stun") {
    return {
      ...effect,
      type: "debuff",
      debuffSubKind: "stun",
      durationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  if (effect.type === "dispel") {
    return {
      ...effect,
      type: "heal",
      healSubKind: "dispel",
      dispelTags: effect.dispelTags,
      dispelCount: effect.dispelCount,
      ...(effect.dispelPriority
        ? { dispelPriority: effect.dispelPriority }
        : {}),
    } as SkillEffectDef;
  }
  if (effect.type === "barrier") {
    return {
      ...effect,
      type: "buff",
      buffSubKind: "barrier",
      amount: effect.amount,
      barrierStack: effect.barrierStack,
    } as SkillEffectDef;
  }
  if (effect.type === "block") {
    return {
      ...effect,
      type: "buff",
      buffSubKind: "block",
      chance: effect.blockChance,
      buffDurationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  if (effect.type === "buff" && effect.buffSubKind === "basicAttackTransform") {
    const { buffSubKind: _sub, type: _type, ...rest } = effect;
    return {
      ...rest,
      type: "basicAttackTransform",
      target: { kind: "self" },
    } as SkillEffectDef;
  }
  return effect;
}

function resolveBasicAttackPrimaryContentMode(
  effect: Extract<SkillEffectDef, { type: "basicAttackTransform" }>
): "inherit" | "damage" | "heal" {
  const override = effect.primaryEffectOverride;
  if (!override) return "inherit";
  if (override.type === "heal") return "heal";
  if (override.type === "damage") return "damage";
  return "inherit";
}

function appendBasicAttackTransformFields(
  detailGrid: HTMLElement,
  effect: Extract<SkillEffectDef, { type: "basicAttackTransform" }>,
  patchEffect: (
    patch: SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef),
    options?: { rerender?: boolean }
  ) => void
): void {
  detailGrid.appendChild(
    createFieldRow(
      "秒数",
      createNumberInput(
        effect.buffDurationSec ?? 5,
        (buffDurationSec) =>
          patchEffect((prev) =>
            prev.type === "basicAttackTransform"
              ? { ...prev, buffDurationSec, target: { kind: "self" } }
              : prev
          ),
        { min: 0.1, step: 0.5 }
      )
    )
  );
  detailGrid.appendChild(
    createFieldRow(
      "攻撃回数（2以上・省略=1）",
      createNumberInput(
        effect.hitCountMultiplier ?? 1,
        (hitCountMultiplier) =>
          patchEffect((prev) =>
            prev.type === "basicAttackTransform"
              ? {
                  ...prev,
                  target: { kind: "self" },
                  hitCountMultiplier:
                    hitCountMultiplier > 1 ? hitCountMultiplier : undefined,
                }
              : prev
          ),
        { min: 1, step: 0.5 }
      )
    )
  );
  const primaryMode = resolveBasicAttackPrimaryContentMode(effect);
  detailGrid.appendChild(
    createFieldRow(
      "通常攻撃の内容",
      createSelect(
        primaryMode,
        [
          { value: "inherit", label: "変更なし（パッチのみ）" },
          { value: "damage", label: "ダメージ" },
          { value: "heal", label: "回復" },
        ],
        (mode) =>
          patchEffect(
            (prev) => {
              if (prev.type !== "basicAttackTransform") return prev;
              if (mode === "inherit") {
                const { primaryEffectOverride: _, ...rest } = prev;
                return { ...rest, target: { kind: "self" } };
              }
              if (mode === "damage") {
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryEffectOverride: {
                    type: "damage",
                    target: {
                      kind: "distance",
                      side: "enemy",
                      order: "nearest",
                    },
                    amount: defaultResourceAmount(),
                  },
                };
              }
              return {
                ...prev,
                target: { kind: "self" },
                primaryEffectOverride: {
                  type: "heal",
                  healSubKind: "instant",
                  target: {
                    kind: "stat",
                    side: "ally",
                    stat: "hp",
                    order: "ratio",
                  },
                  amount: defaultResourceAmount(0.5),
                },
              };
            },
            { rerender: true }
          )
      )
    )
  );
  if (primaryMode === "inherit") {
    detailGrid.appendChild(
      createFieldRow(
        "primary damageType",
        createSelect(
          effect.primaryPatch?.damageType ?? "",
          [
            { value: "", label: "（変更なし）" },
            ...DAMAGE_TYPE_OPTIONS.map((value) => ({
              value,
              label: value,
            })),
          ],
          (damageType) =>
            patchEffect((prev) => {
              if (prev.type !== "basicAttackTransform") return prev;
              const primaryPatch = { ...(prev.primaryPatch ?? {}) };
              if (damageType === "") {
                delete primaryPatch.damageType;
              } else {
                primaryPatch.damageType =
                  damageType as import("../battle/types.ts").DamageType;
              }
              return {
                ...prev,
                target: { kind: "self" },
                primaryPatch:
                  Object.keys(primaryPatch).length > 0
                    ? primaryPatch
                    : undefined,
              };
            })
        )
      )
    );
  }
  if (primaryMode === "inherit") {
    detailGrid.appendChild(
      createFieldRow(
        "primary atkScale",
        createNumberInput(
          effect.primaryPatch?.amount?.atkScale ?? 1,
          (atkScale) =>
            patchEffect((prev) => {
              if (prev.type !== "basicAttackTransform") return prev;
              const primaryPatch = { ...(prev.primaryPatch ?? {}) };
              if (atkScale === 1) {
                if (primaryPatch.amount) {
                  const { atkScale: _, ...restAmount } = primaryPatch.amount;
                  primaryPatch.amount =
                    Object.keys(restAmount).length > 0 ? restAmount : undefined;
                }
              } else {
                primaryPatch.amount = {
                  ...(primaryPatch.amount ?? {}),
                  atkScale,
                };
              }
              return {
                ...prev,
                target: { kind: "self" },
                primaryPatch:
                  Object.keys(primaryPatch).length > 0 ||
                  primaryPatch.amount !== undefined
                    ? primaryPatch
                    : undefined,
              };
            }),
          { min: 0, step: 0.05 }
        )
      )
    );
    detailGrid.appendChild(
      createFieldRow(
        "primary hitCount",
        createNumberInput(
          effect.primaryPatch?.hitCount ?? 0,
          (hitCount) =>
            patchEffect((prev) => {
              if (prev.type !== "basicAttackTransform") return prev;
              const primaryPatch = { ...(prev.primaryPatch ?? {}) };
              if (hitCount <= 0) {
                delete primaryPatch.hitCount;
              } else {
                primaryPatch.hitCount = Math.round(hitCount);
              }
              return {
                ...prev,
                target: { kind: "self" },
                primaryPatch:
                  Object.keys(primaryPatch).length > 0
                    ? primaryPatch
                    : undefined,
              };
            }),
          { min: 0, step: 1 }
        )
      )
    );
    detailGrid.appendChild(
      createFieldRow(
        "primary hitDurationSec",
        createNumberInput(
          effect.primaryPatch?.hitDurationSec ?? 0,
          (hitDurationSec) =>
            patchEffect((prev) => {
              if (prev.type !== "basicAttackTransform") return prev;
              const primaryPatch = { ...(prev.primaryPatch ?? {}) };
              if (hitDurationSec <= 0) {
                delete primaryPatch.hitDurationSec;
              } else {
                primaryPatch.hitDurationSec = hitDurationSec;
              }
              return {
                ...prev,
                target: { kind: "self" },
                primaryPatch:
                  Object.keys(primaryPatch).length > 0
                    ? primaryPatch
                    : undefined,
              };
            }),
          { min: 0, step: 0.01 }
        )
      )
    );
    if (effect.primaryPatch?.target !== undefined) {
      appendTargetSpecFields(detailGrid, effect.primaryPatch.target, (target) =>
        patchEffect(
          (prev) => {
            if (prev.type !== "basicAttackTransform") return prev;
            return {
              ...prev,
              target: { kind: "self" },
              primaryPatch: { ...(prev.primaryPatch ?? {}), target },
            };
          },
          { rerender: false }
        )
      );
      detailGrid.appendChild(
        createActionButton(
          "primary target パッチを削除",
          "editor-btn editor-btn-small",
          () =>
            patchEffect(
              (prev) => {
                if (prev.type !== "basicAttackTransform" || !prev.primaryPatch)
                  return prev;
                const { target: _, ...restPatch } = prev.primaryPatch;
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryPatch:
                    Object.keys(restPatch).length > 0 ? restPatch : undefined,
                };
              },
              { rerender: true }
            )
        )
      );
    } else {
      detailGrid.appendChild(
        createActionButton(
          "primary target パッチを追加",
          "editor-btn editor-btn-small",
          () =>
            patchEffect(
              (prev) => {
                if (prev.type !== "basicAttackTransform") return prev;
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryPatch: {
                    ...(prev.primaryPatch ?? {}),
                    target: {
                      kind: "distance",
                      side: "enemy",
                      order: "nearest",
                    },
                  },
                };
              },
              { rerender: true }
            )
        )
      );
    }
    detailGrid.appendChild(
      createFieldRow(
        "primary targetShape",
        createSelect(
          effect.primaryPatch?.targetShape ?? "",
          [
            { value: "", label: "（変更なし）" },
            ...(["single", "aoe"] as const).map((value) => ({
              value,
              label: TARGET_SHAPE_LABELS[value],
            })),
          ],
          (targetShape) =>
            patchEffect(
              (prev) => {
                if (prev.type !== "basicAttackTransform") return prev;
                const primaryPatch = { ...(prev.primaryPatch ?? {}) };
                if (targetShape === "") {
                  delete primaryPatch.targetShape;
                  delete primaryPatch.aoeRadiusPx;
                } else {
                  primaryPatch.targetShape = targetShape as TargetShape;
                  if (targetShape === "aoe") {
                    primaryPatch.aoeRadiusPx ??= 70;
                  } else {
                    delete primaryPatch.aoeRadiusPx;
                  }
                }
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryPatch:
                    Object.keys(primaryPatch).length > 0
                      ? primaryPatch
                      : undefined,
                };
              },
              { rerender: true }
            )
        )
      )
    );
    if (effect.primaryPatch?.targetShape === "aoe") {
      detailGrid.appendChild(
        createFieldRow(
          "primary aoe 半径 px",
          createNumberInput(
            effect.primaryPatch?.aoeRadiusPx ?? 70,
            (aoeRadiusPx) =>
              patchEffect((prev) => {
                if (prev.type !== "basicAttackTransform") return prev;
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryPatch: {
                    ...(prev.primaryPatch ?? {}),
                    targetShape: "aoe",
                    aoeRadiusPx,
                  },
                };
              }),
            { min: 1, step: 10 }
          )
        )
      );
    }
  } else {
    const overrideDefaultAtkScale = primaryMode === "heal" ? 0.5 : 1;
    if (primaryMode === "damage") {
      const overrideDamage = effect.primaryEffectOverride;
      detailGrid.appendChild(
        createFieldRow(
          "primary ダメージ種",
          createSelect(
            overrideDamage?.type === "damage"
              ? overrideDamage.damageType ?? "physical"
              : "physical",
            DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
            (damageType) =>
              patchEffect((prev) => {
                if (prev.type !== "basicAttackTransform") return prev;
                const override = prev.primaryEffectOverride;
                if (!override || override.type !== "damage") return prev;
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryEffectOverride: {
                    ...override,
                    damageType: damageType as DamageType,
                  },
                };
              })
          )
        )
      );
      appendResourceAmountFields(
        detailGrid,
        overrideDamage?.type === "damage" && overrideDamage.amount
          ? overrideDamage.amount
          : defaultResourceAmount(1),
        (amount) =>
          patchEffect((prev) => {
            if (prev.type !== "basicAttackTransform") return prev;
            const override = prev.primaryEffectOverride;
            if (!override || override.type !== "damage") return prev;
            return {
              ...prev,
              target: { kind: "self" },
              primaryEffectOverride: {
                ...override,
                amount,
              },
            };
          })
      );
    } else {
      detailGrid.appendChild(
        createFieldRow(
          "primary atkScale",
          createNumberInput(
            effect.primaryEffectOverride?.amount?.atkScale ??
              overrideDefaultAtkScale,
            (atkScale) =>
              patchEffect((prev) => {
                if (prev.type !== "basicAttackTransform") return prev;
                const override = prev.primaryEffectOverride;
                if (!override) return prev;
                return {
                  ...prev,
                  target: { kind: "self" },
                  primaryEffectOverride: {
                    ...override,
                    amount: {
                      ...(override.amount ??
                        defaultResourceAmount(overrideDefaultAtkScale)),
                      kind: "atkBased",
                      atkScale,
                    },
                  },
                };
              }),
            { min: 0, step: 0.05 }
          )
        )
      );
    }
    const override = effect.primaryEffectOverride;
    if (
      override &&
      override.type !== "move" &&
      override.type !== "counter" &&
      override.type !== "basicAttackTransform"
    ) {
      appendTargetSpecFields(detailGrid, getEffectTarget(override), (target) =>
        patchEffect(
          (prev) => {
            if (
              prev.type !== "basicAttackTransform" ||
              !prev.primaryEffectOverride
            ) {
              return prev;
            }
            return {
              ...prev,
              target: { kind: "self" },
              primaryEffectOverride: {
                ...prev.primaryEffectOverride,
                target,
              },
            };
          },
          { rerender: false }
        )
      );
    }
  }
}

function normalizeEffectAmount(effect: {
  amount?: ResourceAmountSpec;
  powerMultiplier?: number;
}): ResourceAmountSpec {
  if (effect.amount) return effect.amount;
  const legacy = effect.powerMultiplier;
  return defaultResourceAmount(legacy ?? 1);
}

type EffectPatch = SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef);

function applyActiveHealSubKindChange(
  prev: SkillEffectDef,
  healSubKind: HealSubKind
): Extract<SkillEffectDef, { type: "heal" }> {
  const base = {
    ...(prev.type === "heal" ? prev : { ...prev, type: "heal" as const }),
    type: "heal" as const,
    healSubKind,
  };
  switch (healSubKind) {
    case "hot":
      return {
        ...base,
        durationSec: base.durationSec ?? DEFAULT_HOT_DURATION_SEC,
        amount: base.amount ?? defaultResourceAmount(),
      };
    case "dispel":
      return {
        ...base,
        dispelCount: base.dispelCount ?? 0,
      };
    case "instant": {
      const next = {
        ...base,
        amount: base.amount ?? defaultResourceAmount(),
      };
      delete next.durationSec;
      delete next.dispelTags;
      delete next.dispelCount;
      delete next.dispelPriority;
      return next;
    }
  }
}

function applyActiveBuffSubKindChange(
  prev: SkillEffectDef,
  buffSubKind: import("../battle/types.ts").BuffSubKind
): SkillEffectDef {
  if (prev.type !== "buff") {
    return { ...prev, buffSubKind } as SkillEffectDef;
  }
  const base = { ...prev, buffSubKind };
  switch (buffSubKind) {
    case "damageDelay":
      return {
        ...base,
        ratio: prev.ratio ?? 0.1,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case "allyAttackFollowUp":
      return {
        ...base,
        buffDurationSec: prev.buffDurationSec ?? 8,
        allyFollowUpRadiusPx: prev.allyFollowUpRadiusPx ?? 70,
        followUpDefDebuffMultiplier: prev.followUpDefDebuffMultiplier ?? 0.95,
        followUpDefDebuffDurationSec: prev.followUpDefDebuffDurationSec ?? 5,
      };
    case "block":
    case "evasion":
      return {
        ...base,
        chance: prev.chance ?? 0.2,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case "stat":
      return {
        ...base,
        buffStat: prev.buffStat ?? "atk",
        buffMultiplier: prev.buffMultiplier ?? 1.2,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case "barrier":
      return {
        ...base,
        amount: prev.amount ?? defaultResourceAmount(),
      };
    case "wardBarrier":
      return {
        ...base,
        stacks: prev.stacks ?? 2,
        damageReductionRatio: prev.damageReductionRatio ?? 0.1,
      };
    default:
      return base;
  }
}

function patchEffectState(
  initial: SkillEffectDef,
  onUpdate: (effect: SkillEffectDef, options?: { rerender?: boolean }) => void
): {
  patch: (patch: EffectPatch, options?: { rerender?: boolean }) => void;
  get: () => SkillEffectDef;
} {
  let current = initial;
  return {
    get: () => current,
    patch: (patch, options) => {
      current = typeof patch === "function" ? patch(current) : patch;
      onUpdate(current, options);
    },
  };
}

function patchPercentMaxHpRef(
  prev: ResourceAmountSpec,
  maxHpRef: MaxHpReference
): ResourceAmountSpec {
  if (maxHpRef === "target") {
    const { maxHpRef: _, ...rest } = prev;
    return rest;
  }
  return { ...prev, maxHpRef };
}

function appendResourceAmountFields(
  grid: HTMLElement,
  amount: ResourceAmountSpec,
  onUpdate: (
    amount: ResourceAmountSpec,
    options?: { rerender?: boolean }
  ) => void
): void {
  let current = amount;
  const patchAmount = (
    patch: (prev: ResourceAmountSpec) => ResourceAmountSpec,
    options?: { rerender?: boolean }
  ) => {
    current = patch(current);
    onUpdate(current, options);
  };

  grid.appendChild(
    createFieldRow(
      "効果量種別",
      createSelect(
        amount.kind,
        RESOURCE_AMOUNT_KIND_OPTIONS.map((value) => ({
          value,
          label: RESOURCE_AMOUNT_KIND_LABELS[value],
        })),
        (kind) => {
          if (kind === "atkBased") {
            patchAmount(() => defaultResourceAmount(current.atkScale ?? 1), {
              rerender: true,
            });
          } else if (kind === "defBased") {
            patchAmount(() => defaultDefResourceAmount(current.defScale ?? 1), {
              rerender: true,
            });
          } else if (kind === "flat") {
            patchAmount(() => ({ kind, flatAmount: current.flatAmount ?? 0 }), {
              rerender: true,
            });
          } else {
            patchAmount(
              () => ({
                kind,
                percentOfMaxHp: current.percentOfMaxHp ?? 0.1,
                ...(current.maxHpRef === "self"
                  ? { maxHpRef: "self" as const }
                  : {}),
              }),
              { rerender: true }
            );
          }
        }
      )
    )
  );

  if (amount.kind === "atkBased") {
    grid.appendChild(
      createFieldRow(
        "ATK 加減",
        createNumberInput(
          amount.atkOffset ?? 0,
          (atkOffset) => patchAmount((prev) => ({ ...prev, atkOffset })),
          { step: 1 }
        )
      )
    );
    grid.appendChild(
      createFieldRow(
        "ATK 倍率",
        createNumberInput(
          amount.atkScale ?? 1,
          (atkScale) => patchAmount((prev) => ({ ...prev, atkScale })),
          { step: 0.01 }
        )
      )
    );
    return;
  }

  if (amount.kind === "defBased") {
    grid.appendChild(
      createFieldRow(
        "DEF 加減",
        createNumberInput(
          amount.defOffset ?? 0,
          (defOffset) => patchAmount((prev) => ({ ...prev, defOffset })),
          { step: 1 }
        )
      )
    );
    grid.appendChild(
      createFieldRow(
        "DEF 倍率",
        createNumberInput(
          amount.defScale ?? 1,
          (defScale) => patchAmount((prev) => ({ ...prev, defScale })),
          { step: 0.01 }
        )
      )
    );
    return;
  }

  if (amount.kind === "flat") {
    grid.appendChild(
      createFieldRow(
        "固定値",
        createNumberInput(
          amount.flatAmount ?? 0,
          (flatAmount) => patchAmount((prev) => ({ ...prev, flatAmount })),
          { step: 1 }
        )
      )
    );
    return;
  }

  const maxHpRef = amount.maxHpRef ?? "target";
  grid.appendChild(
    createFieldRow(
      "参照",
      createRadioGroup(
        maxHpRef,
        MAX_HP_REFERENCES.map((value) => ({
          value,
          label: MAX_HP_REF_LABELS[value],
        })),
        (next) => patchAmount((prev) => patchPercentMaxHpRef(prev, next)),
        `maxHpRef-${crypto.randomUUID()}`
      )
    )
  );
  grid.appendChild(
    createFieldRow(
      "maxHp 割合 (%)",
      createNumberInput(
        (amount.percentOfMaxHp ?? 0) * 100,
        (percent) =>
          patchAmount((prev) => ({
            ...prev,
            percentOfMaxHp: percent / 100,
          })),
        { step: 1, min: 0 }
      )
    )
  );
}

function appendEffectSequenceTimingFields(
  parent: HTMLElement,
  effect: SkillEffectDef,
  patchEffect: (patch: EffectPatch, options?: { rerender?: boolean }) => void,
  isLastEffect: boolean
): void {
  const section = createSection("シーケンス（タイミング）");
  parent.appendChild(section);
  section.appendChild(
    createEl(
      "p",
      "editor-hint",
      isLastEffect
        ? "move を含むスキル: 最終 effect 適用後、スキルモーションを維持する秒数です（接敵 clamp による即座の復帰を防ぐ）。"
        : "move を含むスキル: この effect 適用後、次の effect まで待機する秒数です。"
    )
  );
  const grid = appendGrid(section);
  grid.appendChild(
    createFieldRow(
      isLastEffect ? "適用後の待機（秒）" : "次の効果まで待機（秒）",
      createNumberInput(
        effect.waitAfterSec ?? 0,
        (waitAfterSec) =>
          patchEffect((prev) => {
            const next = { ...prev } as SkillEffectDef;
            if (waitAfterSec <= 0) {
              delete next.waitAfterSec;
            } else {
              next.waitAfterSec = waitAfterSec;
            }
            return next;
          }),
        { min: 0, step: 0.05 }
      )
    )
  );
}

function appendEffectPresentationFields(
  parent: HTMLElement,
  effect: SkillEffectDef,
  patchEffect: (patch: EffectPatch, options?: { rerender?: boolean }) => void,
  labLink?: {
    entityKind: "class" | "enemy";
    entityId: string;
    skillId: string;
    effectIndex: number;
  }
): void {
  const section = createSection("演出（この effect）");
  parent.appendChild(section);
  const grid = appendGrid(section);

  grid.appendChild(
    createFieldRow(
      "スプライトアニメ",
      createSelect(
        effect.anim ?? "",
        [
          { value: "", label: "— 種別の既定 —" },
          ...SKILL_EFFECT_ANIM_OPTIONS.map((value) => ({
            value,
            label: SKILL_EFFECT_ANIM_LABELS[value],
          })),
        ],
        (value) => {
          patchEffect((prev) => {
            const next = { ...prev } as SkillEffectDef;
            if (value.length === 0) {
              delete next.anim;
            } else {
              next.anim = value as SkillEffectAnimId;
            }
            return next;
          });
        }
      )
    )
  );

  if (effect.vfx) {
    const enabledRow = createEl("div", "editor-field editor-field-checkbox");
    const enabledInput = createEl("input") as HTMLInputElement;
    enabledInput.type = "checkbox";
    enabledInput.checked = effect.vfx.enabled !== false;
    enabledInput.addEventListener("change", () => {
      patchEffect((prev) => ({
        ...prev,
        vfx: {
          ...prev.vfx!,
          enabled: enabledInput.checked,
        },
      }));
    });
    enabledRow.appendChild(createEl("label", undefined, "PNG VFX 有効"));
    enabledRow.appendChild(enabledInput);
    grid.appendChild(enabledRow);
    section.appendChild(
      createButton("effect VFX を削除", "editor-btn editor-btn-small", () => {
        patchEffect(
          (prev) => {
            const next = { ...prev } as SkillEffectDef;
            delete next.vfx;
            return next;
          },
          { rerender: true }
        );
      })
    );
  }

  if (labLink) {
    const linkRow = createEl("p", "presentation-lab-open-link");
    const link = createEl("a") as HTMLAnchorElement;
    const params = new URLSearchParams({
      entityKind: labLink.entityKind,
      entityId: labLink.entityId,
      skillId: labLink.skillId,
      effectIndex: String(labLink.effectIndex),
    });
    link.href = `presentation-lab.html?${params.toString()}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "演出ラボでプレビュー";
    linkRow.appendChild(link);
    section.appendChild(linkRow);
  }
}

function defaultBasicAttackEffect(type: SkillEffectKind): SkillEffectDef {
  return stripBasicAttackTraitFieldsFromEffect(defaultEffect(type));
}

function defaultEffect(type: SkillEffectKind): SkillEffectDef {
  const target = defaultTargetForEffectType(type);
  switch (type) {
    case "damage":
      return {
        target,
        type: "damage",
        damageType: "physical",
        amount: defaultResourceAmount(),
      };
    case "heal":
      return {
        target,
        type: "heal",
        healSubKind: "instant",
        amount: defaultResourceAmount(),
      };
    case "buff":
      return {
        target,
        type: "buff",
        buffSubKind: "stat",
        buffStat: "atk",
        buffMultiplier: 1.2,
        buffDurationSec: 5,
      };
    case "debuff":
      return {
        target,
        type: "debuff",
        debuffSubKind: "stat",
        debuffStat: "def",
        debuffMultiplier: 0.8,
        debuffDurationSec: 5,
      };
    case "dot":
      return {
        target,
        type: "debuff",
        debuffSubKind: "dot",
        durationSec: DEFAULT_DOT_DURATION_SEC,
        amount: defaultResourceAmount(0.2),
        damageType: "physical",
      };
    case "barrier":
      return { target, type: "barrier", amount: defaultResourceAmount() };
    case "move":
      return {
        target,
        type: "move",
        moveMode: "engage",
        moveDurationSec: 0.25,
      };
    case "stun":
      return { target, type: "stun", durationSec: 1 };
    case "knockback":
      return { target, type: "knockback", distancePx: 30 };
    case "dispel":
      return { target, type: "dispel", dispelCount: 0 };
    case "block":
      return {
        target,
        type: "block",
        blockChance: 0.2,
        durationSec: 5,
      };
    case "counter":
      return {
        target: { kind: "self" },
        type: "counter",
        chance: 0.3,
        responses: [defaultCounterResponse("damage")],
        durationSec: 5,
        range: 0,
      };
    case "basicAttackTransform":
      return {
        target: { kind: "self" },
        type: "basicAttackTransform",
        buffDurationSec: 5,
        hitCountMultiplier: 2,
      };
    case "conditionalEffect":
      return {
        type: "conditionalEffect",
        conditions: [{ kind: "enemyCount", min: 3, scope: "inRange" }],
        thenEffects: [defaultEffect("damage")],
        elseEffects: [defaultEffect("damage")],
      };
    case "herbalPotencyConsume":
      return {
        target: { kind: "all", side: "ally" },
        type: "herbalPotencyConsume",
      };
    case "blockResonanceConsume":
      return {
        type: "blockResonanceConsume",
      };
    case "enemyReelIn":
      return {
        target: { kind: "attackType", ranged: true },
        type: "enemyReelIn",
        targetShape: "single",
      };
    case "arenaDominance":
      return {
        target: { kind: "self" },
        type: "arenaDominance",
        durationSec: 15,
      };
    case "grantNextOutgoingDamage":
      return {
        target: { kind: "self" },
        type: "grantNextOutgoingDamage",
        nextOutgoingDamageMultiplier: 1.3,
      };
    case "placedField":
      return {
        target: { kind: "clusterCenter", side: "enemy" },
        type: "placedField",
        fieldRadiusPx: 70,
        fieldDurationSec: 5,
        stayTickIntervalSec: 1,
        enterEffects: [],
        stayEffects: [],
      };
    case "dotCompress":
      return {
        target: { kind: "all", side: "enemy" },
        type: "dotCompress",
        compressRatio: 0.5,
      };
    case "dotExtend":
      return {
        target: { kind: "all", side: "enemy" },
        type: "dotExtend",
        extendRatio: 1.25,
      };
    case "dotHarvest":
      return {
        target: { kind: "distance", side: "enemy", order: "nearest" },
        type: "dotHarvest",
        harvestRatio: 0.1,
      };
    case "poisonSpread":
      return {
        target: { kind: "distance", side: "enemy", order: "nearest" },
        type: "poisonSpread",
        spreadRadiusPx: 70,
        spreadDurationRatio: 0.5,
        dotFlavor: "poison",
      };
  }
}

export interface SkillEditorEntityPicker {
  label: string;
  items: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export interface SkillEditorClassIdentity {
  classId: string;
  displayName: string;
  onClassIdChange: (classId: string) => void;
  onDisplayNameChange: (displayName: string) => void;
  sectionExpandedState?: Map<string, boolean>;
}

export interface SkillEditorStepOptions {
  getEntries: () => SkillDraftEntry[];
  onChange: (entries: SkillDraftEntry[]) => void;
  onSave: () => void;
  isIdReadonly?: (entry: SkillDraftEntry) => boolean;
  onSkillIdChange?: (oldId: string, newId: string, kind: SkillSlotKind) => void;
  onRemoveSkill?: (index: number) => void;
  entityPicker?: SkillEditorEntityPicker;
  classIdentity?: SkillEditorClassIdentity;
  onAddSkill?: (kind: SkillSlotKind) => void;
  saving?: boolean;
  hideSave?: boolean;
  /** entityPicker / classIdentity を別ホストで描画済みのとき true */
  hideEntityHeader?: boolean;
  /** 敵の通常攻撃: interval の代わりに SPD 段階を編集 */
  basicAttackSpeedTier?: {
    get: () => AttackSpeedTier;
    onChange: (tier: AttackSpeedTier) => void;
  };
  /** +数値 射程入力の加算基準（traits.rangePx） */
  getTraitsRangePx?: () => number;
  /** 通常攻撃のダメージ種（traits.damageType） */
  getTraitsDamageType?: () => DamageType;
  onTraitsDamageTypeChange?: (damageType: DamageType) => void;
}

export function renderEntityPicker(
  container: HTMLElement,
  entityPicker: SkillEditorEntityPicker
): void {
  const picker = createEl("div", "editor-picker");
  const select = createEl("select", "editor-select") as HTMLSelectElement;
  const emptyOpt = createEl("option") as HTMLOptionElement;
  emptyOpt.value = "";
  emptyOpt.textContent = "— 選択 —";
  select.appendChild(emptyOpt);
  for (const item of entityPicker.items) {
    const opt = createEl("option") as HTMLOptionElement;
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
  if (
    entityPicker.selectedId &&
    entityPicker.items.some((item) => item.id === entityPicker.selectedId)
  ) {
    select.value = entityPicker.selectedId;
  }
  select.addEventListener("change", () => {
    if (select.value) entityPicker.onSelect(select.value);
  });
  picker.appendChild(
    createEl("span", "editor-picker-label", entityPicker.label)
  );
  picker.appendChild(select);
  container.appendChild(picker);
}

export function renderClassIdentity(
  container: HTMLElement,
  classIdentity: SkillEditorClassIdentity
): void {
  const summaryText = [classIdentity.classId, classIdentity.displayName]
    .filter((part) => part.trim().length > 0)
    .join(" / ");

  const renderFields = (parent: HTMLElement) => {
    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        "classId",
        createTextInput(classIdentity.classId, (classId) => {
          classIdentity.onClassIdChange(classId);
        })
      )
    );
    grid.appendChild(
      createFieldRow(
        "表示名",
        createTextInput(classIdentity.displayName, (displayName) => {
          classIdentity.onDisplayNameChange(displayName);
        })
      )
    );
    parent.appendChild(
      createEl(
        "p",
        "editor-hint",
        "classId 確定後、通常攻撃（{classId}_basic_attack）を自動追加します。"
      )
    );
  };

  if (classIdentity.sectionExpandedState) {
    const { details, body } = createCollapsibleSection({
      id: "class-identity",
      title: "クラス ID",
      summaryExtra: summaryText || "—",
      expandedState: classIdentity.sectionExpandedState,
    });
    renderFields(body);
    container.appendChild(details);
    return;
  }

  const identity = createSection("クラス ID");
  container.appendChild(identity);
  renderFields(identity);
}

function skillCardTitle(entry: SkillDraftEntry, idReadonly: boolean): string {
  if (idReadonly) {
    return "通常攻撃";
  }
  const skill = entry.passive ?? entry.active;
  if (skill?.name?.trim()) return skill.name.trim();
  if (skill?.id?.trim()) return skill.id.trim();
  return entry.ref.kind === "passive" ? "パッシブ" : "アクティブ";
}

type SkillEntryKind = "passive" | "active" | "basic";

function skillEntryKind(
  entry: SkillDraftEntry,
  idReadonly: boolean
): SkillEntryKind {
  if (idReadonly) return "basic";
  return entry.ref.kind === "passive" ? "passive" : "active";
}

function skillExpansionKey(entry: SkillDraftEntry, index: number): string {
  const id = entry.ref.skillId?.trim();
  return id || `index:${index}`;
}

const SKILL_KIND_LABELS: Record<SkillEntryKind, string> = {
  passive: "パッシブ",
  active: "アクティブ",
  basic: "通常攻撃",
};

export class SkillEditorStep {
  private container: HTMLElement;
  private skillExpandedState = new Map<string, boolean>();
  private readonly gameTermPanel: GameTermPanel;

  constructor(container: HTMLElement, private options: SkillEditorStepOptions) {
    this.container = container;
    this.gameTermPanel = new GameTermPanel(container, { locale: "ja" });
    this.gameTermPanel.mount();
    this.render();
  }

  update(options: SkillEditorStepOptions): void {
    this.options = options;
    this.render();
  }

  expandSkill(skillId: string): void {
    this.skillExpandedState.set(skillId, true);
  }

  private resolveTraitsRangePx(): number {
    return this.options.getTraitsRangePx?.() ?? 0;
  }

  private commitEntries(
    mutate: (entries: SkillDraftEntry[]) => void,
    options?: { rerender?: boolean }
  ): void {
    const next = structuredClone(this.options.getEntries());
    mutate(next);
    this.options.onChange(next);
    if (options?.rerender) {
      this.render();
    }
  }

  private patchPassive(
    index: number,
    patch: (passive: PassiveSkillDef) => void,
    options?: { rerender?: boolean }
  ): void {
    this.commitEntries((next) => {
      const passive = next[index]?.passive;
      if (!passive) return;
      patch(passive);
    }, options);
  }

  private patchActive(
    index: number,
    patch: (active: ActiveSkillDef) => void,
    options?: { rerender?: boolean }
  ): void {
    this.commitEntries((next) => {
      const active = next[index]?.active;
      if (!active) return;
      patch(active);
    }, options);
  }

  destroy(): void {
    this.container.replaceChildren();
  }

  private render(): void {
    const { getEntries, onSave, saving } = this.options;
    const entries = getEntries();
    preserveScrollDuring(() => {
      this.container.replaceChildren();
      this.renderContent(entries, onSave, saving);
    });
  }

  private renderContent(
    entries: SkillDraftEntry[],
    onSave: () => void,
    saving?: boolean
  ): void {
    const {
      entityPicker,
      classIdentity,
      onAddSkill,
      hideSave,
      hideEntityHeader,
    } = this.options;

    if (!hideEntityHeader) {
      if (entityPicker) {
        renderEntityPicker(this.container, entityPicker);
      }
      if (classIdentity) {
        renderClassIdentity(this.container, classIdentity);
      }
    }

    const header = createEl("div", "editor-step-header");
    header.appendChild(createEl("h2", "editor-step-title", "スキル定義"));
    header.appendChild(
      createEl(
        "p",
        "editor-step-desc",
        classIdentity
          ? "パッシブ / アクティブを追加し、各スキルの習得 Lv（0 = 初期）を設定します。"
          : "参照されているスキル ID ごとに定義を編集します。"
      )
    );
    this.container.appendChild(header);

    const passiveIndices: number[] = [];
    const basicAttackIndices: number[] = [];
    const otherActiveIndices: number[] = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (entry.ref.kind === "passive") {
        passiveIndices.push(index);
      } else if (this.isBasicAttackEntry(entry)) {
        basicAttackIndices.push(index);
      } else {
        otherActiveIndices.push(index);
      }
    }

    this.renderSkillKindSection(
      "パッシブ",
      "passive",
      entries,
      passiveIndices,
      classIdentity
        ? "パッシブスキルがありません。下のボタンから追加できます。"
        : "参照されているパッシブスキルがありません。",
      onAddSkill
    );
    this.renderBasicAttackSection(entries, basicAttackIndices);
    this.renderSkillKindSection(
      "アクティブ",
      "active",
      entries,
      otherActiveIndices,
      classIdentity
        ? basicAttackIndices.length > 0
          ? "通常攻撃以外のアクティブスキルがありません。下のボタンから追加できます。"
          : "アクティブスキルがありません。classId 入力で通常攻撃が追加されます。"
        : "参照されているアクティブスキルがありません。",
      onAddSkill
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

  private isBasicAttackEntry(entry: SkillDraftEntry): boolean {
    return this.options.isIdReadonly?.(entry) ?? false;
  }

  private renderBasicAttackSection(
    entries: SkillDraftEntry[],
    indices: number[]
  ): void {
    if (indices.length === 0) return;

    const section = createSection("通常攻撃");
    section.classList.add("editor-skill-section");

    const list = createEl("div", "editor-skill-list");
    for (const index of indices) {
      this.renderCollapsibleSkillEntry(list, entries[index]!, index);
    }
    section.appendChild(list);
    this.container.appendChild(section);
  }

  private renderSkillKindSection(
    title: string,
    kind: SkillSlotKind,
    entries: SkillDraftEntry[],
    indices: number[],
    emptyHint: string,
    onAddSkill?: (kind: SkillSlotKind) => void
  ): void {
    const section = createSection(title);
    section.classList.add("editor-skill-section");

    const list = createEl("div", "editor-skill-list");
    if (indices.length === 0) {
      list.appendChild(createEl("p", "editor-hint", emptyHint));
    } else {
      for (const index of indices) {
        this.renderCollapsibleSkillEntry(list, entries[index]!, index);
      }
    }
    section.appendChild(list);

    if (onAddSkill) {
      const addRow = createEl("div", "editor-section-actions");
      addRow.appendChild(
        createButton(`+ ${title}`, "editor-btn editor-btn-small", () => {
          onAddSkill(kind);
        })
      );
      section.appendChild(addRow);
    }

    this.container.appendChild(section);
  }

  private renderCollapsibleSkillEntry(
    parent: HTMLElement,
    entry: SkillDraftEntry,
    index: number
  ): void {
    const idReadonly = this.options.isIdReadonly?.(entry) ?? false;
    const kind = skillEntryKind(entry, idReadonly);
    const title = skillCardTitle(entry, idReadonly);
    const skill = entry.passive ?? entry.active;

    const summaryExtra = createEl("span");
    summaryExtra.appendChild(
      createEl("span", "editor-skill-summary-badge", SKILL_KIND_LABELS[kind])
    );

    const metaParts: string[] = [];
    if (skill?.id?.trim()) metaParts.push(skill.id.trim());
    if (!idReadonly) {
      const unlockLevel = entry.unlockLevel ?? 0;
      metaParts.push(unlockLevel === 0 ? "初期習得" : `Lv${unlockLevel}習得`);
    }
    if (metaParts.length > 0) {
      summaryExtra.appendChild(
        createEl(
          "span",
          "editor-collapsible-summary-meta",
          metaParts.join(" · ")
        )
      );
    }

    const description = entry.passive
      ? formatPassiveDescription(entry.passive)
      : entry.active
      ? formatActiveDescription(entry.active)
      : entry.ref.skillId;
    const descEl = createEl("span", "editor-collapsible-summary-desc");
    descEl.appendChild(
      annotateGameTerms(
        description,
        "ja",
        (termId, anchor) => {
          this.gameTermPanel.openFromTerm(termId, anchor);
        },
        { panelId: this.gameTermPanel.getPanelId() }
      )
    );
    summaryExtra.appendChild(descEl);

    let summaryActions: HTMLElement | undefined;
    if (!idReadonly && this.options.onRemoveSkill) {
      summaryActions = createButton(
        "削除",
        "editor-btn editor-btn-small",
        () => {
          this.options.onRemoveSkill?.(index);
        }
      );
    }

    const { details, body } = createCollapsibleSection({
      id: skillExpansionKey(entry, index),
      title,
      summaryExtra,
      summaryActions,
      expandedState: this.skillExpandedState,
      className: "editor-skill-details",
      dataAttrs: { kind },
    });
    body.classList.add("editor-skill-body", "editor-skill-card");
    this.renderEntryCardBody(body, entry, index, idReadonly);
    parent.appendChild(details);
  }

  private renderEntryCardBody(
    card: HTMLElement,
    entry: SkillDraftEntry,
    index: number,
    idReadonly: boolean
  ): void {
    if (!idReadonly) {
      const unlockGrid = appendGrid(card);
      unlockGrid.appendChild(
        createFieldRow(
          "習得 Lv",
          createNumberInput(
            entry.unlockLevel ?? 0,
            (unlockLevel) => {
              this.commitEntries(
                (next) => {
                  const current = next[index];
                  if (!current) return;
                  current.unlockLevel = unlockLevel;
                },
                { rerender: false }
              );
            },
            {}
          )
        )
      );
      card.appendChild(
        createEl(
          "p",
          "editor-hint",
          "0 = 初期習得（Lv0）。1 以上 = その Lv で習得"
        )
      );
    }

    if (entry.passive) {
      this.renderPassive(card, index, idReadonly);
    }
    if (entry.active) {
      this.renderActive(card, index, idReadonly);
    }
  }

  private createSkillIdInput(
    index: number,
    kind: SkillSlotKind,
    currentId: string,
    idReadonly: boolean,
    applyId: (entry: SkillDraftEntry, id: string) => void
  ): HTMLInputElement {
    const input = createTextInput(
      currentId,
      (id) => {
        if (idReadonly) return;
        this.commitEntries(
          (next) => {
            const entry = next[index];
            if (!entry) return;
            applyId(entry, id);
          },
          { rerender: false }
        );
      },
      { readonly: idReadonly }
    );

    if (!idReadonly) {
      let idOnFocus = currentId;
      input.addEventListener("focus", () => {
        const entry = this.options.getEntries()[index];
        idOnFocus =
          kind === "passive"
            ? entry?.passive?.id ?? ""
            : entry?.active?.id ?? "";
      });
      input.addEventListener("blur", () => {
        const trimmed = input.value.trim();
        if (!trimmed) return;
        const oldId = idOnFocus;
        this.commitEntries(
          (next) => {
            const entry = next[index];
            if (!entry) return;
            applyId(entry, trimmed);
          },
          { rerender: false }
        );
        input.value = trimmed;
        if (trimmed !== oldId) {
          this.options.onSkillIdChange?.(oldId, trimmed, kind);
        }
      });
    }

    return input;
  }

  private renderPassive(
    parent: HTMLElement,
    index: number,
    idReadonly: boolean
  ): void {
    const passive = this.options.getEntries()[index]?.passive;
    if (!passive) return;

    const normalizedPassive = normalizePassiveSkillForEditor(passive);
    if (normalizedPassive.effect !== passive.effect) {
      this.patchPassive(
        index,
        (current) => {
          Object.assign(current, normalizedPassive);
        },
        { rerender: true }
      );
      return;
    }

    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        "ID",
        this.createSkillIdInput(
          index,
          "passive",
          passive.id,
          idReadonly,
          (entry, id) => {
            if (!entry.passive) return;
            entry.passive.id = id;
            entry.ref.skillId = id;
          }
        )
      )
    );
    grid.appendChild(
      createFieldRow(
        "名前",
        createTextInput(passive.name, (name) => {
          this.patchPassive(
            index,
            (current) => {
              current.name = name;
            },
            { rerender: false }
          );
        })
      )
    );
    grid.appendChild(
      createFieldRow(
        "iconKey",
        createTextInput(passive.iconKey ?? "", (iconKey) => {
          this.patchPassive(
            index,
            (current) => {
              current.iconKey = iconKey.trim() || undefined;
            },
            { rerender: false }
          );
        })
      )
    );
    grid.appendChild(
      createFieldRow(
        "効果種別",
        createGroupedSelect(
          passive.effect,
          EDITOR_PASSIVE_EFFECT_KIND_GROUPS.map((group) => ({
            label: group.label,
            options: group.kinds.map((value) => ({
              value,
              label: PASSIVE_EFFECT_KIND_LABELS[value],
            })),
          })),
          (effect) => {
            this.patchPassive(
              index,
              (current) => {
                current.effect = effect;
                applyPassiveEffectDefaults(current);
              },
              { rerender: true }
            );
          }
        )
      )
    );

    const effectGrid = appendGrid(parent);
    effectGrid.classList.add("editor-subgrid");

    switch (passive.effect) {
      case "targetRuleOverride":
        effectGrid.appendChild(
          createFieldRow(
            "適用スコープ",
            createSelect(
              passive.targetRuleOverrideApplyTo ?? "enemy",
              TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS.map((value) => ({
                value,
                label: TARGET_RULE_OVERRIDE_APPLY_TO_LABELS[value],
              })),
              (targetRuleOverrideApplyTo) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.targetRuleOverrideApplyTo =
                      targetRuleOverrideApplyTo;
                  },
                  { rerender: true }
                );
              }
            )
          )
        );
        appendTargetSpecFields(
          effectGrid,
          passive.targetRuleOverride ?? {
            kind: "distance",
            side: "enemy",
            order: "nearest",
          },
          (targetRuleOverride) => {
            this.patchPassive(
              index,
              (current) => {
                current.targetRuleOverride = targetRuleOverride;
              },
              { rerender: true }
            );
          }
        );
        break;
      case "evasionChance":
      case "block":
        effectGrid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "旧パッシブ種別です。新規作成は「バフ（evasion/block）」を使用してください。"
          )
        );
        break;
      case "damageIncrease":
        appendPassiveDamageIncreaseFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          }
        );
        break;
      case "defenseIgnore":
        appendPassiveDefenseIgnoreFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          }
        );
        break;
      case "ignoredDefBonusDamage":
        effectGrid.appendChild(
          createFieldRow(
            "ignoredDefBonusScale",
            createNumberInput(
              passive.ignoredDefBonusScale ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.ignoredDefBonusScale = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0 }
            )
          )
        );
        break;
      case "bonusBasicAttackOnHit":
        effectGrid.appendChild(
          createFieldRow(
            "chance",
            createNumberInput(
              passive.chance ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.chance = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "bonusBasicAttackHpRatio（省略可）",
            createNumberInput(
              passive.bonusBasicAttackHpRatio ?? 0.3,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bonusBasicAttackHpRatio = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        appendDamageIncreaseConditionListFields(
          effectGrid,
          passive.bonusBasicAttackConditions ?? [],
          (mutate, options) => {
            this.patchPassive(
              index,
              (current) => {
                const next = mutate(current.bonusBasicAttackConditions ?? []);
                if (next.length > 0) {
                  current.bonusBasicAttackConditions = next;
                } else {
                  delete current.bonusBasicAttackConditions;
                }
              },
              options
            );
          },
          {
            title: "bonusBasicAttackConditions（非空なら全条件 AND）",
            addButtonLabel: "追加 Hit 条件を追加",
          }
        );
        break;
      case "periodicDispel":
        appendPassiveDispelFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "healReceivedIncrease":
        effectGrid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "旧パッシブ種別です。新規作成は「特効効果（applyTo=heal）」を使用してください。"
          )
        );
        break;
      case "heal":
        appendPassiveHealFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          (grid, amount, onUpdate) => {
            appendResourceAmountFields(grid, amount, onUpdate);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "herbalPotency":
        appendHerbalPotencyPassiveFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          (grid, amount, onUpdate) => {
            appendResourceAmountFields(grid, amount, onUpdate);
          },
          (parent, text) => {
            this.appendAnnotatedEditorHint(parent, text);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "blockResonance":
        effectGrid.appendChild(
          createFieldRow(
            "chance",
            createNumberInput(
              passive.chance ?? 0.1,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.chance = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blockResonanceMaxStacks",
            createNumberInput(
              passive.blockResonanceMaxStacks ?? 6,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blockResonanceMaxStacks = value;
                  },
                  { rerender: false }
                );
              },
              { step: 1, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blockResonanceDamageTakenPerStack",
            createNumberInput(
              passive.blockResonanceDamageTakenPerStack ?? 0.03,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blockResonanceDamageTakenPerStack = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blockResonanceDecayIntervalSec",
            createNumberInput(
              passive.blockResonanceDecayIntervalSec ?? 8,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blockResonanceDecayIntervalSec = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.1, min: 0.1 }
            )
          )
        );
        break;
      case "lastStandInvulnerable":
        break;
      case "frontBlockAura":
        effectGrid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "対象: 生存中の持有者が付与。効果範囲は前列味方（formationRow: front）固定。"
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "chance",
            createNumberInput(
              passive.chance ?? 0.1,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.chance = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "付与バフ名",
            createTextInput(
              passive.buffDisplayName ?? "護身手",
              (buffDisplayName) => {
                this.patchPassive(
                  index,
                  (current) => {
                    const trimmed = buffDisplayName.trim();
                    current.buffDisplayName = trimmed || undefined;
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "frontBlockAuraMagicBlock",
            createSelect(
              passive.frontBlockAuraMagicBlock ? "true" : "false",
              [
                { value: "false", label: "物理のみ" },
                { value: "true", label: "魔法も block" },
              ],
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    if (value === "true") {
                      current.frontBlockAuraMagicBlock = true;
                    } else {
                      delete current.frontBlockAuraMagicBlock;
                    }
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        break;
      case "lastStandRecovery":
        effectGrid.appendChild(
          createFieldRow(
            "lastStandRecoveryHpRatio",
            createNumberInput(
              passive.lastStandRecoveryHpRatio ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandRecoveryHpRatio = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "lastStandRecoverySelfDamageTakenMultiplier",
            createNumberInput(
              passive.lastStandRecoverySelfDamageTakenMultiplier ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandRecoverySelfDamageTakenMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "lastStandRecoveryFrontAllyDamageTakenMultiplier",
            createNumberInput(
              passive.lastStandRecoveryFrontAllyDamageTakenMultiplier ?? 0.75,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandRecoveryFrontAllyDamageTakenMultiplier =
                      value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "lastStandRecoveryDurationSec",
            createNumberInput(
              passive.lastStandRecoveryDurationSec ?? 5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandRecoveryDurationSec = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.5, min: 0.1 }
            )
          )
        );
        break;
      case "duelistPride":
        effectGrid.appendChild(
          createFieldRow(
            "prideHpRatioMin",
            createNumberInput(
              passive.prideHpRatioMin ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.prideHpRatioMin = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "prideHealMultiplier",
            createNumberInput(
              passive.prideHealMultiplier ?? 0.25,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.prideHealMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        break;
      case "lowHpCover":
        effectGrid.appendChild(
          createFieldRow(
            "coverHpRatioThreshold",
            createNumberInput(
              passive.coverHpRatioThreshold ?? 0.35,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.coverHpRatioThreshold = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "coverWaveLimit",
            createNumberInput(
              passive.coverWaveLimit ?? 3,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.coverWaveLimit = value;
                  },
                  { rerender: false }
                );
              },
              { step: 1, min: 1 }
            )
          )
        );
        break;
      case "lastStandGuts":
        effectGrid.appendChild(
          createFieldRow(
            "lastStandGutsDurationSec",
            createNumberInput(
              passive.lastStandGutsDurationSec ?? 4,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandGutsDurationSec = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.5, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "lastStandGutsEndStunSec",
            createNumberInput(
              passive.lastStandGutsEndStunSec ?? 1.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandGutsEndStunSec = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.1, min: 0 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "lastStandGutsEndKnockbackPx",
            createNumberInput(
              passive.lastStandGutsEndKnockbackPx ?? 15,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.lastStandGutsEndKnockbackPx = value;
                  },
                  { rerender: false }
                );
              },
              { step: 1, min: 0 }
            )
          )
        );
        break;
      case "bloodlustDuelist":
        effectGrid.appendChild(
          createFieldRow(
            "bloodlustBlockChance",
            createNumberInput(
              passive.bloodlustBlockChance ?? 0.05,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustBlockChance = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "DEF最大倍率",
            createNumberInput(
              passive.bloodlustDefBuffMultiplierMax ?? 1.6,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustDefBuffMultiplierMax = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "DEF最大バフHP比率",
            createNumberInput(
              passive.bloodlustDefMaxBuffAtHpRatio ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustDefMaxBuffAtHpRatio = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "ATK最大倍率",
            createNumberInput(
              passive.bloodlustAtkBuffMultiplierMax ?? 2,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustAtkBuffMultiplierMax = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "ATK最大バフHP比率",
            createNumberInput(
              passive.bloodlustAtkMaxBuffAtHpRatio ?? 0,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustAtkMaxBuffAtHpRatio = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "bloodlustAtkBuffCurveExponent",
            createNumberInput(
              passive.bloodlustAtkBuffCurveExponent ?? 1,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bloodlustAtkBuffCurveExponent = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.5, min: 1 }
            )
          )
        );
        break;
      case "seedFlameOnActiveHit":
        effectGrid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "active ダメージ Hit ごとに種火 +1 stack（basic 非対象）。種火上限 5、熾火上限 1（P4 未習得時既定）。"
          )
        );
        break;
      case "bonusActiveOnHit":
        effectGrid.appendChild(
          createFieldRow(
            "bonusActiveSkillId",
            createTextInput(
              passive.bonusActiveSkillId ?? "",
              (bonusActiveSkillId) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.bonusActiveSkillId = bonusActiveSkillId.trim();
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        break;
      case "blazingFlameDetonate":
        effectGrid.appendChild(
          createFieldRow(
            "blazingFlameDetonateSpreadRadiusPx",
            createNumberInput(
              passive.blazingFlameDetonateSpreadRadiusPx ?? 50,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blazingFlameDetonateSpreadRadiusPx = value;
                  },
                  { rerender: false }
                );
              },
              { step: 1, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blazingFlameDetonatePerSeedScale",
            createNumberInput(
              passive.blazingFlameDetonatePerSeedScale ?? 0.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blazingFlameDetonatePerSeedScale = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blazingFlameDetonateMultiplier",
            createNumberInput(
              passive.blazingFlameDetonateMultiplier ?? 1.3,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blazingFlameDetonateMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "blazingFlameUncap",
            createSelect(
              passive.blazingFlameUncap ? "true" : "false",
              [
                { value: "false", label: "熾火 max 1" },
                { value: "true", label: "熾火上限解除" },
              ],
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.blazingFlameUncap = value === "true";
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        break;
      case "dotCompressAssist":
        effectGrid.appendChild(
          createFieldRow(
            "dotCompressRatio",
            createNumberInput(
              passive.dotCompressRatio ?? 0.7,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.dotCompressRatio = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        break;
      case "allyBasicAttackDotProc":
        effectGrid.appendChild(
          createFieldRow(
            "chance",
            createNumberInput(
              passive.chance ?? 0.2,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.chance = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "debuffDotDurationSec",
            createNumberInput(
              passive.debuffDotDurationSec ?? 5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.debuffDotDurationSec = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.5, min: 0.1 }
            )
          )
        );
        appendResourceAmountFields(
          effectGrid,
          passive.debuffDotAmount ?? defaultResourceAmount(10, "flat"),
          (debuffDotAmount) => {
            this.patchPassive(
              index,
              (current) => {
                current.debuffDotAmount = debuffDotAmount;
              },
              { rerender: false }
            );
          }
        );
        effectGrid.appendChild(
          createFieldRow(
            "debuffDotDamageType",
            createSelect(
              passive.debuffDotDamageType ?? "magic",
              DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
              (debuffDotDamageType) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.debuffDotDamageType =
                      debuffDotDamageType as DamageType;
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "debuffDotFlavor",
            createSelect(
              passive.debuffDotFlavor ?? "poison",
              DOT_FLAVORS.map((value) => ({
                value,
                label: DOT_FLAVOR_LABELS[value],
              })),
              (debuffDotFlavor) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.debuffDotFlavor = debuffDotFlavor;
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        break;
      case "dotDurationMultiplierOnApply":
        effectGrid.appendChild(
          createFieldRow(
            "dotDurationMultiplierOnApply",
            createNumberInput(
              passive.dotDurationMultiplierOnApply ?? 1.5,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.dotDurationMultiplierOnApply = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "dottedEnemyHealReceivedMultiplier",
            createNumberInput(
              passive.dottedEnemyHealReceivedMultiplier ?? 0.8,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.dottedEnemyHealReceivedMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        break;
      case "dottedEnemyHealReceivedDebuff":
        effectGrid.appendChild(
          createFieldRow(
            "dottedEnemyHealReceivedMultiplier",
            createNumberInput(
              passive.dottedEnemyHealReceivedMultiplier ?? 0.8,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.dottedEnemyHealReceivedMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01, max: 1 }
            )
          )
        );
        break;
      case "conditionalEnemyDamageTakenAura":
        effectGrid.appendChild(
          createFieldRow(
            "enemyDamageTakenMultiplier",
            createNumberInput(
              passive.enemyDamageTakenMultiplier ?? 1.2,
              (value) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.enemyDamageTakenMultiplier = value;
                  },
                  { rerender: false }
                );
              },
              { step: 0.05, min: 0.01 }
            )
          )
        );
        appendDamageIncreaseConditionListFields(
          effectGrid,
          passive.auraConditions ?? [],
          (mutate, options) => {
            this.patchPassive(
              index,
              (current) => {
                const next = mutate(current.auraConditions ?? []);
                if (next.length > 0) {
                  current.auraConditions = next;
                } else {
                  delete current.auraConditions;
                }
              },
              options
            );
          },
          {
            title: "auraConditions（非空なら全条件 AND）",
            addButtonLabel: "aura 条件を追加",
          }
        );
        break;
      case "damageReduction":
        appendPassiveDamageReductionFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "threatControl":
        appendPassiveThreatControlFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          }
        );
        break;
      case "excessHealToBarrier":
        effectGrid.appendChild(
          createFieldRow(
            "barrierScale",
            createNumberInput(
              passive.barrierScale ?? 1,
              (barrierScale) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.barrierScale = barrierScale;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        for (const source of ["outgoing", "incoming"] as const) {
          const label = source === "outgoing" ? "与回復" : "被回復";
          const sources = passive.excessHealSources ?? ["outgoing"];
          const row = createEl("div", "editor-field editor-field-checkbox");
          const input = createEl("input") as HTMLInputElement;
          input.type = "checkbox";
          input.checked = sources.includes(source);
          input.addEventListener("change", () => {
            this.patchPassive(
              index,
              (current) => {
                const currentSources = new Set(
                  current.excessHealSources ?? ["outgoing"]
                );
                if (input.checked) {
                  currentSources.add(source);
                } else {
                  currentSources.delete(source);
                }
                const next = [...currentSources] as Array<
                  "outgoing" | "incoming"
                >;
                current.excessHealSources =
                  next.length > 0 ? next : ["outgoing"];
              },
              { rerender: false }
            );
          });
          row.appendChild(createEl("label", undefined, label));
          row.appendChild(input);
          effectGrid.appendChild(row);
        }
        break;
      case "selfHpRatioBuff":
        effectGrid.appendChild(
          createFieldRow(
            "対象ステ",
            createSelect(
              Array.isArray(passive.buffStat)
                ? passive.buffStat[0] ?? "atk"
                : passive.buffStat ?? "atk",
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (buffStat) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.buffStat = buffStat;
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "最大倍率",
            createNumberInput(
              passive.buffMultiplierMax ?? 1,
              (buffMultiplierMax) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.buffMultiplierMax =
                      buffMultiplierMax > 1 ? buffMultiplierMax : undefined;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "最大固定値",
            createNumberInput(
              passive.buffFlatBonusMax ?? 0,
              (buffFlatBonusMax) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.buffFlatBonusMax =
                      buffFlatBonusMax > 0 ? buffFlatBonusMax : undefined;
                  },
                  { rerender: false }
                );
              },
              { step: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "最大になるHP割合 (0–1)",
            createNumberInput(
              passive.maxBuffAtHpRatio ?? 0,
              (maxBuffAtHpRatio) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.maxBuffAtHpRatio = maxBuffAtHpRatio;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 0.99, step: 0.01 }
            )
          )
        );
        break;
      case "excessHealRedirect":
        effectGrid.appendChild(
          createFieldRow(
            "redirectScale",
            createNumberInput(
              passive.redirectScale ?? 0.5,
              (redirectScale) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.redirectScale = redirectScale;
                  },
                  { rerender: false }
                );
              },
              { min: 0.01, max: 1, step: 0.01 }
            )
          )
        );
        for (const source of ["outgoing", "incoming"] as const) {
          const label = source === "outgoing" ? "与回復" : "被回復";
          const sources = passive.excessHealSources ?? ["outgoing"];
          const row = createEl("div", "editor-field editor-field-checkbox");
          const input = createEl("input") as HTMLInputElement;
          input.type = "checkbox";
          input.checked = sources.includes(source);
          input.addEventListener("change", () => {
            this.patchPassive(
              index,
              (current) => {
                const currentSources = new Set(
                  current.excessHealSources ?? ["outgoing"]
                );
                if (input.checked) {
                  currentSources.add(source);
                } else {
                  currentSources.delete(source);
                }
                const next = [...currentSources] as Array<
                  "outgoing" | "incoming"
                >;
                current.excessHealSources =
                  next.length > 0 ? next : ["outgoing"];
              },
              { rerender: false }
            );
          });
          row.appendChild(createEl("label", undefined, label));
          row.appendChild(input);
          effectGrid.appendChild(row);
        }
        break;
      case "targetHpRatioHealScale":
        effectGrid.appendChild(
          createFieldRow(
            "最大回復倍率",
            createNumberInput(
              passive.healScaleMax ?? 1.1,
              (healScaleMax) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.healScaleMax =
                      healScaleMax > 1 ? healScaleMax : undefined;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "最大になる対象HP割合 (0–1)",
            createNumberInput(
              passive.maxScaleAtHpRatio ?? 0.4,
              (maxScaleAtHpRatio) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.maxScaleAtHpRatio = maxScaleAtHpRatio;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 0.99, step: 0.01 }
            )
          )
        );
        break;
      case "targetHpRatioDamageScale":
        effectGrid.appendChild(
          createFieldRow(
            "最大ダメ倍率",
            createNumberInput(
              passive.damageScaleMax ?? 1.35,
              (damageScaleMax) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.damageScaleMax =
                      damageScaleMax > 1 ? damageScaleMax : undefined;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "倍率1.0になる対象HP割合 (0–1)",
            createNumberInput(
              passive.minScaleAtHpRatio ?? 0.35,
              (minScaleAtHpRatio) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.minScaleAtHpRatio = minScaleAtHpRatio;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 0.99, step: 0.01 }
            )
          )
        );
        break;
      case "idleAtkRamp":
        effectGrid.appendChild(
          createFieldRow(
            "最大蓄積秒",
            createNumberInput(
              passive.rampToMaxSec ?? 2.5,
              (rampToMaxSec) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.rampToMaxSec = rampToMaxSec;
                  },
                  { rerender: false }
                );
              },
              { step: 0.1, min: 0.1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "ATK倍率下限",
            createNumberInput(
              passive.atkMulMin ?? 1.25,
              (atkMulMin) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.atkMulMin = atkMulMin;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "ATK倍率上限",
            createNumberInput(
              passive.atkMulMax ?? 1.6,
              (atkMulMax) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.atkMulMax = atkMulMax;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "severity基準SPD倍率",
            createNumberInput(
              passive.fullRampAttackSpeedMul ?? 0.7,
              (fullRampAttackSpeedMul) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.fullRampAttackSpeedMul = fullRampAttackSpeedMul;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0.01, max: 0.99 }
            )
          )
        );
        break;
      case "ballistaMark":
        effectGrid.appendChild(
          createFieldRow(
            "飛散半径 (px)",
            createNumberInput(
              passive.ballistaMarkSplashRadiusPx ?? 50,
              (ballistaMarkSplashRadiusPx) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.ballistaMarkSplashRadiusPx =
                      ballistaMarkSplashRadiusPx;
                  },
                  { rerender: false }
                );
              },
              { step: 1, min: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "飛散ダメ割合",
            createNumberInput(
              passive.ballistaMarkSplashDamageScale ?? 0.3,
              (ballistaMarkSplashDamageScale) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.ballistaMarkSplashDamageScale =
                      ballistaMarkSplashDamageScale;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0.01, max: 1 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "自身SPD倍率",
            createNumberInput(
              passive.ballistaMarkSelfAttackSpeedMul ?? 0.85,
              (ballistaMarkSelfAttackSpeedMul) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.ballistaMarkSelfAttackSpeedMul =
                      ballistaMarkSelfAttackSpeedMul;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01, min: 0.01, max: 1 }
            )
          )
        );
        break;
      case "healReservation":
        effectGrid.appendChild(
          createFieldRow(
            "付与対象HP割合 (0–1)",
            createNumberInput(
              passive.grantOnHealMaxHpRatio ?? 0.6,
              (grantOnHealMaxHpRatio) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.grantOnHealMaxHpRatio = grantOnHealMaxHpRatio;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 1, step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "スタック持続秒",
            createNumberInput(
              passive.stackDurationSec ?? 8,
              (stackDurationSec) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.stackDurationSec = stackDurationSec;
                  },
                  { rerender: false }
                );
              },
              { min: 0.1, step: 0.5 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "発動HP割合 (0–1)",
            createNumberInput(
              passive.triggerHpRatio ?? 0.35,
              (triggerHpRatio) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.triggerHpRatio = triggerHpRatio;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 1, step: 0.01 }
            )
          )
        );
        appendResourceAmountFields(
          effectGrid,
          passive.healAmount ?? defaultResourceAmount(0.75),
          (healAmount) => {
            this.patchPassive(
              index,
              (current) => {
                current.healAmount = healAmount;
              },
              { rerender: false }
            );
          }
        );
        effectGrid.appendChild(
          createFieldRow(
            "付与バフ名",
            createTextInput(
              passive.buffDisplayName ?? "癒しの残響",
              (buffDisplayName) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.buffDisplayName =
                      buffDisplayName.trim() || undefined;
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        break;
      case "barrierBreakRegen":
        appendResourceAmountFields(
          effectGrid,
          passive.barrierAmount ?? defaultResourceAmount(0.85),
          (barrierAmount) => {
            this.patchPassive(
              index,
              (current) => {
                current.barrierAmount = barrierAmount;
              },
              { rerender: false }
            );
          }
        );
        break;
      case "barrierDepletionHeal":
        appendResourceAmountFields(
          effectGrid,
          passive.healAmount ?? defaultResourceAmount(0.65),
          (healAmount) => {
            this.patchPassive(
              index,
              (current) => {
                current.healAmount = healAmount;
              },
              { rerender: false }
            );
          }
        );
        break;
      case "extendSelfAppliedDebuff":
        effectGrid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "旧パッシブ種別です。新規作成は非推奨（互換表示のみ）。"
          )
        );
        break;
      case "aoeCrowdBonus":
        effectGrid.appendChild(
          createFieldRow(
            "perExtraTargetScale",
            createNumberInput(
              passive.perExtraTargetScale ?? 0.1,
              (perExtraTargetScale) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.perExtraTargetScale = perExtraTargetScale;
                  },
                  { rerender: false }
                );
              },
              { step: 0.01 }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "maxExtraTargets",
            createNumberInput(
              passive.maxExtraTargets ?? 4,
              (maxExtraTargets) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.maxExtraTargets = maxExtraTargets;
                  },
                  { rerender: false }
                );
              },
              { step: 1 }
            )
          )
        );
        break;
      case "counter":
      case "counterChance":
        effectGrid.appendChild(
          createFieldRow(
            "反撃トリガー",
            createSelect(
              passive.counterTrigger ?? "selfDamaged",
              PASSIVE_COUNTER_TRIGGER_KINDS.map((kind) => ({
                value: kind,
                label: PASSIVE_COUNTER_TRIGGER_KIND_LABELS[kind],
              })),
              (counterTrigger) => {
                this.patchPassive(
                  index,
                  (current) => {
                    if (counterTrigger === "selfDamaged") {
                      delete current.counterTrigger;
                    } else {
                      current.counterTrigger = counterTrigger;
                    }
                  },
                  { rerender: false }
                );
              }
            )
          )
        );
        effectGrid.appendChild(
          createFieldRow(
            "発動確率 (0–1)",
            createNumberInput(
              passive.chance ?? passive.counterChance ?? 0,
              (chance) => {
                this.patchPassive(
                  index,
                  (current) => {
                    current.chance = chance;
                    current.counterChance = chance;
                  },
                  { rerender: false }
                );
              },
              { min: 0, max: 1, step: 0.01 }
            )
          )
        );
        appendCounterEffectFields(
          effectGrid,
          passiveToCounterEffect(passive),
          (patch, options) => {
            this.patchPassive(
              index,
              (current) => {
                applyCounterEffectToPassive(
                  current,
                  patch(passiveToCounterEffect(current))
                );
              },
              options
            );
          },
          {
            showDuration: false,
            traitsRangePx: this.resolveTraitsRangePx(),
          }
        );
        break;
      case "specialEffect":
        appendPassiveSpecialEffectFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          }
        );
        if (
          passive.specialEffectApplyTo === "damage" ||
          passive.specialEffectApplyTo === undefined
        ) {
          appendPassiveDefenseIgnoreFields(
            effectGrid,
            passive,
            (mutate, options) => {
              this.patchPassive(index, mutate, options);
            }
          );
        }
        break;
      case "buff":
        appendPassiveBuffFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          (grid, amount, onUpdate) => {
            appendResourceAmountFields(grid, amount, onUpdate);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "debuff":
        appendPassiveDebuffFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          { traitsRangePx: this.resolveTraitsRangePx() }
        );
        break;
      case "skillAmountOverride": {
        const entries = this.options.getEntries();
        const targetSkillId = passive.targetSkillId ?? "";
        const skillOptions = entries.flatMap((entry) => {
          if (entry.passive) {
            if (!isPassiveSkillAmountOverrideTarget(entry.passive)) return [];
            return [
              {
                value: entry.passive.id,
                label: `[パッシブ] ${entry.passive.name} (${entry.passive.id})`,
              },
            ];
          }
          if (entry.active) {
            if (!isActiveSkillAmountOverrideTarget(entry.active)) return [];
            return [
              {
                value: entry.active.id,
                label: `[アクティブ] ${entry.active.name} (${entry.active.id})`,
              },
            ];
          }
          return [];
        });
        if (
          targetSkillId &&
          !skillOptions.some((option) => option.value === targetSkillId)
        ) {
          const staleEntry = entries.find(
            (entry) =>
              entry.passive?.id === targetSkillId ||
              entry.active?.id === targetSkillId
          );
          const staleSkill = staleEntry?.passive ?? staleEntry?.active;
          if (staleSkill) {
            const kind = staleEntry?.passive ? "パッシブ" : "アクティブ";
            skillOptions.unshift({
              value: targetSkillId,
              label: `[上書き不可] [${kind}] ${staleSkill.name} (${targetSkillId})`,
            });
          }
        }
        const targetEntry = entries.find(
          (entry) =>
            entry.passive?.id === targetSkillId ||
            entry.active?.id === targetSkillId
        );
        effectGrid.appendChild(
          createFieldRow(
            "対象スキル",
            createSelect(targetSkillId, skillOptions, (nextTargetSkillId) => {
              this.patchPassive(
                index,
                (current) => {
                  current.targetSkillId = nextTargetSkillId;
                  delete current.effectIndex;
                  delete current.passiveAmountField;
                },
                { rerender: true }
              );
            })
          )
        );
        if (targetEntry?.active) {
          const amountEffects = targetEntry.active.effect
            .map((effect, effectIndex) => ({ effect, effectIndex }))
            .filter(({ effect }) => activeEffectHasAmount(effect));
          if (amountEffects.length > 1) {
            const effectIndex = passive.effectIndex;
            effectGrid.appendChild(
              createFieldRow(
                "対象 effect",
                createSelect(
                  effectIndex === undefined ? -1 : effectIndex,
                  [
                    { value: -1, label: "すべて" },
                    ...amountEffects.map(({ effect, effectIndex: idx }) => ({
                      value: idx,
                      label: `効果 ${idx + 1} (${effect.type})`,
                    })),
                  ],
                  (selected) => {
                    this.patchPassive(
                      index,
                      (current) => {
                        if (selected < 0) {
                          delete current.effectIndex;
                        } else {
                          current.effectIndex = selected;
                        }
                      },
                      { rerender: true }
                    );
                  }
                )
              )
            );
          }
        } else if (targetEntry?.passive) {
          const inferred = inferPassiveAmountField(targetEntry.passive);
          if (inferred) {
            effectGrid.appendChild(
              createEl("p", "editor-hint", `対象フィールド: ${inferred}`)
            );
          }
        }
        const originalAmount = resolveSkillAmountOverrideOriginal(
          entries,
          targetSkillId,
          passive.effectIndex,
          passive.passiveAmountField
        );
        effectGrid.appendChild(
          createFieldRow(
            "元の効果量（読み取り専用）",
            createEl(
              "span",
              "editor-readonly-value",
              formatAmountPreview(originalAmount)
            )
          )
        );
        appendResourceAmountFields(
          effectGrid,
          passive.amount ?? defaultResourceAmount(1),
          (amount, options) => {
            this.patchPassive(
              index,
              (current) => {
                current.amount = amount;
              },
              options
            );
          }
        );
        break;
      }
      case "skillPropertyOverride": {
        const entries = this.options.getEntries();
        const activeSkillOptions = entries.flatMap((entry) => {
          if (!entry.active || entry.ref.kind !== "active") return [];
          return [
            {
              value: entry.active.id,
              label: `${entry.active.name} (${entry.active.id})`,
            },
          ];
        });
        appendPassiveSkillPropertyOverrideFields(
          effectGrid,
          passive,
          activeSkillOptions,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          }
        );
        break;
      }
    }

    this.appendSkillDescriptionPreview(
      parent,
      formatPassiveDescription(passive)
    );
  }

  private appendAnnotatedEditorHint(parent: HTMLElement, text: string): void {
    const hint = createEl("p", "editor-hint");
    hint.appendChild(
      annotateGameTerms(
        text,
        "ja",
        (termId, anchor) => {
          this.gameTermPanel.openFromTerm(termId, anchor);
        },
        { panelId: this.gameTermPanel.getPanelId() }
      )
    );
    parent.appendChild(hint);
  }

  private appendSkillDescriptionPreview(
    parent: HTMLElement,
    description: string
  ): void {
    const preview = createEl("p", "editor-skill-desc-preview");
    preview.append(document.createTextNode("説明: "));
    preview.appendChild(
      annotateGameTerms(
        description,
        "ja",
        (termId, anchor) => {
          this.gameTermPanel.openFromTerm(termId, anchor);
        },
        { panelId: this.gameTermPanel.getPanelId() }
      )
    );
    parent.appendChild(preview);
  }

  private renderActive(
    parent: HTMLElement,
    index: number,
    idReadonly: boolean
  ): void {
    const active = this.options.getEntries()[index]?.active;
    if (!active) return;

    const setActive = (
      mutate: (current: ActiveSkillDef) => void,
      options?: { rerender?: boolean }
    ) => {
      this.patchActive(index, mutate, options);
    };

    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        "ID",
        this.createSkillIdInput(
          index,
          "active",
          active.id,
          idReadonly,
          (entry, id) => {
            if (!entry.active) return;
            entry.active.id = id;
            entry.ref.skillId = id;
          }
        )
      )
    );
    if (!idReadonly) {
      grid.appendChild(
        createFieldRow(
          "名前",
          createTextInput(active.name, (name) => {
            setActive(
              (current) => {
                current.name = name;
              },
              { rerender: false }
            );
          })
        )
      );
    }

    grid.appendChild(
      createFieldRow(
        "iconKey",
        createTextInput(
          active.iconKey ?? "",
          (iconKey) => {
            setActive(
              (current) => {
                current.iconKey = iconKey.trim() || undefined;
              },
              { rerender: false }
            );
          },
          { readonly: idReadonly }
        )
      )
    );

    const basicAttackSpeedTier = this.options.basicAttackSpeedTier;
    if (idReadonly && basicAttackSpeedTier) {
      grid.appendChild(
        createFieldRow(
          "攻撃速度（SPD）",
          createSelect(
            basicAttackSpeedTier.get(),
            ATTACK_SPEED_TIER_OPTIONS.map((value) => ({
              value,
              label: ATTACK_SPEED_TIER_LABELS[value],
            })),
            (attackSpeedTier) => {
              basicAttackSpeedTier.onChange(attackSpeedTier);
            }
          )
        )
      );
      grid.appendChild(
        createEl(
          "p",
          "editor-hint",
          "通常攻撃の間隔は SPD 段階とスキル interval から決まります。"
        )
      );
    } else if (idReadonly) {
      const trigger = resolveSkillTrigger(active);
      grid.appendChild(
        createFieldRow(
          "発動間隔 (秒)",
          createNumberInput(
            trigger.value,
            (value) => {
              setActive(
                (current) => {
                  current.interval = value;
                  current.trigger = { kind: "time", value };
                },
                { rerender: false }
              );
            },
            { min: 0.1, step: 0.1, readonly: true }
          )
        )
      );
      grid.appendChild(
        createEl(
          "p",
          "editor-hint",
          "通常攻撃の間隔はクラス設定の「攻撃速度（SPD 段階）」から決まります。ダメージ種は下の効果欄、射程・VFX はクラス／敵の traits で編集します。"
        )
      );
    } else {
      const trigger = resolveSkillTrigger(active);
      grid.appendChild(
        createFieldRow(
          "発動条件",
          createSelect(
            trigger.kind,
            SKILL_TRIGGER_KIND_OPTIONS.map((value) => ({
              value,
              label: SKILL_TRIGGER_KIND_LABELS[value],
            })),
            (kind) => {
              const nextKind = kind as SkillTriggerKind;
              const nextValue =
                nextKind === "time"
                  ? trigger.kind === "time"
                    ? trigger.value
                    : 5
                  : trigger.kind === nextKind
                  ? trigger.value
                  : 3;
              setActive(
                (current) => {
                  current.trigger = { kind: nextKind, value: nextValue };
                  delete current.interval;
                },
                { rerender: true }
              );
            }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          SKILL_TRIGGER_VALUE_LABELS[trigger.kind],
          createNumberInput(
            trigger.value,
            (value) => {
              setActive(
                (current) => {
                  const kind = resolveSkillTrigger(current).kind;
                  current.trigger = { kind, value };
                  delete current.interval;
                },
                { rerender: false }
              );
            },
            { min: 0, step: 0.1 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "停止時間（秒）",
          createNumberInput(
            active.useDurationSec ?? 0,
            (value) => {
              setActive(
                (current) => {
                  if (value <= 0) {
                    delete current.useDurationSec;
                  } else {
                    current.useDurationSec = value;
                  }
                },
                { rerender: false }
              );
            },
            { min: 0, step: 0.05 }
          )
        )
      );
      const pauseApproachRow = createEl(
        "div",
        "editor-field editor-field-checkbox"
      );
      const pauseApproachInput = createEl("input") as HTMLInputElement;
      pauseApproachInput.type = "checkbox";
      pauseApproachInput.checked = active.useDurationPauseApproach ?? false;
      pauseApproachInput.addEventListener("change", () => {
        setActive(
          (current) => {
            if (pauseApproachInput.checked) {
              current.useDurationPauseApproach = true;
            } else {
              delete current.useDurationPauseApproach;
            }
          },
          { rerender: false }
        );
      });
      pauseApproachRow.appendChild(
        createEl("label", undefined, "硬直中の自動接近停止")
      );
      pauseApproachRow.appendChild(pauseApproachInput);
      grid.appendChild(pauseApproachRow);
      grid.appendChild(
        createEl(
          "p",
          "editor-hint",
          "0 = 即時。useDurationSec は SkillHold（硬直）。硬直中はスキル発動不可・CD 停止。チェック ON で自動接近も停止する。"
        )
      );
      appendActiveFireGateFields(grid, active, setActive);
      appendActiveBlockResonanceStanceFields(
        grid,
        active,
        setActive,
        appendResourceAmountFields
      );
    }

    this.appendSkillDescriptionPreview(parent, formatActiveDescription(active));

    const effectsSection = createSection("効果");
    parent.appendChild(effectsSection);
    const showPerEffectPresentation = skillHasMoveEffect(active);

    if (!idReadonly) {
      const sharedTargetSection = createSection("共通ターゲット");
      parent.insertBefore(sharedTargetSection, effectsSection);
      appendSkillSharedTargetingFields(sharedTargetSection, active, setActive, {
        traitsRangePx: this.resolveTraitsRangePx(),
      });
    }

    active.effect.forEach((effect, effectIndex) => {
      const block = createEl("div", "editor-effect-block");
      const effectHeader = createEl("div", "editor-effect-header");
      effectHeader.appendChild(
        createEl("span", "editor-effect-label", `効果 ${effectIndex + 1}`)
      );
      if (effectIndex > 0) {
        effectHeader.appendChild(
          createButton("↑", "editor-btn editor-btn-small", () => {
            setActive(
              (current) => {
                const next = [...current.effect];
                const tmp = next[effectIndex - 1];
                next[effectIndex - 1] = next[effectIndex]!;
                next[effectIndex] = tmp!;
                current.effect = next;
              },
              { rerender: true }
            );
          })
        );
      }
      if (effectIndex < active.effect.length - 1) {
        effectHeader.appendChild(
          createButton("↓", "editor-btn editor-btn-small", () => {
            setActive(
              (current) => {
                const next = [...current.effect];
                const tmp = next[effectIndex + 1];
                next[effectIndex + 1] = next[effectIndex]!;
                next[effectIndex] = tmp!;
                current.effect = next;
              },
              { rerender: true }
            );
          })
        );
      }
      if (active.effect.length > 1) {
        effectHeader.appendChild(
          createButton("削除", "editor-btn editor-btn-small", () => {
            setActive(
              (current) => {
                current.effect = current.effect.filter(
                  (_, i) => i !== effectIndex
                );
              },
              { rerender: true }
            );
          })
        );
      }
      block.appendChild(effectHeader);
      this.renderEffect(
        block,
        effect,
        (nextEffect, options) => {
          setActive((current) => {
            current.effect[effectIndex] = nextEffect;
          }, options);
        },
        showPerEffectPresentation,
        idReadonly,
        {
          effectIndex,
          effectCount: active.effect.length,
        },
        active.id,
        undefined,
        active
      );
      effectsSection.appendChild(block);
    });

    effectsSection.appendChild(
      createButton("+ 効果を追加", "editor-btn editor-btn-small", () => {
        setActive(
          (current) => {
            current.effect.push(
              idReadonly
                ? defaultBasicAttackEffectForCategory("heal")
                : defaultEffect("damage")
            );
          },
          { rerender: true }
        );
      })
    );

    if (idReadonly) {
      return;
    }

    const vfxSection = createSection("VFX（任意）");
    parent.appendChild(vfxSection);
    if (showPerEffectPresentation) {
      vfxSection.appendChild(
        createEl(
          "p",
          "editor-hint",
          "move を含むスキル: 各 effect の演出は効果ブロック内で設定。ここは effect 未指定時のフォールバックです。"
        )
      );
    }
    const vfxGrid = appendGrid(vfxSection);
    if (active.vfx) {
      const enabledRow = createEl("div", "editor-field editor-field-checkbox");
      const enabledInput = createEl("input") as HTMLInputElement;
      enabledInput.type = "checkbox";
      enabledInput.checked = active.vfx.enabled !== false;
      enabledInput.addEventListener("change", () => {
        setActive(
          (current) => {
            current.vfx = {
              ...current.vfx!,
              enabled: enabledInput.checked,
            };
          },
          { rerender: false }
        );
      });
      enabledRow.appendChild(createEl("label", undefined, "PNG VFX 有効"));
      enabledRow.appendChild(enabledInput);
      vfxGrid.appendChild(enabledRow);
      vfxSection.appendChild(
        createButton("VFX を削除", "editor-btn editor-btn-small", () => {
          setActive(
            (current) => {
              current.vfx = undefined;
            },
            { rerender: true }
          );
        })
      );
    } else {
      vfxSection.appendChild(
        createButton("VFX を設定", "editor-btn editor-btn-small", () => {
          setActive(
            (current) => {
              current.vfx = { enabled: true };
            },
            { rerender: true }
          );
        })
      );
    }
  }

  private renderEffect(
    parent: HTMLElement,
    effect: SkillEffectDef,
    onUpdate: (
      effect: SkillEffectDef,
      options?: { rerender?: boolean }
    ) => void,
    _showPerEffectPresentation = false,
    isBasicAttack = false,
    sequenceContext?: { effectIndex: number; effectCount: number },
    skillId?: string,
    branchEditorOptions?: { hideConditionalCategory?: boolean },
    activeSkill?: ActiveSkillDef
  ): void {
    const normalizedEffect = withEditorEffectDefaults(effect);
    if (editorEffectNeedsDefaultSync(effect, normalizedEffect)) {
      onUpdate(normalizedEffect, { rerender: false });
    }
    const { patch: patchEffect, get: getEffect } = patchEffectState(
      normalizedEffect,
      onUpdate
    );
    const grid = appendGrid(parent);
    const baseCategoryOptions = isBasicAttack
      ? BASIC_ATTACK_EFFECT_CATEGORIES
      : EDITOR_ACTIVE_EFFECT_CATEGORIES;
    const categoryOptions = branchEditorOptions?.hideConditionalCategory
      ? baseCategoryOptions.filter((value) => value !== "conditionalEffect")
      : baseCategoryOptions;
    const selectedCategory = isBasicAttack
      ? basicAttackEffectToCategory(normalizedEffect)
      : effectTypeToCategory(normalizedEffect.type);
    const categoryLabels = isBasicAttack
      ? BASIC_ATTACK_EFFECT_CATEGORY_LABELS
      : EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS;
    grid.appendChild(
      createFieldRow(
        "種別",
        isBasicAttack
          ? createSelect(
              selectedCategory,
              categoryOptions.map((value) => ({
                value,
                label: categoryLabels[value as keyof typeof categoryLabels],
              })),
              (category) =>
                patchEffect(
                  defaultBasicAttackEffectForCategory(
                    category as BasicAttackEffectCategory
                  ),
                  { rerender: true }
                )
            )
          : createGroupedSelect(
              selectedCategory,
              EDITOR_ACTIVE_EFFECT_KIND_GROUPS.map((group) => ({
                label: group.label,
                options: group.kinds
                  .filter((value) =>
                    (categoryOptions as readonly string[]).includes(value)
                  )
                  .map((value) => ({
                    value,
                    label: categoryLabels[value],
                  })),
              })),
              (category) =>
                patchEffect(
                  defaultEffect(
                    categoryToEffectType(category as EditorActiveEffectCategory)
                  ),
                  { rerender: true }
                )
            )
      )
    );
    if (normalizedEffect.type === "conditionalEffect") {
      appendConditionListFields(
        grid,
        normalizedEffect.conditions,
        (mutate, options) => {
          patchEffect((prev) => {
            if (prev.type !== "conditionalEffect") return prev;
            return {
              ...prev,
              conditions: mutate([...prev.conditions]),
            };
          }, options);
        },
        { addButtonLabel: "分岐条件を追加" }
      );
      grid.appendChild(
        createEl(
          "p",
          "editor-hint",
          "分岐条件は AND 評価。成立時は thenEffects、未成立時は elseEffects を実行します。"
        )
      );
      this.renderBranchEffectList(
        parent,
        "条件成立時の効果",
        "thenEffects",
        normalizedEffect,
        patchEffect,
        _showPerEffectPresentation,
        skillId
      );
      this.renderBranchEffectList(
        parent,
        "条件不成立時の効果",
        "elseEffects",
        normalizedEffect,
        patchEffect,
        _showPerEffectPresentation,
        skillId
      );
    }
    if (
      normalizedEffect.type === "counter" ||
      normalizedEffect.type === "basicAttackTransform"
    ) {
      grid.appendChild(createEl("p", "editor-hint", "付与対象: 自身（固定）"));
    } else if (normalizedEffect.type !== "conditionalEffect") {
      const inheritsSharedTarget =
        activeSkill !== undefined &&
        hasSkillSharedTargeting(activeSkill) &&
        effectInheritsSkillSharedTargeting(activeSkill, normalizedEffect);
      if (activeSkill && hasSkillSharedTargeting(activeSkill)) {
        const inheritRow = createEl("div", "editor-field-row");
        const inheritInput = document.createElement("input");
        inheritInput.type = "checkbox";
        inheritInput.checked = inheritsSharedTarget;
        inheritInput.addEventListener("change", () => {
          patchEffect(
            (prev) => {
              const next = { ...prev } as SkillEffectDef;
              if (inheritInput.checked) {
                for (const key of SKILL_SHARED_TARGETING_KEYS) {
                  delete (next as Record<string, unknown>)[key];
                }
              } else {
                const merged = mergeEffectWithSkillTargeting(activeSkill, prev);
                for (const key of SKILL_SHARED_TARGETING_KEYS) {
                  const value = merged[key];
                  if (value !== undefined) {
                    (next as Record<string, unknown>)[key] = value;
                  }
                }
              }
              return next;
            },
            { rerender: true }
          );
        });
        inheritRow.appendChild(
          createEl("label", undefined, "スキル共通ターゲットを使う")
        );
        inheritRow.appendChild(inheritInput);
        grid.appendChild(inheritRow);
      }
      if (!inheritsSharedTarget) {
        const effectTarget = getEffectTarget(
          activeSkill
            ? mergeEffectWithSkillTargeting(activeSkill, effect)
            : effect
        );
        const lockSelfOrigin =
          (normalizedEffect.targetShape ?? "single") === "pierce";
        appendTargetSpecFields(
          grid,
          effectTarget,
          (target) => {
            patchEffect(
              (prev) => {
                const next: SkillEffectDef = { ...prev, target };
                if (
                  target.kind === "self" &&
                  (next.targetShape ?? "single") !== "single"
                ) {
                  next.targetShape = "single";
                  delete next.aoeRadiusPx;
                  delete next.hitCount;
                  delete next.hitDurationSec;
                  delete next.piercePowerStepMultiplier;
                  delete next.piercePowerStepMode;
                  delete next.pierceDurationSec;
                  delete next.chainCount;
                  delete next.chainMaxDistancePx;
                  delete next.chainPowerStepMultiplier;
                  delete next.chainPowerStepMode;
                  delete next.chainDurationSec;
                  delete next.scatterRadiusPx;
                  delete next.scatterSpreadRadiusPx;
                  delete next.scatterHitCount;
                  delete next.scatterDurationSec;
                  delete next.scatterSpreadRate;
                }
                return next;
              },
              { rerender: true }
            );
          },
          { lockSelfOrigin, effectIndex: sequenceContext?.effectIndex }
        );
      } else {
        grid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "ターゲットはスキル共通設定を継承しています（上の「共通ターゲット」セクション）。"
          )
        );
      }
    }
    const isMove = normalizedEffect.type === "move";
    const isCounter = normalizedEffect.type === "counter";
    const isBasicAttackTransform =
      normalizedEffect.type === "basicAttackTransform";
    const isConditionalEffect = normalizedEffect.type === "conditionalEffect";
    const skipTargetShape =
      normalizedEffect.type === "placedField" ||
      normalizedEffect.type === "dotCompress" ||
      normalizedEffect.type === "dotExtend" ||
      normalizedEffect.type === "grantNextOutgoingDamage";
    const effectTargetKind = isConditionalEffect
      ? "distance"
      : getEffectTarget(
          activeSkill
            ? mergeEffectWithSkillTargeting(activeSkill, normalizedEffect)
            : normalizedEffect
        ).kind;
    const targetShape: TargetShape =
      (activeSkill &&
      effectInheritsSkillSharedTargeting(activeSkill, normalizedEffect)
        ? mergeEffectWithSkillTargeting(activeSkill, normalizedEffect)
            .targetShape
        : normalizedEffect.targetShape) ?? "single";
    if (
      !isMove &&
      !isCounter &&
      !isBasicAttackTransform &&
      !isConditionalEffect &&
      !skipTargetShape &&
      !(
        activeSkill &&
        hasSkillSharedTargeting(activeSkill) &&
        effectInheritsSkillSharedTargeting(activeSkill, normalizedEffect)
      )
    ) {
      const shapeSelect = createSelect(
        effectTargetKind === "self" ? "single" : targetShape,
        TARGET_SHAPE_OPTIONS.map((value) => ({
          value,
          label: TARGET_SHAPE_LABELS[value],
        })),
        (shape) => {
          patchEffect(
            (prev) => {
              const next: SkillEffectDef = { ...prev, targetShape: shape };
              delete next.aoeRadiusPx;
              delete next.hitCount;
              delete next.hitDurationSec;
              delete next.piercePowerStepMultiplier;
              delete next.piercePowerStepMode;
              delete next.pierceDurationSec;
              delete next.chainCount;
              delete next.chainMaxDistancePx;
              delete next.chainPowerStepMultiplier;
              delete next.chainPowerStepMode;
              delete next.chainDurationSec;
              delete next.scatterRadiusPx;
              delete next.scatterSpreadRadiusPx;
              delete next.scatterHitCount;
              delete next.scatterDurationSec;
              delete next.scatterSpreadRate;
              if (shape === "aoe") {
                next.aoeRadiusPx = 70;
              } else if (shape === "multiLock") {
                next.hitCount = 3;
              } else if (shape === "chain") {
                next.chainCount = 3;
                next.chainMaxDistancePx = 80;
              } else if (shape === "scatter") {
                next.scatterRadiusPx = 70;
                next.scatterSpreadRadiusPx = 70;
                next.scatterHitCount = 3;
                next.scatterDurationSec = 1;
                next.scatterSpreadRate = 1;
              } else if (shape === "pierce") {
                const currentTarget = getEffectTarget(next);
                const side =
                  currentTarget.kind === "distance"
                    ? currentTarget.side
                    : currentTarget.kind === "all" ||
                      currentTarget.kind === "stat"
                    ? currentTarget.side
                    : "enemy";
                const includeSelf =
                  currentTarget.kind === "distance" &&
                  currentTarget.includeSelf === true
                    ? true
                    : undefined;
                next.target = {
                  kind: "distance",
                  side,
                  order: "selfOrigin",
                  ...(includeSelf !== undefined ? { includeSelf } : {}),
                };
              }
              return next;
            },
            { rerender: true }
          );
        }
      );
      if (effectTargetKind === "self") {
        shapeSelect.disabled = true;
        grid.appendChild(createFieldRow("ターゲット形状", shapeSelect));
        grid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "種別が自身のときは単体のみ。周囲・貫通は距離・自身起点を使用してください。"
          )
        );
      } else {
        grid.appendChild(createFieldRow("ターゲット形状", shapeSelect));
        grid.appendChild(
          createEl(
            "p",
            "editor-hint",
            "単体×N: 同一対象への連続ヒット（ヒット時間で分散）。マルチロック×N: 攻撃可能プールへラウンドロビン（複数対象・1体のみなら同一連打）。"
          )
        );
      }
    } else {
      grid.appendChild(
        createEl(
          "p",
          "editor-hint",
          "移動効果は単体（single）のみ。ターゲットは移動先の基準（anchor）です。"
        )
      );
    }
    if (
      !isMove &&
      !isBasicAttackTransform &&
      (targetShape === "single" || targetShape === "aoe")
    ) {
      grid.appendChild(
        createFieldRow(
          "攻撃回数（2以上・省略=1）",
          createNumberInput(
            effect.hitCount ?? 0,
            (hitCount) => {
              const rounded = Math.round(hitCount);
              if (rounded < 2) {
                if (getEffect().hitCount === undefined) return;
                patchEffect(
                  (prev) => {
                    const next: SkillEffectDef = { ...prev, targetShape };
                    delete next.hitCount;
                    delete next.hitDurationSec;
                    return next;
                  },
                  { rerender: true }
                );
                return;
              }
              const showDuration = (getEffect().hitCount ?? 0) < 2;
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape,
                    hitCount: rounded,
                    hitDurationSec: prev.hitDurationSec ?? 1,
                  } as SkillEffectDef),
                { rerender: showDuration }
              );
            },
            {
              min: 2,
              step: 1,
              emptyWhen: 0,
              placeholder: "1（省略）",
            }
          )
        )
      );
      if ((effect.hitCount ?? 0) >= 2) {
        grid.appendChild(
          createFieldRow(
            "攻撃時間（秒）",
            createNumberInput(
              effect.hitDurationSec ?? 1,
              (hitDurationSec) =>
                patchEffect(
                  (prev) =>
                    ({
                      ...prev,
                      targetShape,
                      hitDurationSec,
                    } as SkillEffectDef)
                ),
              { min: 0.1, step: 0.1 }
            )
          )
        );
      }
    }
    if (!isMove && targetShape === "aoe") {
      grid.appendChild(
        createFieldRow(
          "範囲半径 px",
          createNumberInput(
            effect.aoeRadiusPx ?? 70,
            (aoeRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "aoe",
                    aoeRadiusPx,
                  } as SkillEffectDef)
              ),
            { min: 1, step: 10 }
          )
        )
      );
    }
    if (!isMove && targetShape === "multiLock") {
      grid.appendChild(
        createFieldRow(
          "ヒット回数",
          createNumberInput(
            effect.hitCount ?? 3,
            (hitCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "multiLock",
                    hitCount,
                  } as SkillEffectDef)
              ),
            { min: 2, step: 1 }
          )
        )
      );
    }
    if (!isMove && targetShape === "chain") {
      grid.appendChild(
        createFieldRow(
          "連鎖回数",
          createNumberInput(
            effect.chainCount ?? 3,
            (chainCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "chain",
                    chainCount,
                  } as SkillEffectDef)
              ),
            { min: 1, step: 1 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "連鎖距離 px",
          createNumberInput(
            effect.chainMaxDistancePx ?? 80,
            (chainMaxDistancePx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "chain",
                    chainMaxDistancePx,
                  } as SkillEffectDef)
              ),
            { min: 1, step: 10 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "威力減衰倍率（任意）",
          createNumberInput(
            effect.chainPowerStepMultiplier ?? 0,
            (chainPowerStepMultiplier) =>
              patchEffect((prev) => {
                const next: SkillEffectDef = {
                  ...prev,
                  targetShape: "chain",
                };
                if (chainPowerStepMultiplier > 0) {
                  next.chainPowerStepMultiplier = chainPowerStepMultiplier;
                  next.chainPowerStepMode =
                    prev.chainPowerStepMode ?? "multiply";
                } else {
                  delete next.chainPowerStepMultiplier;
                  delete next.chainPowerStepMode;
                }
                return next;
              }),
            { min: 0, step: 0.05, emptyWhen: 0, placeholder: "未設定" }
          )
        )
      );
      if ((effect.chainPowerStepMultiplier ?? 0) > 0) {
        grid.appendChild(
          createFieldRow(
            "減衰方式",
            createSelect(
              effect.chainPowerStepMode ?? "multiply",
              POWER_STEP_MODES.map((value) => ({
                value,
                label: POWER_STEP_MODE_LABELS[value],
              })),
              (chainPowerStepMode) =>
                patchEffect(
                  (prev) =>
                    ({
                      ...prev,
                      targetShape: "chain",
                      chainPowerStepMode: chainPowerStepMode as PowerStepMode,
                    } as SkillEffectDef)
                )
            )
          )
        );
      }
      grid.appendChild(
        createFieldRow(
          "連鎖時間（秒・任意）",
          createNumberInput(
            effect.chainDurationSec ?? 0,
            (chainDurationSec) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "chain",
                    chainDurationSec:
                      chainDurationSec > 0 ? chainDurationSec : undefined,
                  } as SkillEffectDef)
              ),
            { min: 0, step: 0.1, placeholder: "自動" }
          )
        )
      );
    }
    if (!isMove && targetShape === "scatter") {
      grid.appendChild(
        createFieldRow(
          "範囲半径 px",
          createNumberInput(
            effect.scatterSpreadRadiusPx ?? effect.scatterRadiusPx ?? 70,
            (scatterSpreadRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "scatter",
                    scatterSpreadRadiusPx,
                  } as SkillEffectDef)
              ),
            { min: 1, step: 10 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "乱打半径 px",
          createNumberInput(
            effect.scatterRadiusPx ?? 70,
            (scatterRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "scatter",
                    scatterRadiusPx,
                  } as SkillEffectDef)
              ),
            { min: 1, step: 10 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "乱打回数",
          createNumberInput(
            effect.scatterHitCount ?? 3,
            (scatterHitCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "scatter",
                    scatterHitCount,
                  } as SkillEffectDef)
              ),
            { min: 2, step: 1 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "乱打時間（秒）",
          createNumberInput(
            effect.scatterDurationSec ?? 1,
            (scatterDurationSec) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "scatter",
                    scatterDurationSec,
                  } as SkillEffectDef)
              ),
            { min: 0.1, step: 0.1 }
          )
        )
      );
      grid.appendChild(
        createFieldRow(
          "分散率（0〜1）",
          createNumberInput(
            effect.scatterSpreadRate ?? 1,
            (scatterSpreadRate) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "scatter",
                    scatterSpreadRate,
                  } as SkillEffectDef)
              ),
            { min: 0, step: 0.1 }
          )
        )
      );
    }
    if (!isMove && targetShape === "pierce") {
      grid.appendChild(
        createFieldRow(
          "威力減衰倍率（任意）",
          createNumberInput(
            effect.piercePowerStepMultiplier ?? 0,
            (piercePowerStepMultiplier) =>
              patchEffect((prev) => {
                const next: SkillEffectDef = {
                  ...prev,
                  targetShape: "pierce",
                };
                if (piercePowerStepMultiplier > 0) {
                  next.piercePowerStepMultiplier = piercePowerStepMultiplier;
                  next.piercePowerStepMode =
                    prev.piercePowerStepMode ?? "multiply";
                } else {
                  delete next.piercePowerStepMultiplier;
                  delete next.piercePowerStepMode;
                }
                return next;
              }),
            { min: 0, step: 0.05, emptyWhen: 0, placeholder: "未設定" }
          )
        )
      );
      if ((effect.piercePowerStepMultiplier ?? 0) > 0) {
        grid.appendChild(
          createFieldRow(
            "減衰方式",
            createSelect(
              effect.piercePowerStepMode ?? "multiply",
              POWER_STEP_MODES.map((value) => ({
                value,
                label: POWER_STEP_MODE_LABELS[value],
              })),
              (piercePowerStepMode) =>
                patchEffect(
                  (prev) =>
                    ({
                      ...prev,
                      targetShape: "pierce",
                      piercePowerStepMode: piercePowerStepMode as PowerStepMode,
                    } as SkillEffectDef)
                )
            )
          )
        );
      }
      grid.appendChild(
        createFieldRow(
          "貫通時間（秒・任意）",
          createNumberInput(
            effect.pierceDurationSec ?? 0,
            (pierceDurationSec) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: "pierce",
                    pierceDurationSec:
                      pierceDurationSec > 0 ? pierceDurationSec : undefined,
                  } as SkillEffectDef)
              ),
            { min: 0, step: 0.1 }
          )
        )
      );
    }
    if (!isBasicAttack) {
      grid.appendChild(
        createFieldRow(
          "射程 px（省略時=traits.rangePx）",
          createNumberInput(
            effect.range ?? 0,
            (range) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    range: range > 0 ? range : undefined,
                  } as SkillEffectDef)
              ),
            {
              min: 0,
              max: CONFIGURABLE_RANGE_PX_MAX,
              step: 10,
              parseInput: (raw) =>
                parseConfigurableRangePxInput(raw, this.resolveTraitsRangePx()),
            }
          )
        )
      );
      grid.appendChild(createEl("p", "editor-hint", configurableRangeHintJa()));
    }

    const detailGrid = appendGrid(parent);
    detailGrid.classList.add("editor-subgrid");

    if (!isConditionalEffect)
      switch (normalizedEffect.type) {
        case "damage":
          if (isBasicAttack) {
            if (
              this.options.getTraitsDamageType &&
              this.options.onTraitsDamageTypeChange
            ) {
              detailGrid.appendChild(
                createFieldRow(
                  "ダメージ種",
                  createSelect(
                    this.options.getTraitsDamageType(),
                    DAMAGE_TYPE_OPTIONS.map((value) => ({
                      value,
                      label: value,
                    })),
                    (damageType) =>
                      this.options.onTraitsDamageTypeChange?.(
                        damageType as DamageType
                      )
                  )
                )
              );
            }
          } else {
            detailGrid.appendChild(
              createFieldRow(
                "ダメージ種",
                createSelect(
                  effect.damageType ?? "physical",
                  DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
                  (damageType) =>
                    patchEffect((prev) => ({ ...prev, damageType }))
                )
              )
            );
          }
          appendResourceAmountFields(
            detailGrid,
            normalizeEffectAmount(effect),
            (amount, options) =>
              patchEffect((prev) => ({ ...prev, amount }), options)
          );
          appendDamageIncreaseFields(
            detailGrid,
            effect.damageIncrease,
            (damageIncrease, options) => {
              patchEffect((prev) => ({ ...prev, damageIncrease }), options);
            }
          );
          appendDefenseIgnoreFields(
            detailGrid,
            effect.defenseIgnore,
            (defenseIgnore, options) => {
              patchEffect((prev) => ({ ...prev, defenseIgnore }), options);
            }
          );
          if (!isBasicAttack) {
            appendThreatBurstFields(
              detailGrid,
              effect as Extract<SkillEffectDef, { type: "damage" }>,
              patchEffect
            );
            appendDamagePierceFields(
              detailGrid,
              effect as Extract<SkillEffectDef, { type: "damage" }>,
              patchEffect
            );
          }
          break;
        case "heal": {
          const healEffect = getEffect();
          const healSubKind = (healEffect.healSubKind ??
            "instant") as HealSubKind;
          detailGrid.appendChild(
            createFieldRow(
              "回復種別",
              createSelect(
                healSubKind,
                HEAL_SUB_KINDS.map((value) => ({
                  value,
                  label: HEAL_SUB_KIND_LABELS[value],
                })),
                (nextHealSubKind) =>
                  patchEffect(
                    (prev) =>
                      applyActiveHealSubKindChange(prev, nextHealSubKind),
                    { rerender: true }
                  )
              )
            )
          );
          if (healSubKind === "dispel") {
            appendDispelEffectFields(
              detailGrid,
              {
                ...(healEffect as Extract<SkillEffectDef, { type: "heal" }>),
                type: "dispel",
                dispelCount: healEffect.dispelCount ?? 0,
                dispelPriority: healEffect.dispelPriority,
              },
              (next) => {
                patchEffect((prev) => {
                  if (prev.type !== "heal") return prev;
                  const dispelView = {
                    ...prev,
                    type: "dispel" as const,
                    dispelCount: prev.dispelCount ?? 0,
                    dispelPriority: prev.dispelPriority,
                  };
                  const updated =
                    typeof next === "function" ? next(dispelView) : next;
                  if (updated.type !== "dispel") return prev;
                  return {
                    ...prev,
                    dispelTags: updated.dispelTags,
                    dispelCount: updated.dispelCount,
                    dispelPriority: updated.dispelPriority,
                  };
                });
              }
            );
            break;
          }
          if (healSubKind === "hot") {
            detailGrid.appendChild(
              createFieldRow(
                "秒数",
                createNumberInput(
                  healEffect.durationSec ?? DEFAULT_HOT_DURATION_SEC,
                  (durationSec) =>
                    patchEffect(
                      (prev) => ({ ...prev, durationSec } as SkillEffectDef)
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
          }
          appendResourceAmountFields(
            detailGrid,
            normalizeEffectAmount(healEffect),
            (amount, options) =>
              patchEffect((prev) => ({ ...prev, amount }), options)
          );
          appendDamageIncreaseFields(
            detailGrid,
            healEffect.damageIncrease,
            (damageIncrease, options) => {
              patchEffect((prev) => ({ ...prev, damageIncrease }), options);
            }
          );
          break;
        }
        case "buff":
          if (
            isBasicAttack &&
            (effect.buffSubKind === "barrier" ||
              effect.buffSubKind === undefined)
          ) {
            appendResourceAmountFields(
              detailGrid,
              normalizeEffectAmount(effect),
              (amount, options) =>
                patchEffect(
                  (prev) =>
                    ({
                      ...prev,
                      amount,
                      buffSubKind: "barrier",
                    } as SkillEffectDef),
                  options
                )
            );
            break;
          }
          detailGrid.appendChild(
            createFieldRow(
              "バフ種別",
              createSelect(
                effect.buffSubKind ?? "stat",
                BUFF_SUB_KINDS.map((value) => ({
                  value,
                  label: BUFF_SUB_KIND_LABELS[value],
                })),
                (buffSubKind) =>
                  patchEffect(
                    (prev) => applyActiveBuffSubKindChange(prev, buffSubKind),
                    { rerender: true }
                  )
              )
            )
          );
          if (
            effect.buffSubKind === "block" ||
            effect.buffSubKind === "evasion"
          ) {
            detailGrid.appendChild(
              createFieldRow(
                "確率 (0–1)",
                createNumberInput(
                  effect.chance ?? 0.2,
                  (chance) =>
                    patchEffect(
                      (prev) => ({ ...prev, chance } as SkillEffectDef)
                    ),
                  { min: 0, max: 1, step: 0.01 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "秒数",
                createNumberInput(
                  effect.buffDurationSec ?? 5,
                  (buffDurationSec) =>
                    patchEffect(
                      (prev) => ({ ...prev, buffDurationSec } as SkillEffectDef)
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            break;
          }
          if (effect.buffSubKind === "damageDelay") {
            detailGrid.appendChild(
              createFieldRow(
                "ratio",
                createNumberInput(
                  effect.ratio ?? 0.1,
                  (ratio) =>
                    patchEffect(
                      (prev) => ({ ...prev, ratio } as SkillEffectDef)
                    ),
                  { min: 0, max: 1, step: 0.01 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "秒数",
                createNumberInput(
                  effect.buffDurationSec ?? 5,
                  (buffDurationSec) =>
                    patchEffect(
                      (prev) => ({ ...prev, buffDurationSec } as SkillEffectDef)
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            break;
          }
          if (effect.buffSubKind === "barrier") {
            appendResourceAmountFields(
              detailGrid,
              normalizeEffectAmount(effect),
              (amount, options) =>
                patchEffect(
                  (prev) => ({ ...prev, amount } as SkillEffectDef),
                  options
                )
            );
            detailGrid.appendChild(
              (() => {
                const row = createEl(
                  "div",
                  "editor-field editor-field-checkbox"
                );
                const label = createEl("label");
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = effect.barrierStack === true;
                input.addEventListener("change", () => {
                  patchEffect(
                    (prev) =>
                      ({
                        ...prev,
                        barrierStack: input.checked ? true : undefined,
                      } as SkillEffectDef)
                  );
                });
                label.appendChild(input);
                label.append(" 継ぎ足し（既存バリアに加算）");
                row.appendChild(label);
                return row;
              })()
            );
            break;
          }
          if (effect.buffSubKind === "wardBarrier") {
            detailGrid.appendChild(
              createFieldRow(
                "スタック",
                createNumberInput(
                  effect.stacks ?? 2,
                  (stacks) =>
                    patchEffect((prev) =>
                      prev.type === "buff" ? { ...prev, stacks } : prev
                    ),
                  { min: 1, step: 1 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "被ダメ倍率",
                createNumberInput(
                  effect.damageReductionRatio ?? 0.1,
                  (damageReductionRatio) =>
                    patchEffect((prev) =>
                      prev.type === "buff"
                        ? { ...prev, damageReductionRatio }
                        : prev
                    ),
                  { min: 0, max: 1, step: 0.05 }
                )
              )
            );
            break;
          }
          detailGrid.appendChild(
            createFieldRow(
              "対象ステ",
              createSelect(
                Array.isArray(effect.buffStat)
                  ? effect.buffStat[0]!
                  : effect.buffStat ?? "atk",
                STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                  value,
                  label: STAT_LABELS[value],
                })),
                (buffStat) =>
                  patchEffect((prev) =>
                    prev.type === "buff" ? { ...prev, buffStat } : prev
                  )
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "倍率",
              createNumberInput(
                effect.buffMultiplier ?? 1,
                (buffMultiplier) =>
                  patchEffect((prev) => ({ ...prev, buffMultiplier })),
                { step: 0.01 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "固定値",
              createNumberInput(
                effect.buffFlatBonus ?? 0,
                (buffFlatBonus) =>
                  patchEffect((prev) => ({
                    ...prev,
                    buffFlatBonus:
                      buffFlatBonus > 0 ? buffFlatBonus : undefined,
                  })),
                { step: 1 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "秒数",
              createNumberInput(
                effect.buffDurationSec ?? 5,
                (buffDurationSec) =>
                  patchEffect((prev) =>
                    prev.type === "buff" ? { ...prev, buffDurationSec } : prev
                  ),
                { min: 0.1, step: 0.5 }
              )
            )
          );
          break;
        case "debuff":
          detailGrid.appendChild(
            createFieldRow(
              "デバフ種別",
              createSelect(
                (normalizedEffect.type === "debuff"
                  ? normalizedEffect.debuffSubKind
                  : undefined) ?? "stat",
                DEBUFF_SUB_KINDS.map((value) => ({
                  value,
                  label: DEBUFF_SUB_KIND_LABELS[value],
                })),
                (debuffSubKind) =>
                  patchEffect(
                    (prev) => {
                      const next = { ...prev, debuffSubKind } as SkillEffectDef;
                      if (debuffSubKind === "dot" && prev.type === "debuff") {
                        return withDebuffDotDefaults({
                          ...next,
                          debuffSubKind: "dot",
                        });
                      }
                      return next;
                    },
                    { rerender: true }
                  )
              )
            )
          );
          if (
            normalizedEffect.type === "debuff" &&
            normalizedEffect.debuffSubKind === "dot"
          ) {
            detailGrid.appendChild(
              createFieldRow(
                "秒数",
                createNumberInput(
                  normalizedEffect.durationSec ?? DEFAULT_DOT_DURATION_SEC,
                  (durationSec) =>
                    patchEffect(
                      (prev) => ({ ...prev, durationSec } as SkillEffectDef)
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            appendResourceAmountFields(
              detailGrid,
              normalizeEffectAmount(effect),
              (amount, options) =>
                patchEffect(
                  (prev) => ({ ...prev, amount } as SkillEffectDef),
                  options
                )
            );
            detailGrid.appendChild(
              createFieldRow(
                "ダメージ種",
                createSelect(
                  effect.damageType ?? "physical",
                  DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
                  (damageType) =>
                    patchEffect(
                      (prev) => ({ ...prev, damageType } as SkillEffectDef)
                    )
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "DoTフレーバー",
                createSelect(
                  normalizedEffect.dotFlavor ?? "",
                  [
                    { value: "", label: "未指定（汎用DoT）" },
                    ...DOT_FLAVORS.map((value) => ({
                      value,
                      label: DOT_FLAVOR_LABELS[value],
                    })),
                  ],
                  (dotFlavor) =>
                    patchEffect((prev) => {
                      if (prev.type !== "debuff") return prev;
                      const next = { ...prev } as DebuffSkillEffect;
                      if (dotFlavor === "") {
                        delete next.dotFlavor;
                      } else {
                        next.dotFlavor =
                          dotFlavor as DebuffSkillEffect["dotFlavor"];
                      }
                      return next;
                    })
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "表示名",
                createTextInput(
                  normalizedEffect.buffDisplayName ?? "",
                  (buffDisplayName) =>
                    patchEffect((prev) => {
                      if (prev.type !== "debuff") return prev;
                      const trimmed = buffDisplayName.trim();
                      const next = { ...prev } as DebuffSkillEffect;
                      if (trimmed) {
                        next.buffDisplayName = trimmed;
                      } else {
                        delete next.buffDisplayName;
                      }
                      return next;
                    })
                )
              )
            );
            break;
          }
          if (
            normalizedEffect.type === "debuff" &&
            normalizedEffect.debuffSubKind === "stun"
          ) {
            detailGrid.appendChild(
              createFieldRow(
                "秒数",
                createNumberInput(
                  effect.durationSec ?? 1,
                  (durationSec) =>
                    patchEffect(
                      (prev) => ({ ...prev, durationSec } as SkillEffectDef)
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            break;
          }
          detailGrid.appendChild(
            createFieldRow(
              "対象ステ",
              createSelect(
                Array.isArray(effect.debuffStat)
                  ? effect.debuffStat[0]!
                  : effect.debuffStat ?? "atk",
                STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                  value,
                  label: STAT_LABELS[value],
                })),
                (debuffStat) =>
                  patchEffect((prev) =>
                    prev.type === "debuff" ? { ...prev, debuffStat } : prev
                  )
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "倍率",
              createNumberInput(
                effect.debuffMultiplier ?? 1,
                (debuffMultiplier) =>
                  patchEffect((prev) => ({ ...prev, debuffMultiplier })),
                { step: 0.01 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "秒数",
              createNumberInput(
                effect.debuffDurationSec ?? 5,
                (debuffDurationSec) =>
                  patchEffect((prev) =>
                    prev.type === "debuff"
                      ? { ...prev, debuffDurationSec }
                      : prev
                  ),
                { min: 0.1, step: 0.5 }
              )
            )
          );
          break;
        case "stun":
          detailGrid.appendChild(
            createFieldRow(
              "秒数",
              createNumberInput(
                effect.durationSec,
                (durationSec) =>
                  patchEffect((prev) => ({ ...prev, durationSec })),
                { min: 0.1, step: 0.1 }
              )
            )
          );
          break;
        case "knockback":
          detailGrid.appendChild(
            createFieldRow(
              "距離 px",
              createNumberInput(
                effect.distancePx,
                (distancePx) =>
                  patchEffect((prev) => ({ ...prev, distancePx })),
                { min: 1, step: 5 }
              )
            )
          );
          break;
        case "barrier":
          appendResourceAmountFields(
            detailGrid,
            normalizeEffectAmount(effect),
            (amount, options) =>
              patchEffect((prev) => ({ ...prev, amount }), options)
          );
          detailGrid.appendChild(
            (() => {
              const row = createEl("div", "editor-field editor-field-checkbox");
              const label = createEl("label");
              const input = document.createElement("input");
              input.type = "checkbox";
              input.checked = effect.barrierStack === true;
              input.addEventListener("change", () => {
                patchEffect((prev) => ({
                  ...prev,
                  barrierStack: input.checked ? true : undefined,
                }));
              });
              label.appendChild(input);
              label.append(" 継ぎ足し（既存バリアに加算）");
              row.appendChild(label);
              return row;
            })()
          );
          break;
        case "dot":
          detailGrid.appendChild(
            createFieldRow(
              "秒数",
              createNumberInput(
                normalizedEffect.durationSec ?? DEFAULT_DOT_DURATION_SEC,
                (durationSec) =>
                  patchEffect((prev) => ({ ...prev, durationSec })),
                { min: 0.1, step: 0.5 }
              )
            )
          );
          appendResourceAmountFields(
            detailGrid,
            normalizeEffectAmount(effect),
            (amount, options) =>
              patchEffect((prev) => ({ ...prev, amount }), options)
          );
          detailGrid.appendChild(
            createFieldRow(
              "ダメージ種",
              createSelect(
                effect.damageType ?? "physical",
                DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
                (damageType) => patchEffect((prev) => ({ ...prev, damageType }))
              )
            )
          );
          appendDamageIncreaseFields(
            detailGrid,
            effect.damageIncrease,
            (damageIncrease, options) => {
              patchEffect((prev) => ({ ...prev, damageIncrease }), options);
            }
          );
          appendDefenseIgnoreFields(
            detailGrid,
            effect.defenseIgnore,
            (defenseIgnore, options) => {
              patchEffect((prev) => ({ ...prev, defenseIgnore }), options);
            }
          );
          appendDamagePierceFields(
            detailGrid,
            effect as Extract<SkillEffectDef, { type: "damage" }>,
            patchEffect
          );
          break;
        case "dispel":
          appendDispelEffectFields(detailGrid, effect, patchEffect);
          break;
        case "block":
          detailGrid.appendChild(
            createFieldRow(
              "ブロック率 (0–1)",
              createNumberInput(
                effect.blockChance,
                (blockChance) =>
                  patchEffect((prev) =>
                    prev.type === "block" ? { ...prev, blockChance } : prev
                  ),
                { min: 0, max: 1, step: 0.01 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "秒数",
              createNumberInput(
                effect.durationSec,
                (durationSec) =>
                  patchEffect((prev) =>
                    prev.type === "block" ? { ...prev, durationSec } : prev
                  ),
                { min: 0.1, step: 0.5 }
              )
            )
          );
          break;
        case "counter":
          appendCounterEffectFields(
            detailGrid,
            effect,
            (patch, options) =>
              patchEffect(
                (prev) => (prev.type === "counter" ? patch(prev) : prev),
                options
              ),
            { traitsRangePx: this.resolveTraitsRangePx() }
          );
          detailGrid.appendChild(
            createFieldRow(
              "発動確率 (0–1)",
              createNumberInput(
                effect.chance ?? 1,
                (chance) =>
                  patchEffect((prev) =>
                    prev.type === "counter" ? { ...prev, chance } : prev
                  ),
                { min: 0, max: 1, step: 0.01 }
              )
            )
          );
          break;
        case "basicAttackTransform":
          if (normalizedEffect.type === "basicAttackTransform") {
            appendBasicAttackTransformFields(
              detailGrid,
              normalizedEffect,
              patchEffect
            );
            this.renderNestedEffectList(
              detailGrid,
              "appendEffects（通常攻撃後に追加）",
              normalizedEffect.appendEffects ?? [],
              (appendEffects, options) => {
                patchEffect((prev) => {
                  if (prev.type !== "basicAttackTransform") return prev;
                  return {
                    ...prev,
                    target: { kind: "self" },
                    appendEffects:
                      appendEffects.length > 0 ? appendEffects : undefined,
                  };
                }, options);
              },
              skillId,
              { defaultEffectType: "heal" }
            );
          }
          break;
        case "grantNextOutgoingDamage":
          detailGrid.appendChild(
            createFieldRow(
              "nextOutgoingDamageMultiplier",
              createNumberInput(
                effect.nextOutgoingDamageMultiplier ?? 1.3,
                (nextOutgoingDamageMultiplier) =>
                  patchEffect((prev) =>
                    prev.type === "grantNextOutgoingDamage"
                      ? { ...prev, nextOutgoingDamageMultiplier }
                      : prev
                  ),
                { min: 0.01, step: 0.05 }
              )
            )
          );
          break;
        case "placedField":
          if (normalizedEffect.type === "placedField") {
            detailGrid.appendChild(
              createEl(
                "p",
                "editor-hint",
                "配置 anchor は clusterCenter 推奨。範囲内 enter / stay で効果を適用。"
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "fieldRadiusPx",
                createNumberInput(
                  normalizedEffect.fieldRadiusPx ?? 70,
                  (fieldRadiusPx) =>
                    patchEffect((prev) =>
                      prev.type === "placedField"
                        ? { ...prev, fieldRadiusPx }
                        : prev
                    ),
                  { min: 1, step: 10 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "fieldDurationSec",
                createNumberInput(
                  normalizedEffect.fieldDurationSec ?? 5,
                  (fieldDurationSec) =>
                    patchEffect((prev) =>
                      prev.type === "placedField"
                        ? { ...prev, fieldDurationSec }
                        : prev
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "stayTickIntervalSec",
                createNumberInput(
                  normalizedEffect.stayTickIntervalSec ?? 1,
                  (stayTickIntervalSec) =>
                    patchEffect((prev) =>
                      prev.type === "placedField"
                        ? { ...prev, stayTickIntervalSec }
                        : prev
                    ),
                  { min: 0.1, step: 0.5 }
                )
              )
            );
            detailGrid.appendChild(
              createFieldRow(
                "stayCompressRatioBonusPerTick",
                createNumberInput(
                  normalizedEffect.stayCompressRatioBonusPerTick ?? 0,
                  (stayCompressRatioBonusPerTick) =>
                    patchEffect((prev) =>
                      prev.type === "placedField"
                        ? {
                            ...prev,
                            stayCompressRatioBonusPerTick:
                              stayCompressRatioBonusPerTick > 0
                                ? stayCompressRatioBonusPerTick
                                : undefined,
                          }
                        : prev
                    ),
                  { min: 0, step: 0.01 }
                )
              )
            );
            this.renderNestedEffectList(
              detailGrid,
              "enterEffects",
              normalizedEffect.enterEffects ?? [],
              (enterEffects, options) => {
                patchEffect((prev) => {
                  if (prev.type !== "placedField") return prev;
                  return {
                    ...prev,
                    enterEffects:
                      enterEffects.length > 0 ? enterEffects : undefined,
                  };
                }, options);
              },
              skillId,
              { defaultEffectType: "dotCompress" }
            );
            this.renderNestedEffectList(
              detailGrid,
              "stayEffects",
              normalizedEffect.stayEffects ?? [],
              (stayEffects, options) => {
                patchEffect((prev) => {
                  if (prev.type !== "placedField") return prev;
                  return {
                    ...prev,
                    stayEffects:
                      stayEffects.length > 0 ? stayEffects : undefined,
                  };
                }, options);
              },
              skillId,
              { defaultEffectType: "dotCompress" }
            );
          }
          break;
        case "dotCompress":
          detailGrid.appendChild(
            createFieldRow(
              "compressRatio",
              createNumberInput(
                effect.compressRatio ?? 0.5,
                (compressRatio) =>
                  patchEffect((prev) =>
                    prev.type === "dotCompress"
                      ? { ...prev, compressRatio }
                      : prev
                  ),
                { min: 0.01, max: 1, step: 0.05 }
              )
            )
          );
          break;
        case "dotExtend":
          detailGrid.appendChild(
            createFieldRow(
              "extendRatio",
              createNumberInput(
                effect.extendRatio ?? 1.25,
                (extendRatio) =>
                  patchEffect((prev) =>
                    prev.type === "dotExtend" ? { ...prev, extendRatio } : prev
                  ),
                { min: 0.01, step: 0.05 }
              )
            )
          );
          break;
        case "dotHarvest":
          detailGrid.appendChild(
            createFieldRow(
              "harvestRatio",
              createNumberInput(
                effect.harvestRatio ?? 0.1,
                (harvestRatio) =>
                  patchEffect((prev) =>
                    prev.type === "dotHarvest"
                      ? { ...prev, harvestRatio }
                      : prev
                  ),
                { min: 0.01, max: 1, step: 0.01 }
              )
            )
          );
          break;
        case "poisonSpread":
          detailGrid.appendChild(
            createFieldRow(
              "spreadRadiusPx",
              createNumberInput(
                effect.spreadRadiusPx ?? 70,
                (spreadRadiusPx) =>
                  patchEffect((prev) =>
                    prev.type === "poisonSpread"
                      ? { ...prev, spreadRadiusPx }
                      : prev
                  ),
                { min: 1, step: 10 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "spreadDurationRatio",
              createNumberInput(
                effect.spreadDurationRatio ?? 0.5,
                (spreadDurationRatio) =>
                  patchEffect((prev) =>
                    prev.type === "poisonSpread"
                      ? { ...prev, spreadDurationRatio }
                      : prev
                  ),
                { min: 0.01, max: 1, step: 0.05 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "dotFlavor",
              createSelect(
                effect.dotFlavor ?? "poison",
                DOT_FLAVORS.map((value) => ({
                  value,
                  label: DOT_FLAVOR_LABELS[value],
                })),
                (dotFlavor) =>
                  patchEffect((prev) =>
                    prev.type === "poisonSpread" ? { ...prev, dotFlavor } : prev
                  )
              )
            )
          );
          break;
        case "enemyReelIn":
          break;
        case "blockResonanceConsume":
          detailGrid.appendChild(
            createEl(
              "p",
              "editor-hint",
              "態勢パラメータはスキル詳細（発動ゲートの下）で編集します。"
            )
          );
          break;
        case "arenaDominance":
          detailGrid.appendChild(
            createFieldRow(
              "持続秒",
              createNumberInput(
                effect.durationSec ?? 15,
                (durationSec) =>
                  patchEffect((prev) =>
                    prev.type === "arenaDominance"
                      ? { ...prev, durationSec }
                      : prev
                  ),
                { min: 0.1, step: 0.5 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "非マーク被ダメ倍率",
              createNumberInput(
                effect.nonMarkDamageMultiplier ?? 0.5,
                (nonMarkDamageMultiplier) =>
                  patchEffect((prev) =>
                    prev.type === "arenaDominance"
                      ? { ...prev, nonMarkDamageMultiplier }
                      : prev
                  ),
                { min: 0, max: 1, step: 0.05 }
              )
            )
          );
          break;
        case "move": {
          const moveEffect = effect as MoveSkillEffect;
          detailGrid.appendChild(
            createFieldRow(
              "移動時間（秒）",
              createNumberInput(
                moveEffect.moveDurationSec,
                (moveDurationSec) =>
                  patchEffect((prev) => ({
                    ...(prev as MoveSkillEffect),
                    moveDurationSec:
                      moveDurationSec > 0 ? moveDurationSec : 0.1,
                  })),
                { min: 0.05, step: 0.05 }
              )
            )
          );
          detailGrid.appendChild(
            createFieldRow(
              "移動モード",
              createSelect(
                moveEffect.moveMode ?? "engage",
                MOVE_MODES.map((value) => ({
                  value,
                  label: MOVE_MODE_LABELS[value],
                })),
                (moveMode) =>
                  patchEffect(
                    (prev) => ({ ...(prev as MoveSkillEffect), moveMode }),
                    { rerender: true }
                  )
              )
            )
          );
          if ((moveEffect.moveMode ?? "engage") !== "toAnchor") {
            detailGrid.appendChild(
              createEl(
                "p",
                "editor-hint",
                "アンカーオフセットは「アンカー座標へ」モードでのみ有効です。"
              )
            );
          }
          detailGrid.appendChild(
            createFieldRow(
              "アンカーオフセット px（−=味方側、+=敵背後）",
              createNumberInput(
                moveEffect.anchorOffsetPx ?? 0,
                (anchorOffsetPx) =>
                  patchEffect((prev) => ({
                    ...(prev as MoveSkillEffect),
                    anchorOffsetPx:
                      anchorOffsetPx !== 0 ? anchorOffsetPx : undefined,
                  })),
                { step: 10 }
              )
            )
          );
          break;
        }
      }

    if (sequenceContext) {
      appendEffectSequenceTimingFields(
        parent,
        effect,
        patchEffect,
        sequenceContext.effectIndex >= sequenceContext.effectCount - 1
      );
    }

    if (!isBasicAttack && effectSupportsPresentationFields(effect)) {
      const entityId =
        this.options.classIdentity?.classId.trim() ||
        this.options.entityPicker?.selectedId ||
        "";
      const labLink =
        entityId && skillId && sequenceContext
          ? {
              entityKind: (this.options.classIdentity ? "class" : "enemy") as
                | "class"
                | "enemy",
              entityId,
              skillId,
              effectIndex: sequenceContext.effectIndex,
            }
          : undefined;
      appendEffectPresentationFields(parent, effect, patchEffect, labLink);
    }
  }

  private renderNestedEffectList(
    parent: HTMLElement,
    title: string,
    effects: SkillEffectDef[],
    onUpdate: (
      effects: SkillEffectDef[],
      options?: { rerender?: boolean }
    ) => void,
    skillId?: string,
    options?: { defaultEffectType?: SkillEffectKind }
  ): void {
    const section = createEl("div", "editor-branch-effects-section");
    section.appendChild(createEl("h4", "editor-subsection-title", title));
    const defaultType = options?.defaultEffectType ?? "damage";
    effects.forEach((nestedEffect, nestedIndex) => {
      const block = createEl(
        "div",
        "editor-effect-block editor-branch-effect-block"
      );
      const header = createEl("div", "editor-effect-header");
      header.appendChild(
        createEl("span", "editor-effect-label", `${title} ${nestedIndex + 1}`)
      );
      if (effects.length > 1) {
        header.appendChild(
          createButton("削除", "editor-btn editor-btn-small", () => {
            onUpdate(
              effects.filter((_, i) => i !== nestedIndex),
              { rerender: true }
            );
          })
        );
      }
      block.appendChild(header);
      this.renderEffect(
        block,
        nestedEffect,
        (nextEffect, patchOptions) => {
          const nextEffects = [...effects];
          nextEffects[nestedIndex] = nextEffect;
          onUpdate(nextEffects, patchOptions);
        },
        false,
        false,
        undefined,
        skillId,
        { hideConditionalCategory: true }
      );
      section.appendChild(block);
    });
    section.appendChild(
      createButton(`+ ${title}を追加`, "editor-btn editor-btn-small", () => {
        onUpdate([...effects, defaultEffect(defaultType)], { rerender: true });
      })
    );
    parent.appendChild(section);
  }

  private renderBranchEffectList(
    parent: HTMLElement,
    title: string,
    branchKey: "thenEffects" | "elseEffects",
    effect: Extract<SkillEffectDef, { type: "conditionalEffect" }>,
    patchEffect: (patch: EffectPatch, options?: { rerender?: boolean }) => void,
    showPerEffectPresentation: boolean,
    skillId?: string
  ): void {
    const section = createEl("div", "editor-branch-effects-section");
    section.appendChild(createEl("h4", "editor-subsection-title", title));
    const branchEffects = effect[branchKey];
    branchEffects.forEach((branchEffect, branchIndex) => {
      const block = createEl(
        "div",
        "editor-effect-block editor-branch-effect-block"
      );
      const header = createEl("div", "editor-effect-header");
      header.appendChild(
        createEl("span", "editor-effect-label", `${title} ${branchIndex + 1}`)
      );
      if (branchEffects.length > 1) {
        header.appendChild(
          createButton("削除", "editor-btn editor-btn-small", () => {
            patchEffect(
              (prev) => {
                if (prev.type !== "conditionalEffect") return prev;
                return {
                  ...prev,
                  [branchKey]: prev[branchKey].filter(
                    (_, i) => i !== branchIndex
                  ),
                };
              },
              { rerender: true }
            );
          })
        );
      }
      block.appendChild(header);
      this.renderEffect(
        block,
        branchEffect,
        (nextEffect, options) => {
          patchEffect((prev) => {
            if (prev.type !== "conditionalEffect") return prev;
            const nextBranch = [...prev[branchKey]];
            nextBranch[branchIndex] = nextEffect;
            return { ...prev, [branchKey]: nextBranch };
          }, options);
        },
        showPerEffectPresentation,
        false,
        undefined,
        skillId,
        { hideConditionalCategory: true }
      );
      section.appendChild(block);
    });
    section.appendChild(
      createButton(`+ ${title}を追加`, "editor-btn editor-btn-small", () => {
        patchEffect(
          (prev) => {
            if (prev.type !== "conditionalEffect") return prev;
            return {
              ...prev,
              [branchKey]: [...prev[branchKey], defaultEffect("damage")],
            };
          },
          { rerender: true }
        );
      })
    );
    parent.appendChild(section);
  }
}

function effectSupportsPresentationFields(effect: SkillEffectDef): boolean {
  return (
    effect.type === "move" ||
    effect.type === "damage" ||
    effect.type === "dot" ||
    effect.type === "heal" ||
    effect.type === "conditionalEffect"
  );
}
