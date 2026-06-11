import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  BUFF_SUB_KIND_LABELS,
  BUFF_SUB_KINDS,
  DEBUFF_SUB_KIND_LABELS,
  DEBUFF_SUB_KINDS,
  DAMAGE_TYPE_OPTIONS,
  EDITOR_ACTIVE_EFFECT_CATEGORIES,
  EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS,
  EDITOR_PASSIVE_EFFECT_KIND_OPTIONS,
  HEAL_SUB_KIND_LABELS,
  HEAL_SUB_KINDS,
  MOVE_MODE_LABELS,
  MOVE_MODES,
  PASSIVE_EFFECT_KIND_LABELS,
  COUNTER_RESPONSE_KIND_LABELS,
  COUNTER_RESPONSE_KINDS,
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
  VFX_PRESET_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import {
  normalizePassiveSkillForEditor,
  stripBasicAttackTraitFieldsFromEffect,
} from '../battle/data/validateGameData.ts';
import {
  activeEffectHasAmount,
  getActiveEffectAmountSpec,
  getPassiveAmountSpec,
  inferPassiveAmountField,
  isActiveSkillAmountOverrideTarget,
  isPassiveSkillAmountOverrideTarget,
} from '../battle/skillAmountOverride.ts';
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  CounterResponseDef,
  CounterResponseKind,
  CounterSkillEffect,
  MoveSkillEffect,
  MaxHpReference,
  PassiveSkillDef,
  ResourceAmountSpec,
  HealSubKind,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillEffectKind,
  SkillTriggerKind,
  SkillVfxPresetId,
  StatusEffectStat,
  TargetShape,
} from '../battle/types.ts';
import { CONFIGURABLE_RANGE_PX_MAX, configurableRangeHintJa } from '../battle/rangeLimits.ts';
import {
  defaultTargetForEffectType,
  getEffectTarget,
} from '../battle/skills/targetSpec.ts';
import { skillHasMoveEffect } from '../battle/skills/skillSequence.ts';
import { resolveSkillTrigger } from '../battle/skillTrigger.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
} from '../ui/formatSkillText.ts';
import type { SkillDraftEntry, SkillSlotKind } from './editorApi.ts';
import {
  appendDefenseIgnoreFields,
  appendDispelEffectFields,
  appendDamageIncreaseFields,
  appendPassiveDamageIncreaseFields,
  appendPassiveDefenseIgnoreFields,
  appendPassiveDebuffFields,
  appendPassiveDispelFields,
  appendPassiveDamageReductionFields,
  appendPassiveHealFields,
  appendPassiveBuffFields,
  appendPassiveSpecialEffectFields,
  appendTargetSpecFields,
} from './skillEditorCombatFields.ts';
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
  createSelect,
  createTextInput,
  preserveScrollDuring,
} from './formUtils.ts';

const STAT_LABELS: Record<StatusEffectStat, string> = {
  atk: '攻撃',
  def: '防御',
  reg: '耐魔',
  damageTaken: '被ダメ',
  attackSpeed: '攻撃速度',
};

const DEFAULT_DOT_DURATION_SEC = 5;

function defaultResourceAmount(atkScale = 1): ResourceAmountSpec {
  return { kind: 'atkBased', atkScale };
}

function defaultDefResourceAmount(defScale = 1): ResourceAmountSpec {
  return { kind: 'defBased', defScale };
}

function formatAmountPreview(spec: ResourceAmountSpec | undefined): string {
  if (!spec) return '—';
  switch (spec.kind) {
    case 'atkBased':
      return `ATK×${spec.atkScale ?? 1}`;
    case 'defBased':
      return `DEF×${spec.defScale ?? 1}`;
    case 'flat':
      return `固定 ${spec.flatAmount ?? 0}`;
    case 'percentMaxHp':
      return `maxHP ${((spec.percentOfMaxHp ?? 0) * 100).toFixed(0)}%`;
  }
}

function resolveSkillAmountOverrideOriginal(
  entries: SkillDraftEntry[],
  targetSkillId: string,
  effectIndex?: number,
  passiveAmountField?: PassiveSkillDef['passiveAmountField'],
): ResourceAmountSpec | undefined {
  const entry = entries.find(
    (item) =>
      item.passive?.id === targetSkillId || item.active?.id === targetSkillId,
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
  const field =
    passiveAmountField ?? inferPassiveAmountField(entry.passive!);
  return field ? getPassiveAmountSpec(entry.passive!, field) : undefined;
}

function defaultCounterResponse(kind: CounterResponseKind): CounterResponseDef {
  switch (kind) {
    case 'damage':
      return {
        kind: 'damage',
        amount: defaultDefResourceAmount(0.5),
        damageType: 'physical',
      };
    case 'debuff':
      return {
        kind: 'debuff',
        debuffStat: 'atk',
        debuffMultiplier: 0.8,
        debuffDurationSec: 3,
      };
    case 'dot':
      return {
        kind: 'dot',
        durationSec: 3,
        powerMultiplier: 0.5,
        damageType: 'physical',
      };
    case 'stun':
      return { kind: 'stun', durationSec: 1 };
    case 'knockback':
      return { kind: 'knockback', distancePx: 30 };
  }
}

function counterHasResponse(
  effect: CounterSkillEffect,
  kind: CounterResponseKind,
): boolean {
  return effect.responses.some((response) => response.kind === kind);
}

function patchCounterResponses(
  effect: CounterSkillEffect,
  kind: CounterResponseKind,
  enabled: boolean,
): CounterResponseDef[] {
  const rest = effect.responses.filter((response) => response.kind !== kind);
  if (!enabled) {
    return rest.length > 0 ? rest : [defaultCounterResponse('damage')];
  }
  return [...rest, defaultCounterResponse(kind)];
}

function findCounterResponse<T extends CounterResponseKind>(
  effect: CounterSkillEffect,
  kind: T,
): Extract<CounterResponseDef, { kind: T }> | undefined {
  return effect.responses.find(
    (response): response is Extract<CounterResponseDef, { kind: T }> =>
      response.kind === kind,
  );
}

function appendCounterEffectFields(
  parent: HTMLElement,
  effect: CounterSkillEffect,
  patchEffect: (
    patch: (prev: CounterSkillEffect) => CounterSkillEffect,
    options?: { rerender?: boolean },
  ) => void,
  options?: { showDuration?: boolean },
): void {
  const showDuration = options?.showDuration ?? true;
  const grid = appendGrid(parent);
  grid.appendChild(
    createEl(
      'p',
      'editor-hint',
      showDuration
        ? '付与対象: 自身（固定）。反撃は設定射程内の攻撃を受けたとき攻撃者へ適用。'
        : '常時受付。被攻撃のたびに発動確率を判定し、成功時に反撃内容を適用。',
    ),
  );
  grid.appendChild(
    createFieldRow(
      '反撃射程 (px)',
      createNumberInput(
        effect.range ?? 0,
        (range) =>
          patchEffect((prev) => ({
            ...prev,
            range,
          })),
        { min: 0, max: CONFIGURABLE_RANGE_PX_MAX, step: 1 },
      ),
    ),
  );
  if (showDuration) {
    grid.appendChild(
      createFieldRow(
        '秒数',
        createNumberInput(
          effect.durationSec,
          (durationSec) =>
            patchEffect((prev) => ({ ...prev, durationSec })),
          { min: 0.1, step: 0.5 },
        ),
      ),
    );
  }

  const responseSection = createSection('反撃内容（1種別以上）');
  grid.appendChild(responseSection);
  for (const kind of COUNTER_RESPONSE_KINDS) {
    const enabled = counterHasResponse(effect, kind);
    const toggleRow = createEl('div', 'editor-field editor-field-checkbox');
    const toggleInput = createEl('input') as HTMLInputElement;
    toggleInput.type = 'checkbox';
    toggleInput.checked = enabled;
    toggleInput.addEventListener('change', () => {
      patchEffect(
        (prev) => ({
          ...prev,
          responses: patchCounterResponses(prev, kind, toggleInput.checked),
        }),
        { rerender: true },
      );
    });
    toggleRow.appendChild(
      createEl('label', undefined, COUNTER_RESPONSE_KIND_LABELS[kind]),
    );
    toggleRow.appendChild(toggleInput);
    responseSection.appendChild(toggleRow);

    if (!enabled) continue;
    const response = findCounterResponse(effect, kind);
    if (!response) continue;

    if (kind === 'damage' && response.kind === 'damage') {
      appendResourceAmountFields(responseSection, response.amount, (amount) =>
        patchEffect((prev) => ({
          ...prev,
          responses: prev.responses.map((entry) =>
            entry.kind === 'damage' ? { ...entry, amount } : entry,
          ),
        })),
      );
      responseSection.appendChild(
        createFieldRow(
          'ダメージ種別',
          createSelect(
            response.damageType ?? 'physical',
            DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
            (damageType) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'damage' ? { ...entry, damageType } : entry,
                ),
              })),
          ),
        ),
      );
    }

    if (kind === 'debuff' && response.kind === 'debuff') {
      responseSection.appendChild(
        createFieldRow(
          'デバフ stat',
          createSelect(
            Array.isArray(response.debuffStat)
              ? response.debuffStat[0] ?? 'atk'
              : response.debuffStat,
            STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
              value,
              label: STAT_LABELS[value],
            })),
            (debuffStat) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'debuff' ? { ...entry, debuffStat } : entry,
                ),
              })),
          ),
        ),
      );
      responseSection.appendChild(
        createFieldRow(
          '倍率',
          createNumberInput(
            response.debuffMultiplier ?? 1,
            (debuffMultiplier) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'debuff' ? { ...entry, debuffMultiplier } : entry,
                ),
              })),
            { step: 0.05 },
          ),
        ),
      );
      responseSection.appendChild(
        createFieldRow(
          '秒数',
          createNumberInput(
            response.debuffDurationSec,
            (debuffDurationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'debuff'
                    ? { ...entry, debuffDurationSec }
                    : entry,
                ),
              })),
            { min: 0.1, step: 0.5 },
          ),
        ),
      );
    }

    if (kind === 'dot' && response.kind === 'dot') {
      responseSection.appendChild(
        createFieldRow(
          '威力倍率',
          createNumberInput(
            response.powerMultiplier,
            (powerMultiplier) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'dot' ? { ...entry, powerMultiplier } : entry,
                ),
              })),
            { step: 0.05 },
          ),
        ),
      );
      responseSection.appendChild(
        createFieldRow(
          '秒数',
          createNumberInput(
            response.durationSec,
            (durationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'dot' ? { ...entry, durationSec } : entry,
                ),
              })),
            { min: 0.1, step: 0.5 },
          ),
        ),
      );
    }

    if (kind === 'stun' && response.kind === 'stun') {
      responseSection.appendChild(
        createFieldRow(
          '秒数',
          createNumberInput(
            response.durationSec,
            (durationSec) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'stun' ? { ...entry, durationSec } : entry,
                ),
              })),
            { min: 0.1, step: 0.5 },
          ),
        ),
      );
    }

    if (kind === 'knockback' && response.kind === 'knockback') {
      responseSection.appendChild(
        createFieldRow(
          '距離 px',
          createNumberInput(
            response.distancePx,
            (distancePx) =>
              patchEffect((prev) => ({
                ...prev,
                responses: prev.responses.map((entry) =>
                  entry.kind === 'knockback' ? { ...entry, distancePx } : entry,
                ),
              })),
            { min: 1, step: 5 },
          ),
        ),
      );
    }
  }
}

function applyPassiveEffectDefaults(passive: PassiveSkillDef): void {
  switch (passive.effect) {
    case 'targetRuleOverride':
      passive.targetRuleOverrideApplyTo ??= 'enemy';
      passive.targetRuleOverride ??= {
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      };
      break;
    case 'evasionChance':
      passive.evasionChance ??= 0.1;
      break;
    case 'block':
      passive.blockChance ??= 0.15;
      break;
    case 'damageIncrease':
    case 'specialEffect':
      passive.specialEffectApplyTo ??= 'damage';
      passive.specialEffect ??= {
        scale: 1.2,
        conditions: [{ kind: 'debuff', tags: ['def'] }],
      };
      break;
    case 'defenseIgnore':
      passive.defenseIgnore ??= { def: { mode: 'percent', amount: 0.2 } };
      break;
    case 'periodicDispel':
      passive.periodicTrigger ??= 'interval';
      passive.intervalSec ??= 5;
      passive.dispelTargetRule ??= { kind: 'self' };
      passive.dispelCount ??= 0;
      break;
    case 'heal':
      passive.healSubKind ??= 'hot';
      passive.hotTargetRule ??= { kind: 'self' };
      passive.hotAmount ??= { kind: 'atkBased', atkScale: 0.05 };
      passive.periodicTrigger ??= 'interval';
      passive.intervalSec ??= 5;
      passive.hotDurationSec ??= 0;
      break;
    case 'damageReduction':
      passive.damageReductionTargetRule ??= { kind: 'self' };
      passive.damageReductionPercent ??= 0.2;
      break;
    case 'excessHealToBarrier':
      passive.barrierScale ??= 1;
      passive.excessHealSources ??= ['outgoing'];
      break;
    case 'selfHpRatioBuff':
      passive.buffStat ??= 'atk';
      passive.buffMultiplierMax ??= 1.5;
      passive.maxBuffAtHpRatio ??= 0;
      break;
    case 'aoeCrowdBonus':
      passive.perExtraTargetScale ??= 0.1;
      passive.maxExtraTargets ??= 4;
      break;
    case 'skillAmountOverride':
      passive.targetSkillId ??= '';
      passive.amount ??= defaultResourceAmount(1);
      break;
    case 'extendSelfAppliedDebuff':
      passive.extendSec ??= 2;
      break;
    case 'healReceivedIncrease':
      passive.percent ??= 0.2;
      break;
    case 'counterChance':
    case 'counter':
      passive.counterChance ??= 0.3;
      passive.chance ??= passive.counterChance;
      passive.counterResponses ??= [defaultCounterResponse('damage')];
      passive.counterRange ??= 0;
      break;
    case 'buff':
      passive.buffSubKind ??= 'stat';
      passive.buffTargetRule ??= { kind: 'self' };
      if (passive.buffSubKind === 'damageTakenToHeal') {
        passive.ratio ??= 0.1;
      } else if (passive.buffSubKind === 'block' || passive.buffSubKind === 'evasion') {
        passive.chance ??= 0.1;
      } else if (passive.buffSubKind === 'barrier') {
        passive.barrierAmount ??= { kind: 'defBased', defScale: 0.5 };
        passive.periodicTrigger ??= 'stageStart';
      } else {
        passive.buffStat ??= 'atk';
        passive.buffMultiplier ??= 1.2;
      }
      break;
    case 'debuff':
      passive.debuffSubKind ??= 'stat';
      passive.debuffTargetRule ??= {
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      };
      passive.debuffStat ??= 'atk';
      passive.debuffMultiplier ??= 0.9;
      break;
  }
}

function passiveToCounterEffect(passive: PassiveSkillDef): CounterSkillEffect {
  return {
    type: 'counter',
    target: { kind: 'self' },
    chance: passive.chance ?? passive.counterChance,
    durationSec: 5,
    range: passive.counterRange,
    responses: passive.counterResponses ?? [defaultCounterResponse('damage')],
  };
}

function applyCounterEffectToPassive(
  passive: PassiveSkillDef,
  effect: CounterSkillEffect,
): void {
  passive.counterRange = effect.range;
  passive.counterResponses = effect.responses;
  if (effect.chance !== undefined) {
    passive.chance = effect.chance;
    passive.counterChance = effect.chance;
  }
}

type EditorActiveEffectCategory =
  (typeof EDITOR_ACTIVE_EFFECT_CATEGORIES)[number];

function categoryToEffectType(category: EditorActiveEffectCategory): SkillEffectKind {
  return category;
}

function effectTypeToCategory(type: SkillEffectDef['type']): EditorActiveEffectCategory {
  if ((EDITOR_ACTIVE_EFFECT_CATEGORIES as readonly string[]).includes(type)) {
    return type as EditorActiveEffectCategory;
  }
  if (type === 'hot') return 'heal';
  if (type === 'dot' || type === 'stun' || type === 'dispel' || type === 'block') {
    return 'debuff';
  }
  if (type === 'barrier') return 'buff';
  return 'damage';
}

function withDebuffDotDefaults(
  effect: Extract<SkillEffectDef, { type: 'debuff' }>,
): Extract<SkillEffectDef, { type: 'debuff' }> {
  return {
    ...effect,
    durationSec:
      effect.durationSec ?? effect.debuffDurationSec ?? DEFAULT_DOT_DURATION_SEC,
    amount: effect.amount ?? normalizeEffectAmount(effect),
    damageType: effect.damageType ?? 'physical',
  };
}

const DEFAULT_HOT_DURATION_SEC = 5;

function withEditorEffectDefaults(effect: SkillEffectDef): SkillEffectDef {
  const normalized = normalizeLegacyEffect(effect);
  if (normalized.type === 'heal' && (normalized.healSubKind ?? 'instant') === 'hot') {
    return applyActiveHealSubKindChange(normalized, 'hot');
  }
  if (normalized.type === 'debuff' && normalized.debuffSubKind === 'dot') {
    return withDebuffDotDefaults(normalized);
  }
  return normalized;
}

function editorEffectNeedsDefaultSync(
  before: SkillEffectDef,
  after: SkillEffectDef,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function normalizeLegacyEffect(effect: SkillEffectDef): SkillEffectDef {
  if (effect.type === 'hot') {
    return {
      ...effect,
      type: 'heal',
      healSubKind: 'hot',
      amount: effect.amount,
      durationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  if (effect.type === 'dot') {
    return withDebuffDotDefaults({
      ...effect,
      type: 'debuff',
      debuffSubKind: 'dot',
    } as Extract<SkillEffectDef, { type: 'debuff' }>);
  }
  if (effect.type === 'stun') {
    return {
      ...effect,
      type: 'debuff',
      debuffSubKind: 'stun',
      durationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  if (effect.type === 'dispel') {
    return {
      ...effect,
      type: 'heal',
      healSubKind: 'dispel',
      dispelTags: effect.dispelTags,
      dispelCount: effect.dispelCount,
      ...(effect.dispelPriority
        ? { dispelPriority: effect.dispelPriority }
        : {}),
    } as SkillEffectDef;
  }
  if (effect.type === 'barrier') {
    return {
      ...effect,
      type: 'buff',
      buffSubKind: 'barrier',
      amount: effect.amount,
      barrierStack: effect.barrierStack,
    } as SkillEffectDef;
  }
  if (effect.type === 'block') {
    return {
      ...effect,
      type: 'buff',
      buffSubKind: 'block',
      chance: effect.blockChance,
      buffDurationSec: effect.durationSec,
    } as SkillEffectDef;
  }
  return effect;
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
  healSubKind: HealSubKind,
): Extract<SkillEffectDef, { type: 'heal' }> {
  const base = {
    ...(prev.type === 'heal' ? prev : { ...prev, type: 'heal' as const }),
    type: 'heal' as const,
    healSubKind,
  };
  switch (healSubKind) {
    case 'hot':
      return {
        ...base,
        durationSec: base.durationSec ?? DEFAULT_HOT_DURATION_SEC,
        amount: base.amount ?? defaultResourceAmount(),
      };
    case 'dispel':
      return {
        ...base,
        dispelCount: base.dispelCount ?? 0,
      };
    case 'instant': {
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
  buffSubKind: import('../battle/types.ts').BuffSubKind,
): SkillEffectDef {
  if (prev.type !== 'buff') {
    return { ...prev, buffSubKind } as SkillEffectDef;
  }
  const base = { ...prev, buffSubKind };
  switch (buffSubKind) {
    case 'damageTakenToHeal':
      return {
        ...base,
        ratio: prev.ratio ?? 0.1,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case 'block':
    case 'evasion':
      return {
        ...base,
        chance: prev.chance ?? 0.2,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case 'stat':
      return {
        ...base,
        buffStat: prev.buffStat ?? 'atk',
        buffMultiplier: prev.buffMultiplier ?? 1.2,
        buffDurationSec: prev.buffDurationSec ?? 5,
      };
    case 'barrier':
      return {
        ...base,
        amount: prev.amount ?? defaultResourceAmount(),
      };
    default:
      return base;
  }
}

function patchEffectState(
  initial: SkillEffectDef,
  onUpdate: (effect: SkillEffectDef, options?: { rerender?: boolean }) => void,
): {
  patch: (patch: EffectPatch, options?: { rerender?: boolean }) => void;
  get: () => SkillEffectDef;
} {
  let current = initial;
  return {
    get: () => current,
    patch: (patch, options) => {
      current = typeof patch === 'function' ? patch(current) : patch;
      onUpdate(current, options);
    },
  };
}

function patchPercentMaxHpRef(
  prev: ResourceAmountSpec,
  maxHpRef: MaxHpReference,
): ResourceAmountSpec {
  if (maxHpRef === 'target') {
    const { maxHpRef: _, ...rest } = prev;
    return rest;
  }
  return { ...prev, maxHpRef };
}

function appendResourceAmountFields(
  grid: HTMLElement,
  amount: ResourceAmountSpec,
  onUpdate: (amount: ResourceAmountSpec, options?: { rerender?: boolean }) => void,
): void {
  let current = amount;
  const patchAmount = (
    patch: (prev: ResourceAmountSpec) => ResourceAmountSpec,
    options?: { rerender?: boolean },
  ) => {
    current = patch(current);
    onUpdate(current, options);
  };

  grid.appendChild(
    createFieldRow(
      '効果量種別',
      createSelect(
        amount.kind,
        RESOURCE_AMOUNT_KIND_OPTIONS.map((value) => ({
          value,
          label: RESOURCE_AMOUNT_KIND_LABELS[value],
        })),
        (kind) => {
          if (kind === 'atkBased') {
            patchAmount(
              () => defaultResourceAmount(current.atkScale ?? 1),
              { rerender: true },
            );
          } else if (kind === 'defBased') {
            patchAmount(
              () => defaultDefResourceAmount(current.defScale ?? 1),
              { rerender: true },
            );
          } else if (kind === 'flat') {
            patchAmount(
              () => ({ kind, flatAmount: current.flatAmount ?? 0 }),
              { rerender: true },
            );
          } else {
            patchAmount(
              () => ({
                kind,
                percentOfMaxHp: current.percentOfMaxHp ?? 0.1,
                ...(current.maxHpRef === 'self' ? { maxHpRef: 'self' as const } : {}),
              }),
              { rerender: true },
            );
          }
        },
      ),
    ),
  );

  if (amount.kind === 'atkBased') {
    grid.appendChild(
      createFieldRow(
        'ATK 加減',
        createNumberInput(
          amount.atkOffset ?? 0,
          (atkOffset) => patchAmount((prev) => ({ ...prev, atkOffset })),
          { step: 1 },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'ATK 倍率',
        createNumberInput(
          amount.atkScale ?? 1,
          (atkScale) => patchAmount((prev) => ({ ...prev, atkScale })),
          { step: 0.01 },
        ),
      ),
    );
    return;
  }

  if (amount.kind === 'defBased') {
    grid.appendChild(
      createFieldRow(
        'DEF 加減',
        createNumberInput(
          amount.defOffset ?? 0,
          (defOffset) => patchAmount((prev) => ({ ...prev, defOffset })),
          { step: 1 },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'DEF 倍率',
        createNumberInput(
          amount.defScale ?? 1,
          (defScale) => patchAmount((prev) => ({ ...prev, defScale })),
          { step: 0.01 },
        ),
      ),
    );
    return;
  }

  if (amount.kind === 'flat') {
    grid.appendChild(
      createFieldRow(
        '固定値',
        createNumberInput(
          amount.flatAmount ?? 0,
          (flatAmount) => patchAmount((prev) => ({ ...prev, flatAmount })),
          { step: 1 },
        ),
      ),
    );
    return;
  }

  const maxHpRef = amount.maxHpRef ?? 'target';
  grid.appendChild(
    createFieldRow(
      '参照',
      createRadioGroup(
        maxHpRef,
        MAX_HP_REFERENCES.map((value) => ({
          value,
          label: MAX_HP_REF_LABELS[value],
        })),
        (next) => patchAmount((prev) => patchPercentMaxHpRef(prev, next)),
        `maxHpRef-${crypto.randomUUID()}`,
      ),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'maxHp 割合 (%)',
      createNumberInput(
        (amount.percentOfMaxHp ?? 0) * 100,
        (percent) =>
          patchAmount((prev) => ({
            ...prev,
            percentOfMaxHp: percent / 100,
          })),
        { step: 1, min: 0 },
      ),
    ),
  );
}

function appendEffectSequenceTimingFields(
  parent: HTMLElement,
  effect: SkillEffectDef,
  patchEffect: (patch: EffectPatch, options?: { rerender?: boolean }) => void,
  isLastEffect: boolean,
): void {
  if (isLastEffect) return;

  const section = createSection('シーケンス（タイミング）');
  parent.appendChild(section);
  section.appendChild(
    createEl(
      'p',
      'editor-hint',
      'move を含むスキル: この effect 適用後、次の effect まで待機する秒数です。',
    ),
  );
  const grid = appendGrid(section);
  grid.appendChild(
    createFieldRow(
      '次の効果まで待機（秒）',
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
        { min: 0, step: 0.05 },
      ),
    ),
  );
}

function appendEffectPresentationFields(
  parent: HTMLElement,
  effect: SkillEffectDef,
  patchEffect: (patch: EffectPatch, options?: { rerender?: boolean }) => void,
): void {
  const section = createSection('演出（この effect）');
  parent.appendChild(section);
  const grid = appendGrid(section);

  grid.appendChild(
    createFieldRow(
      'スプライトアニメ',
      createSelect(
        effect.anim ?? '',
        [
          { value: '', label: '— 種別の既定 —' },
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
        },
      ),
    ),
  );

  const preset = effect.vfx?.preset ?? '';
  grid.appendChild(
    createFieldRow(
      'VFX プリセット',
      createSelect(
        (preset || '') as SkillVfxPresetId | '',
        [
          { value: '', label: '— スキル既定 / なし —' },
          { value: 'slash' as SkillVfxPresetId, label: 'slash' },
          ...VFX_PRESET_OPTIONS.filter((v) => v !== 'slash').map((value) => ({
            value,
            label: value,
          })),
        ],
        (value) => {
          patchEffect((prev) => {
            const next = { ...prev } as SkillEffectDef;
            if (value.length === 0) {
              delete next.vfx;
            } else {
              next.vfx = { ...next.vfx, preset: value as SkillVfxPresetId };
            }
            return next;
          });
        },
      ),
    ),
  );

  if (effect.vfx) {
    grid.appendChild(
      createFieldRow(
        'VFX durationMs',
        createNumberInput(
          effect.vfx.durationMs ?? 0,
          (durationMs) => {
            patchEffect((prev) => ({
              ...prev,
              vfx: {
                ...prev.vfx!,
                durationMs: durationMs || undefined,
              },
            }));
          },
          { min: 0, step: 50 },
        ),
      ),
    );
    const arcRow = createEl('div', 'editor-field editor-field-checkbox');
    const arcInput = createEl('input') as HTMLInputElement;
    arcInput.type = 'checkbox';
    arcInput.checked = Boolean(effect.vfx.arc);
    arcInput.addEventListener('change', () => {
      patchEffect((prev) => ({
        ...prev,
        vfx: {
          ...prev.vfx!,
          arc: arcInput.checked || undefined,
        },
      }));
    });
    arcRow.appendChild(createEl('label', undefined, 'VFX arc（放物線）'));
    arcRow.appendChild(arcInput);
    grid.appendChild(arcRow);
    section.appendChild(
      createButton('effect VFX を削除', 'editor-btn editor-btn-small', () => {
        patchEffect((prev) => {
          const next = { ...prev } as SkillEffectDef;
          delete next.vfx;
          return next;
        }, { rerender: true });
      }),
    );
  }
}

function defaultBasicAttackEffect(type: SkillEffectKind): SkillEffectDef {
  return stripBasicAttackTraitFieldsFromEffect(defaultEffect(type));
}

function defaultEffect(type: SkillEffectKind): SkillEffectDef {
  const target = defaultTargetForEffectType(type);
  switch (type) {
    case 'damage':
      return {
        target,
        type: 'damage',
        damageType: 'physical',
        amount: defaultResourceAmount(),
      };
    case 'heal':
      return {
        target,
        type: 'heal',
        healSubKind: 'instant',
        amount: defaultResourceAmount(),
      };
    case 'buff':
      return {
        target,
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
      };
    case 'debuff':
      return {
        target,
        type: 'debuff',
        debuffSubKind: 'stat',
        debuffStat: 'def',
        debuffMultiplier: 0.8,
        debuffDurationSec: 5,
      };
    case 'dot':
      return {
        target,
        type: 'debuff',
        debuffSubKind: 'dot',
        durationSec: DEFAULT_DOT_DURATION_SEC,
        amount: defaultResourceAmount(0.2),
        damageType: 'physical',
      };
    case 'barrier':
      return { target, type: 'barrier', amount: defaultResourceAmount() };
    case 'move':
      return {
        target,
        type: 'move',
        moveMode: 'engage',
        moveDurationSec: 0.25,
      };
    case 'stun':
      return { target, type: 'stun', durationSec: 1 };
    case 'knockback':
      return { target, type: 'knockback', distancePx: 30 };
    case 'dispel':
      return { target, type: 'dispel', dispelCount: 0 };
    case 'block':
      return {
        target,
        type: 'block',
        blockChance: 0.2,
        durationSec: 5,
      };
    case 'counter':
      return {
        target: { kind: 'self' },
        type: 'counter',
        chance: 0.3,
        responses: [defaultCounterResponse('damage')],
        durationSec: 5,
        range: 0,
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
}

export function renderEntityPicker(
  container: HTMLElement,
  entityPicker: SkillEditorEntityPicker,
): void {
  const picker = createEl('div', 'editor-picker');
  const select = createEl('select', 'editor-select') as HTMLSelectElement;
  const emptyOpt = createEl('option') as HTMLOptionElement;
  emptyOpt.value = '';
  emptyOpt.textContent = '— 選択 —';
  select.appendChild(emptyOpt);
  for (const item of entityPicker.items) {
    const opt = createEl('option') as HTMLOptionElement;
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
  select.addEventListener('change', () => {
    if (select.value) entityPicker.onSelect(select.value);
  });
  picker.appendChild(createEl('span', 'editor-picker-label', entityPicker.label));
  picker.appendChild(select);
  container.appendChild(picker);
}

export function renderClassIdentity(
  container: HTMLElement,
  classIdentity: SkillEditorClassIdentity,
): void {
  const summaryText = [classIdentity.classId, classIdentity.displayName]
    .filter((part) => part.trim().length > 0)
    .join(' / ');

  const renderFields = (parent: HTMLElement) => {
    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        'classId',
        createTextInput(classIdentity.classId, (classId) => {
          classIdentity.onClassIdChange(classId);
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '表示名',
        createTextInput(classIdentity.displayName, (displayName) => {
          classIdentity.onDisplayNameChange(displayName);
        }),
      ),
    );
    parent.appendChild(
      createEl(
        'p',
        'editor-hint',
        'classId 確定後、通常攻撃（{classId}_basic_attack）を自動追加します。',
      ),
    );
  };

  if (classIdentity.sectionExpandedState) {
    const { details, body } = createCollapsibleSection({
      id: 'class-identity',
      title: 'クラス ID',
      summaryExtra: summaryText || '—',
      expandedState: classIdentity.sectionExpandedState,
    });
    renderFields(body);
    container.appendChild(details);
    return;
  }

  const identity = createSection('クラス ID');
  container.appendChild(identity);
  renderFields(identity);
}

function skillCardTitle(entry: SkillDraftEntry, idReadonly: boolean): string {
  if (idReadonly) {
    return '通常攻撃';
  }
  const skill = entry.passive ?? entry.active;
  if (skill?.name?.trim()) return skill.name.trim();
  if (skill?.id?.trim()) return skill.id.trim();
  return entry.ref.kind === 'passive' ? 'パッシブ' : 'アクティブ';
}

type SkillEntryKind = 'passive' | 'active' | 'basic';

function skillEntryKind(
  entry: SkillDraftEntry,
  idReadonly: boolean,
): SkillEntryKind {
  if (idReadonly) return 'basic';
  return entry.ref.kind === 'passive' ? 'passive' : 'active';
}

function skillExpansionKey(entry: SkillDraftEntry, index: number): string {
  const id = entry.ref.skillId?.trim();
  return id || `index:${index}`;
}

const SKILL_KIND_LABELS: Record<SkillEntryKind, string> = {
  passive: 'パッシブ',
  active: 'アクティブ',
  basic: '通常攻撃',
};

export class SkillEditorStep {
  private container: HTMLElement;
  private skillExpandedState = new Map<string, boolean>();

  constructor(
    container: HTMLElement,
    private options: SkillEditorStepOptions,
  ) {
    this.container = container;
    this.render();
  }

  update(options: SkillEditorStepOptions): void {
    this.options = options;
    this.render();
  }

  expandSkill(skillId: string): void {
    this.skillExpandedState.set(skillId, true);
  }

  private commitEntries(
    mutate: (entries: SkillDraftEntry[]) => void,
    options?: { rerender?: boolean },
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
    options?: { rerender?: boolean },
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
    options?: { rerender?: boolean },
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
    saving?: boolean,
  ): void {
    const { entityPicker, classIdentity, onAddSkill, hideSave, hideEntityHeader } =
      this.options;

    if (!hideEntityHeader) {
      if (entityPicker) {
        renderEntityPicker(this.container, entityPicker);
      }
      if (classIdentity) {
        renderClassIdentity(this.container, classIdentity);
      }
    }

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', 'スキル定義'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        classIdentity
          ? 'パッシブ / アクティブを追加し、各スキルの習得 Lv（0 = 初期）を設定します。'
          : '参照されているスキル ID ごとに定義を編集します。',
      ),
    );
    this.container.appendChild(header);

    const passiveIndices: number[] = [];
    const basicAttackIndices: number[] = [];
    const otherActiveIndices: number[] = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (entry.ref.kind === 'passive') {
        passiveIndices.push(index);
      } else if (this.isBasicAttackEntry(entry)) {
        basicAttackIndices.push(index);
      } else {
        otherActiveIndices.push(index);
      }
    }

    this.renderSkillKindSection(
      'パッシブ',
      'passive',
      entries,
      passiveIndices,
      classIdentity
        ? 'パッシブスキルがありません。下のボタンから追加できます。'
        : '参照されているパッシブスキルがありません。',
      onAddSkill,
    );
    this.renderBasicAttackSection(entries, basicAttackIndices);
    this.renderSkillKindSection(
      'アクティブ',
      'active',
      entries,
      otherActiveIndices,
      classIdentity
        ? basicAttackIndices.length > 0
          ? '通常攻撃以外のアクティブスキルがありません。下のボタンから追加できます。'
          : 'アクティブスキルがありません。classId 入力で通常攻撃が追加されます。'
        : '参照されているアクティブスキルがありません。',
      onAddSkill,
    );

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

  private isBasicAttackEntry(entry: SkillDraftEntry): boolean {
    return this.options.isIdReadonly?.(entry) ?? false;
  }

  private renderBasicAttackSection(
    entries: SkillDraftEntry[],
    indices: number[],
  ): void {
    if (indices.length === 0) return;

    const section = createSection('通常攻撃');
    section.classList.add('editor-skill-section');

    const list = createEl('div', 'editor-skill-list');
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
    onAddSkill?: (kind: SkillSlotKind) => void,
  ): void {
    const section = createSection(title);
    section.classList.add('editor-skill-section');

    const list = createEl('div', 'editor-skill-list');
    if (indices.length === 0) {
      list.appendChild(createEl('p', 'editor-hint', emptyHint));
    } else {
      for (const index of indices) {
        this.renderCollapsibleSkillEntry(list, entries[index]!, index);
      }
    }
    section.appendChild(list);

    if (onAddSkill) {
      const addRow = createEl('div', 'editor-section-actions');
      addRow.appendChild(
        createButton(`+ ${title}`, 'editor-btn editor-btn-small', () => {
          onAddSkill(kind);
        }),
      );
      section.appendChild(addRow);
    }

    this.container.appendChild(section);
  }

  private renderCollapsibleSkillEntry(
    parent: HTMLElement,
    entry: SkillDraftEntry,
    index: number,
  ): void {
    const idReadonly = this.options.isIdReadonly?.(entry) ?? false;
    const kind = skillEntryKind(entry, idReadonly);
    const title = skillCardTitle(entry, idReadonly);
    const skill = entry.passive ?? entry.active;

    const summaryExtra = createEl('span');
    summaryExtra.appendChild(
      createEl('span', 'editor-skill-summary-badge', SKILL_KIND_LABELS[kind]),
    );

    const metaParts: string[] = [];
    if (skill?.id?.trim()) metaParts.push(skill.id.trim());
    if (!idReadonly) {
      const unlockLevel = entry.unlockLevel ?? 0;
      metaParts.push(unlockLevel === 0 ? '初期習得' : `Lv${unlockLevel}習得`);
    }
    if (metaParts.length > 0) {
      summaryExtra.appendChild(
        createEl('span', 'editor-collapsible-summary-meta', metaParts.join(' · ')),
      );
    }

    const description = entry.passive
      ? formatPassiveDescription(entry.passive)
      : entry.active
        ? formatActiveDescription(entry.active)
        : entry.ref.skillId;
    summaryExtra.appendChild(
      createEl('span', 'editor-collapsible-summary-desc', description),
    );

    let summaryActions: HTMLElement | undefined;
    if (!idReadonly && this.options.onRemoveSkill) {
      summaryActions = createButton('削除', 'editor-btn editor-btn-small', () => {
        this.options.onRemoveSkill?.(index);
      });
    }

    const { details, body } = createCollapsibleSection({
      id: skillExpansionKey(entry, index),
      title,
      summaryExtra,
      summaryActions,
      expandedState: this.skillExpandedState,
      className: 'editor-skill-details',
      dataAttrs: { kind },
    });
    body.classList.add('editor-skill-body', 'editor-skill-card');
    this.renderEntryCardBody(body, entry, index, idReadonly);
    parent.appendChild(details);
  }

  private renderEntryCardBody(
    card: HTMLElement,
    entry: SkillDraftEntry,
    index: number,
    idReadonly: boolean,
  ): void {
    if (!idReadonly) {
      const unlockGrid = appendGrid(card);
      unlockGrid.appendChild(
        createFieldRow(
          '習得 Lv',
          createNumberInput(
            entry.unlockLevel ?? 0,
            (unlockLevel) => {
              this.commitEntries((next) => {
                const current = next[index];
                if (!current) return;
                current.unlockLevel = unlockLevel;
              }, { rerender: false });
            },
            {},
          ),
        ),
      );
      card.appendChild(
        createEl('p', 'editor-hint', '0 = 初期習得（Lv0）。1 以上 = その Lv で習得'),
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
    applyId: (entry: SkillDraftEntry, id: string) => void,
  ): HTMLInputElement {
    const input = createTextInput(
      currentId,
      (id) => {
        if (idReadonly) return;
        this.commitEntries((next) => {
          const entry = next[index];
          if (!entry) return;
          applyId(entry, id);
        }, { rerender: false });
      },
      { readonly: idReadonly },
    );

    if (!idReadonly) {
      let idOnFocus = currentId;
      input.addEventListener('focus', () => {
        const entry = this.options.getEntries()[index];
        idOnFocus =
          kind === 'passive' ? entry?.passive?.id ?? '' : entry?.active?.id ?? '';
      });
      input.addEventListener('blur', () => {
        const trimmed = input.value.trim();
        if (!trimmed) return;
        const oldId = idOnFocus;
        this.commitEntries((next) => {
          const entry = next[index];
          if (!entry) return;
          applyId(entry, trimmed);
        }, { rerender: false });
        input.value = trimmed;
        if (trimmed !== oldId) {
          this.options.onSkillIdChange?.(oldId, trimmed, kind);
        }
      });
    }

    return input;
  }

  private renderPassive(parent: HTMLElement, index: number, idReadonly: boolean): void {
    const passive = this.options.getEntries()[index]?.passive;
    if (!passive) return;

    const normalizedPassive = normalizePassiveSkillForEditor(passive);
    if (normalizedPassive.effect !== passive.effect) {
      this.patchPassive(
        index,
        (current) => {
          Object.assign(current, normalizedPassive);
        },
        { rerender: true },
      );
      return;
    }

    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        'ID',
        this.createSkillIdInput(
          index,
          'passive',
          passive.id,
          idReadonly,
          (entry, id) => {
            if (!entry.passive) return;
            entry.passive.id = id;
            entry.ref.skillId = id;
          },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '名前',
        createTextInput(passive.name, (name) => {
          this.patchPassive(index, (current) => {
            current.name = name;
          }, { rerender: false });
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'iconKey',
        createTextInput(passive.iconKey ?? '', (iconKey) => {
          this.patchPassive(index, (current) => {
            current.iconKey = iconKey.trim() || undefined;
          }, { rerender: false });
        }),
      ),
    );
    grid.appendChild(
      createFieldRow(
        '効果種別',
        createSelect(
          passive.effect,
          EDITOR_PASSIVE_EFFECT_KIND_OPTIONS.map((value) => ({
            value,
            label: PASSIVE_EFFECT_KIND_LABELS[value],
          })),
          (effect) => {
            this.patchPassive(index, (current) => {
              current.effect = effect;
              applyPassiveEffectDefaults(current);
            }, { rerender: true });
          },
        ),
      ),
    );

    const effectGrid = appendGrid(parent);
    effectGrid.classList.add('editor-subgrid');

    switch (passive.effect) {
      case 'targetRuleOverride':
        effectGrid.appendChild(
          createFieldRow(
            '適用スコープ',
            createSelect(
              passive.targetRuleOverrideApplyTo ?? 'enemy',
              TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS.map((value) => ({
                value,
                label: TARGET_RULE_OVERRIDE_APPLY_TO_LABELS[value],
              })),
              (targetRuleOverrideApplyTo) => {
                this.patchPassive(index, (current) => {
                  current.targetRuleOverrideApplyTo = targetRuleOverrideApplyTo;
                }, { rerender: true });
              },
            ),
          ),
        );
        appendTargetSpecFields(
          effectGrid,
          passive.targetRuleOverride ?? {
            kind: 'distance',
            side: 'enemy',
            order: 'nearest',
          },
          (targetRuleOverride) => {
            this.patchPassive(index, (current) => {
              current.targetRuleOverride = targetRuleOverride;
            }, { rerender: true });
          },
        );
        break;
      case 'evasionChance':
      case 'block':
        effectGrid.appendChild(
          createEl(
            'p',
            'editor-hint',
            '旧パッシブ種別です。新規作成は「バフ（evasion/block）」を使用してください。',
          ),
        );
        break;
      case 'damageIncrease':
        appendPassiveDamageIncreaseFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'defenseIgnore':
        appendPassiveDefenseIgnoreFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'periodicDispel':
        appendPassiveDispelFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'healReceivedIncrease':
        effectGrid.appendChild(
          createEl(
            'p',
            'editor-hint',
            '旧パッシブ種別です。新規作成は「特効効果（applyTo=heal）」を使用してください。',
          ),
        );
        break;
      case 'heal':
        appendPassiveHealFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          (grid, amount, onUpdate) => {
            appendResourceAmountFields(grid, amount, onUpdate);
          },
        );
        break;
      case 'damageReduction':
        appendPassiveDamageReductionFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'excessHealToBarrier':
        effectGrid.appendChild(
          createFieldRow(
            'barrierScale',
            createNumberInput(
              passive.barrierScale ?? 1,
              (barrierScale) => {
                this.patchPassive(index, (current) => {
                  current.barrierScale = barrierScale;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        for (const source of ['outgoing', 'incoming'] as const) {
          const label = source === 'outgoing' ? '与回復' : '被回復';
          const sources = passive.excessHealSources ?? ['outgoing'];
          const row = createEl('div', 'editor-field editor-field-checkbox');
          const input = createEl('input') as HTMLInputElement;
          input.type = 'checkbox';
          input.checked = sources.includes(source);
          input.addEventListener('change', () => {
            this.patchPassive(index, (current) => {
              const currentSources = new Set(
                current.excessHealSources ?? ['outgoing'],
              );
              if (input.checked) {
                currentSources.add(source);
              } else {
                currentSources.delete(source);
              }
              const next = [...currentSources] as Array<'outgoing' | 'incoming'>;
              current.excessHealSources =
                next.length > 0 ? next : ['outgoing'];
            }, { rerender: false });
          });
          row.appendChild(createEl('label', undefined, label));
          row.appendChild(input);
          effectGrid.appendChild(row);
        }
        break;
      case 'selfHpRatioBuff':
        effectGrid.appendChild(
          createFieldRow(
            '対象ステ',
            createSelect(
              Array.isArray(passive.buffStat)
                ? passive.buffStat[0] ?? 'atk'
                : passive.buffStat ?? 'atk',
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (buffStat) => {
                this.patchPassive(index, (current) => {
                  current.buffStat = buffStat;
                }, { rerender: false });
              },
            ),
          ),
        );
        effectGrid.appendChild(
          createFieldRow(
            '最大倍率',
            createNumberInput(
              passive.buffMultiplierMax ?? 1,
              (buffMultiplierMax) => {
                this.patchPassive(index, (current) => {
                  current.buffMultiplierMax =
                    buffMultiplierMax > 1 ? buffMultiplierMax : undefined;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        effectGrid.appendChild(
          createFieldRow(
            '最大固定値',
            createNumberInput(
              passive.buffFlatBonusMax ?? 0,
              (buffFlatBonusMax) => {
                this.patchPassive(index, (current) => {
                  current.buffFlatBonusMax =
                    buffFlatBonusMax > 0 ? buffFlatBonusMax : undefined;
                }, { rerender: false });
              },
              { step: 1 },
            ),
          ),
        );
        effectGrid.appendChild(
          createFieldRow(
            '最大になるHP割合 (0–1)',
            createNumberInput(
              passive.maxBuffAtHpRatio ?? 0,
              (maxBuffAtHpRatio) => {
                this.patchPassive(index, (current) => {
                  current.maxBuffAtHpRatio = maxBuffAtHpRatio;
                }, { rerender: false });
              },
              { min: 0, max: 0.99, step: 0.01 },
            ),
          ),
        );
        break;
      case 'extendSelfAppliedDebuff':
        effectGrid.appendChild(
          createEl(
            'p',
            'editor-hint',
            '旧パッシブ種別です。新規作成は非推奨（互換表示のみ）。',
          ),
        );
        break;
      case 'aoeCrowdBonus':
        effectGrid.appendChild(
          createFieldRow(
            'perExtraTargetScale',
            createNumberInput(
              passive.perExtraTargetScale ?? 0.1,
              (perExtraTargetScale) => {
                this.patchPassive(index, (current) => {
                  current.perExtraTargetScale = perExtraTargetScale;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        effectGrid.appendChild(
          createFieldRow(
            'maxExtraTargets',
            createNumberInput(
              passive.maxExtraTargets ?? 4,
              (maxExtraTargets) => {
                this.patchPassive(index, (current) => {
                  current.maxExtraTargets = maxExtraTargets;
                }, { rerender: false });
              },
              { step: 1 },
            ),
          ),
        );
        break;
      case 'counter':
      case 'counterChance':
        effectGrid.appendChild(
          createFieldRow(
            '発動確率 (0–1)',
            createNumberInput(
              passive.chance ?? passive.counterChance ?? 0,
              (chance) => {
                this.patchPassive(index, (current) => {
                  current.chance = chance;
                  current.counterChance = chance;
                }, { rerender: false });
              },
              { min: 0, max: 1, step: 0.01 },
            ),
          ),
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
                  patch(passiveToCounterEffect(current)),
                );
              },
              options,
            );
          },
          { showDuration: false },
        );
        break;
      case 'specialEffect':
        appendPassiveSpecialEffectFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'buff':
        appendPassiveBuffFields(
          effectGrid,
          passive,
          (mutate, options) => {
            this.patchPassive(index, mutate, options);
          },
          (grid, amount, onUpdate) => {
            appendResourceAmountFields(grid, amount, onUpdate);
          },
        );
        break;
      case 'debuff':
        appendPassiveDebuffFields(effectGrid, passive, (mutate, options) => {
          this.patchPassive(index, mutate, options);
        });
        break;
      case 'skillAmountOverride': {
        const entries = this.options.getEntries();
        const targetSkillId = passive.targetSkillId ?? '';
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
              entry.active?.id === targetSkillId,
          );
          const staleSkill = staleEntry?.passive ?? staleEntry?.active;
          if (staleSkill) {
            const kind = staleEntry?.passive ? 'パッシブ' : 'アクティブ';
            skillOptions.unshift({
              value: targetSkillId,
              label: `[上書き不可] [${kind}] ${staleSkill.name} (${targetSkillId})`,
            });
          }
        }
        const targetEntry = entries.find(
          (entry) =>
            entry.passive?.id === targetSkillId ||
            entry.active?.id === targetSkillId,
        );
        effectGrid.appendChild(
          createFieldRow(
            '対象スキル',
            createSelect(
              targetSkillId,
              skillOptions,
              (nextTargetSkillId) => {
                this.patchPassive(index, (current) => {
                  current.targetSkillId = nextTargetSkillId;
                  delete current.effectIndex;
                  delete current.passiveAmountField;
                }, { rerender: true });
              },
            ),
          ),
        );
        if (targetEntry?.active) {
          const amountEffects = targetEntry.active.effect
            .map((effect, effectIndex) => ({ effect, effectIndex }))
            .filter(({ effect }) => activeEffectHasAmount(effect));
          if (amountEffects.length > 1) {
            const effectIndex = passive.effectIndex;
            effectGrid.appendChild(
              createFieldRow(
                '対象 effect',
                createSelect(
                  effectIndex === undefined ? -1 : effectIndex,
                  [
                    { value: -1, label: 'すべて' },
                    ...amountEffects.map(({ effect, effectIndex: idx }) => ({
                      value: idx,
                      label: `効果 ${idx + 1} (${effect.type})`,
                    })),
                  ],
                  (selected) => {
                    this.patchPassive(index, (current) => {
                      if (selected < 0) {
                        delete current.effectIndex;
                      } else {
                        current.effectIndex = selected;
                      }
                    }, { rerender: true });
                  },
                ),
              ),
            );
          }
        } else if (targetEntry?.passive) {
          const inferred = inferPassiveAmountField(targetEntry.passive);
          if (inferred) {
            effectGrid.appendChild(
              createEl(
                'p',
                'editor-hint',
                `対象フィールド: ${inferred}`,
              ),
            );
          }
        }
        const originalAmount = resolveSkillAmountOverrideOriginal(
          entries,
          targetSkillId,
          passive.effectIndex,
          passive.passiveAmountField,
        );
        effectGrid.appendChild(
          createFieldRow(
            '元の効果量（読み取り専用）',
            createEl('span', 'editor-readonly-value', formatAmountPreview(originalAmount)),
          ),
        );
        appendResourceAmountFields(
          effectGrid,
          passive.amount ?? defaultResourceAmount(1),
          (amount, options) => {
            this.patchPassive(index, (current) => {
              current.amount = amount;
            }, options);
          },
        );
        break;
      }
    }

    parent.appendChild(
      createEl(
        'p',
        'editor-skill-desc-preview',
        `説明: ${formatPassiveDescription(passive)}`,
      ),
    );
  }

  private renderActive(parent: HTMLElement, index: number, idReadonly: boolean): void {
    const active = this.options.getEntries()[index]?.active;
    if (!active) return;

    const setActive = (
      mutate: (current: ActiveSkillDef) => void,
      options?: { rerender?: boolean },
    ) => {
      this.patchActive(index, mutate, options);
    };

    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        'ID',
        this.createSkillIdInput(
          index,
          'active',
          active.id,
          idReadonly,
          (entry, id) => {
            if (!entry.active) return;
            entry.active.id = id;
            entry.ref.skillId = id;
          },
        ),
      ),
    );
    if (!idReadonly) {
      grid.appendChild(
        createFieldRow(
          '名前',
          createTextInput(active.name, (name) => {
            setActive((current) => {
              current.name = name;
            }, { rerender: false });
          }),
        ),
      );
    }

    grid.appendChild(
      createFieldRow(
        'iconKey',
        createTextInput(
          active.iconKey ?? '',
          (iconKey) => {
            setActive((current) => {
              current.iconKey = iconKey.trim() || undefined;
            }, { rerender: false });
          },
          { readonly: idReadonly },
        ),
      ),
    );

    const basicAttackSpeedTier = this.options.basicAttackSpeedTier;
    if (idReadonly && basicAttackSpeedTier) {
      grid.appendChild(
        createFieldRow(
          '攻撃速度（SPD）',
          createSelect(
            basicAttackSpeedTier.get(),
            ATTACK_SPEED_TIER_OPTIONS.map((value) => ({
              value,
              label: ATTACK_SPEED_TIER_LABELS[value],
            })),
            (attackSpeedTier) => {
              basicAttackSpeedTier.onChange(attackSpeedTier);
            },
          ),
        ),
      );
      grid.appendChild(
        createEl(
          'p',
          'editor-hint',
          '通常攻撃の間隔は SPD 段階とスキル interval から決まります。',
        ),
      );
    } else if (idReadonly) {
      const trigger = resolveSkillTrigger(active);
      grid.appendChild(
        createFieldRow(
          '発動間隔 (秒)',
          createNumberInput(
            trigger.value,
            (value) => {
              setActive((current) => {
                current.interval = value;
                current.trigger = { kind: 'time', value };
              }, { rerender: false });
            },
            { min: 0.1, step: 0.1, readonly: true },
          ),
        ),
      );
      grid.appendChild(
        createEl(
          'p',
          'editor-hint',
          '通常攻撃の間隔はクラス設定の「攻撃速度（SPD 段階）」から決まります。射程・ダメージ種・VFX はクラス／敵の traits で編集します。',
        ),
      );
    } else {
      const trigger = resolveSkillTrigger(active);
      grid.appendChild(
        createFieldRow(
          '発動条件',
          createSelect(
            trigger.kind,
            SKILL_TRIGGER_KIND_OPTIONS.map((value) => ({
              value,
              label: SKILL_TRIGGER_KIND_LABELS[value],
            })),
            (kind) => {
              const nextKind = kind as SkillTriggerKind;
              const nextValue =
                nextKind === 'time'
                  ? trigger.kind === 'time'
                    ? trigger.value
                    : 5
                  : trigger.kind === nextKind
                    ? trigger.value
                    : 3;
              setActive((current) => {
                current.trigger = { kind: nextKind, value: nextValue };
                delete current.interval;
              }, { rerender: true });
            },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          SKILL_TRIGGER_VALUE_LABELS[trigger.kind],
          createNumberInput(
            trigger.value,
            (value) => {
              setActive((current) => {
                const kind = resolveSkillTrigger(current).kind;
                current.trigger = { kind, value };
                delete current.interval;
              }, { rerender: false });
            },
            {},
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '停止時間（秒）',
          createNumberInput(
            active.useDurationSec ?? 0,
            (value) => {
              setActive((current) => {
                if (value <= 0) {
                  delete current.useDurationSec;
                } else {
                  current.useDurationSec = value;
                }
              }, { rerender: false });
            },
            { min: 0, step: 0.05 },
          ),
        ),
      );
      grid.appendChild(
        createEl(
          'p',
          'editor-hint',
          '0 = 即時。停止中は全スキル発動不可（効果は即時適用）。時間・被攻撃条件のアクティブ CD は停止。参考: attack/dash 0.33s、heal 0.30s',
        ),
      );
    }

    parent.appendChild(
      createEl(
        'p',
        'editor-skill-desc-preview',
        `説明: ${formatActiveDescription(active)}`,
      ),
    );

    const effectsSection = createSection('効果');
    parent.appendChild(effectsSection);
    const showPerEffectPresentation = skillHasMoveEffect(active);

    active.effect.forEach((effect, effectIndex) => {
      const block = createEl('div', 'editor-effect-block');
      const effectHeader = createEl('div', 'editor-effect-header');
      effectHeader.appendChild(
        createEl('span', 'editor-effect-label', `効果 ${effectIndex + 1}`),
      );
      if (effectIndex > 0) {
        effectHeader.appendChild(
          createButton('↑', 'editor-btn editor-btn-small', () => {
            setActive((current) => {
              const next = [...current.effect];
              const tmp = next[effectIndex - 1];
              next[effectIndex - 1] = next[effectIndex]!;
              next[effectIndex] = tmp!;
              current.effect = next;
            }, { rerender: true });
          }),
        );
      }
      if (effectIndex < active.effect.length - 1) {
        effectHeader.appendChild(
          createButton('↓', 'editor-btn editor-btn-small', () => {
            setActive((current) => {
              const next = [...current.effect];
              const tmp = next[effectIndex + 1];
              next[effectIndex + 1] = next[effectIndex]!;
              next[effectIndex] = tmp!;
              current.effect = next;
            }, { rerender: true });
          }),
        );
      }
      if (active.effect.length > 1) {
        effectHeader.appendChild(
          createButton('削除', 'editor-btn editor-btn-small', () => {
            setActive((current) => {
              current.effect = current.effect.filter((_, i) => i !== effectIndex);
            }, { rerender: true });
          }),
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
        showPerEffectPresentation
          ? {
              effectIndex,
              effectCount: active.effect.length,
            }
          : undefined,
      );
      effectsSection.appendChild(block);
    });

    effectsSection.appendChild(
      createButton('+ 効果を追加', 'editor-btn editor-btn-small', () => {
        setActive((current) => {
          current.effect.push(
            idReadonly ? defaultBasicAttackEffect('damage') : defaultEffect('damage'),
          );
        }, { rerender: true });
      }),
    );

    if (idReadonly) {
      return;
    }

    const vfxSection = createSection('VFX（任意）');
    parent.appendChild(vfxSection);
    if (showPerEffectPresentation) {
      vfxSection.appendChild(
        createEl(
          'p',
          'editor-hint',
          'move を含むスキル: 各 effect の演出は効果ブロック内で設定。ここは effect 未指定時のフォールバックです。',
        ),
      );
    }
    const vfxGrid = appendGrid(vfxSection);
    const preset = active.vfx?.preset ?? '';
    vfxGrid.appendChild(
      createFieldRow(
        'プリセット',
        createSelect(
          (preset || '') as SkillVfxPresetId | '',
          [
            { value: '', label: '— 既定（role/射程）—' },
            { value: 'slash' as SkillVfxPresetId, label: 'slash' },
            ...VFX_PRESET_OPTIONS.filter((v) => v !== 'slash').map((value) => ({
              value,
              label: value,
            })),
          ],
          (value) => {
            setActive((current) => {
              if (value.length === 0) {
                current.vfx = undefined;
              } else {
                current.vfx = {
                  ...current.vfx,
                  preset: value as SkillVfxPresetId,
                };
              }
            }, { rerender: value.length === 0 });
          },
        ),
      ),
    );
    if (active.vfx) {
      vfxGrid.appendChild(
        createFieldRow(
          'durationMs',
          createNumberInput(
            active.vfx.durationMs ?? 0,
            (durationMs) => {
              setActive((current) => {
                current.vfx = {
                  ...current.vfx!,
                  durationMs: durationMs || undefined,
                };
              }, { rerender: false });
            },
            { min: 0, step: 50 },
          ),
        ),
      );
      const arcRow = createEl('div', 'editor-field editor-field-checkbox');
      const arcInput = createEl('input') as HTMLInputElement;
      arcInput.type = 'checkbox';
      arcInput.checked = Boolean(active.vfx.arc);
      arcInput.addEventListener('change', () => {
        setActive((current) => {
          current.vfx = {
            ...current.vfx!,
            arc: arcInput.checked || undefined,
          };
        }, { rerender: false });
      });
      arcRow.appendChild(createEl('label', undefined, 'arc（放物線）'));
      arcRow.appendChild(arcInput);
      vfxGrid.appendChild(arcRow);
      vfxSection.appendChild(
        createButton('VFX を削除', 'editor-btn editor-btn-small', () => {
          setActive((current) => {
            current.vfx = undefined;
          }, { rerender: true });
        }),
      );
    } else {
      vfxSection.appendChild(
        createButton('VFX を設定', 'editor-btn editor-btn-small', () => {
          setActive((current) => {
            current.vfx = { preset: 'slash' };
          }, { rerender: true });
        }),
      );
    }
  }

  private renderEffect(
    parent: HTMLElement,
    effect: SkillEffectDef,
    onUpdate: (effect: SkillEffectDef, options?: { rerender?: boolean }) => void,
    _showPerEffectPresentation = false,
    isBasicAttack = false,
    sequenceContext?: { effectIndex: number; effectCount: number },
  ): void {
    const normalizedEffect = withEditorEffectDefaults(effect);
    if (editorEffectNeedsDefaultSync(effect, normalizedEffect)) {
      onUpdate(normalizedEffect, { rerender: false });
    }
    const { patch: patchEffect, get: getEffect } = patchEffectState(
      normalizedEffect,
      onUpdate,
    );
    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        '種別',
        createSelect(
          effectTypeToCategory(normalizedEffect.type),
          EDITOR_ACTIVE_EFFECT_CATEGORIES.map((value) => ({
            value,
            label: EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS[value],
          })),
          (category) =>
            patchEffect(
              isBasicAttack
                ? defaultBasicAttackEffect(categoryToEffectType(category))
                : defaultEffect(categoryToEffectType(category)),
              { rerender: true },
            ),
        ),
      ),
    );
    if (normalizedEffect.type === 'counter') {
      grid.appendChild(
        createEl('p', 'editor-hint', '付与対象: 自身（固定）'),
      );
    } else {
      appendTargetSpecFields(grid, getEffectTarget(effect), (target) => {
        patchEffect((prev) => ({ ...prev, target }) as SkillEffectDef, {
          rerender: true,
        });
      });
    }
    const isMove = normalizedEffect.type === 'move';
    const isCounter = normalizedEffect.type === 'counter';
    const targetShape: TargetShape = normalizedEffect.targetShape ?? 'single';
    if (!isMove && !isCounter) {
      grid.appendChild(
        createFieldRow(
          'ターゲット形状',
          createSelect(
            targetShape,
            TARGET_SHAPE_OPTIONS.filter((value) => value !== 'multiLock').map(
              (value) => ({
                value,
                label: TARGET_SHAPE_LABELS[value],
              }),
            ),
            (shape) => {
            patchEffect((prev) => {
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
            delete next.scatterRadiusPx;
            delete next.scatterSpreadRadiusPx;
            delete next.scatterHitCount;
            delete next.scatterDurationSec;
            delete next.scatterSpreadRate;
            if (shape === 'aoe') {
              next.aoeRadiusPx = 70;
            } else if (shape === 'multiLock') {
              next.hitCount = 3;
            } else if (shape === 'chain') {
              next.chainCount = 3;
              next.chainMaxDistancePx = 80;
            } else if (shape === 'scatter') {
              next.scatterRadiusPx = 70;
              next.scatterSpreadRadiusPx = 70;
              next.scatterHitCount = 3;
              next.scatterDurationSec = 1;
              next.scatterSpreadRate = 1;
            }
            return next;
            }, { rerender: true });
          },
        ),
      ),
      );
    } else {
      grid.appendChild(
        createEl('p', 'editor-hint', '移動効果は単体（single）のみ。ターゲットは移動先の基準（anchor）です。'),
      );
    }
    if (!isMove && (targetShape === 'single' || targetShape === 'aoe')) {
      grid.appendChild(
        createFieldRow(
          '攻撃回数（2以上・省略=1）',
          createNumberInput(
            effect.hitCount ?? 0,
            (hitCount) => {
              const rounded = Math.round(hitCount);
              if (rounded < 2) {
                if (getEffect().hitCount === undefined) return;
                patchEffect((prev) => {
                const next: SkillEffectDef = { ...prev, targetShape };
                delete next.hitCount;
                delete next.hitDurationSec;
                return next;
                }, { rerender: true });
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
                  }) as SkillEffectDef,
                { rerender: showDuration },
              );
            },
            {
              min: 2,
              step: 1,
              emptyWhen: 0,
              placeholder: '1（省略）',
            },
          ),
        ),
      );
      if ((effect.hitCount ?? 0) >= 2) {
        grid.appendChild(
          createFieldRow(
            '攻撃時間（秒）',
            createNumberInput(
              effect.hitDurationSec ?? 1,
              (hitDurationSec) =>
                patchEffect(
                  (prev) =>
                    ({
                      ...prev,
                      targetShape,
                      hitDurationSec,
                    }) as SkillEffectDef,
                ),
              { min: 0.1, step: 0.1 },
            ),
          ),
        );
      }
    }
    if (!isMove && targetShape === 'aoe') {
      grid.appendChild(
        createFieldRow(
          '範囲半径 px',
          createNumberInput(
            effect.aoeRadiusPx ?? 70,
            (aoeRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'aoe',
                    aoeRadiusPx,
                  }) as SkillEffectDef,
              ),
            { min: 1, step: 10 },
          ),
        ),
      );
    }
    if (!isMove && targetShape === 'multiLock') {
      grid.appendChild(
        createFieldRow(
          'ヒット回数',
          createNumberInput(
            effect.hitCount ?? 3,
            (hitCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'multiLock',
                    hitCount,
                  }) as SkillEffectDef,
              ),
            { min: 2, step: 1 },
          ),
        ),
      );
    }
    if (!isMove && targetShape === 'chain') {
      grid.appendChild(
        createFieldRow(
          '連鎖回数',
          createNumberInput(
            effect.chainCount ?? 3,
            (chainCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'chain',
                    chainCount,
                  }) as SkillEffectDef,
              ),
            { min: 1, step: 1 },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '連鎖距離 px',
          createNumberInput(
            effect.chainMaxDistancePx ?? 80,
            (chainMaxDistancePx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'chain',
                    chainMaxDistancePx,
                  }) as SkillEffectDef,
              ),
            { min: 1, step: 10 },
          ),
        ),
      );
    }
    if (!isMove && targetShape === 'scatter') {
      grid.appendChild(
        createFieldRow(
          '範囲半径 px',
          createNumberInput(
            effect.scatterSpreadRadiusPx ?? effect.scatterRadiusPx ?? 70,
            (scatterSpreadRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'scatter',
                    scatterSpreadRadiusPx,
                  }) as SkillEffectDef,
              ),
            { min: 1, step: 10 },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '乱打半径 px',
          createNumberInput(
            effect.scatterRadiusPx ?? 70,
            (scatterRadiusPx) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'scatter',
                    scatterRadiusPx,
                  }) as SkillEffectDef,
              ),
            { min: 1, step: 10 },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '乱打回数',
          createNumberInput(
            effect.scatterHitCount ?? 3,
            (scatterHitCount) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'scatter',
                    scatterHitCount,
                  }) as SkillEffectDef,
              ),
            { min: 2, step: 1 },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '乱打時間（秒）',
          createNumberInput(
            effect.scatterDurationSec ?? 1,
            (scatterDurationSec) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'scatter',
                    scatterDurationSec,
                  }) as SkillEffectDef,
              ),
            { min: 0.1, step: 0.1 },
          ),
        ),
      );
      grid.appendChild(
        createFieldRow(
          '分散率（0〜1）',
          createNumberInput(
            effect.scatterSpreadRate ?? 1,
            (scatterSpreadRate) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'scatter',
                    scatterSpreadRate,
                  }) as SkillEffectDef,
              ),
            { min: 0, step: 0.1 },
          ),
        ),
      );
    }
    if (!isMove && targetShape === 'pierce') {
      grid.appendChild(
        createFieldRow(
          '貫通時間（秒・任意）',
          createNumberInput(
            effect.pierceDurationSec ?? 0,
            (pierceDurationSec) =>
              patchEffect(
                (prev) =>
                  ({
                    ...prev,
                    targetShape: 'pierce',
                    pierceDurationSec:
                      pierceDurationSec > 0 ? pierceDurationSec : undefined,
                  }) as SkillEffectDef,
              ),
            { min: 0, step: 0.1 },
          ),
        ),
      );
    }
    if (!isBasicAttack) {
      grid.appendChild(
        createFieldRow(
          '射程 px（省略時=traits.rangePx）',
          createNumberInput(
            effect.range ?? 0,
            (range) =>
              patchEffect((prev) => ({
                ...prev,
                range: range > 0 ? range : undefined,
              } as SkillEffectDef)),
            { min: 0, max: CONFIGURABLE_RANGE_PX_MAX, step: 10 },
          ),
        ),
      );
      grid.appendChild(
        createEl('p', 'editor-hint', configurableRangeHintJa()),
      );
    }

    const detailGrid = appendGrid(parent);
    detailGrid.classList.add('editor-subgrid');

    switch (normalizedEffect.type) {
      case 'damage':
        if (!isBasicAttack) {
          detailGrid.appendChild(
            createFieldRow(
              'ダメージ種',
              createSelect(
                effect.damageType ?? 'physical',
                DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
                (damageType) => patchEffect((prev) => ({ ...prev, damageType })),
              ),
            ),
          );
        }
        appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
          patchEffect((prev) => ({ ...prev, amount }), options),
        );
        appendDamageIncreaseFields(
          detailGrid,
          effect.damageIncrease,
          (damageIncrease, options) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), options);
          },
        );
        appendDefenseIgnoreFields(
          detailGrid,
          effect.defenseIgnore,
          (defenseIgnore, options) => {
            patchEffect((prev) => ({ ...prev, defenseIgnore }), options);
          },
        );
        break;
      case 'heal': {
        const healEffect = getEffect();
        const healSubKind = (healEffect.healSubKind ?? 'instant') as HealSubKind;
        detailGrid.appendChild(
          createFieldRow(
            '回復種別',
            createSelect(
              healSubKind,
              HEAL_SUB_KINDS.map((value) => ({
                value,
                label: HEAL_SUB_KIND_LABELS[value],
              })),
              (nextHealSubKind) =>
                patchEffect(
                  (prev) => applyActiveHealSubKindChange(prev, nextHealSubKind),
                  { rerender: true },
                ),
            ),
          ),
        );
        if (healSubKind === 'dispel') {
          appendDispelEffectFields(
            detailGrid,
            {
              ...(healEffect as Extract<SkillEffectDef, { type: 'heal' }>),
              type: 'dispel',
              dispelCount: healEffect.dispelCount ?? 0,
              dispelPriority: healEffect.dispelPriority,
            },
            (next) => {
              patchEffect((prev) => {
                if (prev.type !== 'heal') return prev;
                const dispelView = {
                  ...prev,
                  type: 'dispel' as const,
                  dispelCount: prev.dispelCount ?? 0,
                  dispelPriority: prev.dispelPriority,
                };
                const updated =
                  typeof next === 'function' ? next(dispelView) : next;
                if (updated.type !== 'dispel') return prev;
                return {
                  ...prev,
                  dispelTags: updated.dispelTags,
                  dispelCount: updated.dispelCount,
                  dispelPriority: updated.dispelPriority,
                };
              });
            },
          );
          break;
        }
        if (healSubKind === 'hot') {
          detailGrid.appendChild(
            createFieldRow(
              '秒数',
              createNumberInput(
                healEffect.durationSec ?? DEFAULT_HOT_DURATION_SEC,
                (durationSec) =>
                  patchEffect((prev) => ({ ...prev, durationSec }) as SkillEffectDef),
                { min: 0.1, step: 0.5 },
              ),
            ),
          );
        }
        appendResourceAmountFields(
          detailGrid,
          normalizeEffectAmount(healEffect),
          (amount, options) =>
            patchEffect((prev) => ({ ...prev, amount }), options),
        );
        appendDamageIncreaseFields(
          detailGrid,
          healEffect.damageIncrease,
          (damageIncrease, options) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), options);
          },
        );
        break;
      }
      case 'buff':
        detailGrid.appendChild(
          createFieldRow(
            'バフ種別',
            createSelect(
              effect.buffSubKind ?? 'stat',
              BUFF_SUB_KINDS.map((value) => ({
                value,
                label: BUFF_SUB_KIND_LABELS[value],
              })),
              (buffSubKind) =>
                patchEffect(
                  (prev) => applyActiveBuffSubKindChange(prev, buffSubKind),
                  { rerender: true },
                ),
            ),
          ),
        );
        if (effect.buffSubKind === 'block' || effect.buffSubKind === 'evasion') {
          detailGrid.appendChild(
            createFieldRow(
              '確率 (0–1)',
              createNumberInput(
                effect.chance ?? 0.2,
                (chance) => patchEffect((prev) => ({ ...prev, chance }) as SkillEffectDef),
                { min: 0, max: 1, step: 0.01 },
              ),
            ),
          );
          detailGrid.appendChild(
            createFieldRow(
              '秒数',
              createNumberInput(
                effect.buffDurationSec ?? 5,
                (buffDurationSec) =>
                  patchEffect((prev) => ({ ...prev, buffDurationSec }) as SkillEffectDef),
                { min: 0.1, step: 0.5 },
              ),
            ),
          );
          break;
        }
        if (effect.buffSubKind === 'damageTakenToHeal') {
          detailGrid.appendChild(
            createFieldRow(
              'ratio',
              createNumberInput(
                effect.ratio ?? 0.1,
                (ratio) => patchEffect((prev) => ({ ...prev, ratio }) as SkillEffectDef),
                { min: 0, max: 1, step: 0.01 },
              ),
            ),
          );
          detailGrid.appendChild(
            createFieldRow(
              '秒数',
              createNumberInput(
                effect.buffDurationSec ?? 5,
                (buffDurationSec) =>
                  patchEffect((prev) => ({ ...prev, buffDurationSec }) as SkillEffectDef),
                { min: 0.1, step: 0.5 },
              ),
            ),
          );
          break;
        }
        if (effect.buffSubKind === 'barrier') {
          appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
            patchEffect((prev) => ({ ...prev, amount }) as SkillEffectDef, options),
          );
          break;
        }
        detailGrid.appendChild(
          createFieldRow(
            '対象ステ',
            createSelect(
              Array.isArray(effect.buffStat)
                ? effect.buffStat[0]!
                : (effect.buffStat ?? 'atk'),
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (buffStat) =>
                patchEffect(
                  (prev) =>
                    prev.type === 'buff' ? { ...prev, buffStat } : prev,
                ),
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '倍率',
            createNumberInput(
              effect.buffMultiplier ?? 1,
              (buffMultiplier) => patchEffect((prev) => ({ ...prev, buffMultiplier })),
              { step: 0.01 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '固定値',
            createNumberInput(
              effect.buffFlatBonus ?? 0,
              (buffFlatBonus) =>
                patchEffect((prev) => ({
                  ...prev,
                  buffFlatBonus: buffFlatBonus > 0 ? buffFlatBonus : undefined,
                })),
              { step: 1 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.buffDurationSec ?? 5,
              (buffDurationSec) =>
                patchEffect((prev) =>
                  prev.type === 'buff' ? { ...prev, buffDurationSec } : prev,
                ),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        break;
      case 'debuff':
        detailGrid.appendChild(
          createFieldRow(
            'デバフ種別',
            createSelect(
              (normalizedEffect.type === 'debuff'
                ? normalizedEffect.debuffSubKind
                : undefined) ?? 'stat',
              DEBUFF_SUB_KINDS.map((value) => ({
                value,
                label: DEBUFF_SUB_KIND_LABELS[value],
              })),
              (debuffSubKind) =>
                patchEffect(
                  (prev) => {
                    const next = { ...prev, debuffSubKind } as SkillEffectDef;
                    if (debuffSubKind === 'dot' && prev.type === 'debuff') {
                      return withDebuffDotDefaults({
                        ...next,
                        debuffSubKind: 'dot',
                      });
                    }
                    return next;
                  },
                  { rerender: true },
                ),
            ),
          ),
        );
        if (
          normalizedEffect.type === 'debuff' &&
          normalizedEffect.debuffSubKind === 'dot'
        ) {
          detailGrid.appendChild(
            createFieldRow(
              '秒数',
              createNumberInput(
                normalizedEffect.durationSec ?? DEFAULT_DOT_DURATION_SEC,
                (durationSec) =>
                  patchEffect((prev) => ({ ...prev, durationSec }) as SkillEffectDef),
                { min: 0.1, step: 0.5 },
              ),
            ),
          );
          appendResourceAmountFields(
            detailGrid,
            normalizeEffectAmount(effect),
            (amount, options) =>
              patchEffect((prev) => ({ ...prev, amount }) as SkillEffectDef, options),
          );
          detailGrid.appendChild(
            createFieldRow(
              'ダメージ種',
              createSelect(
                effect.damageType ?? 'physical',
                DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
                (damageType) =>
                  patchEffect(
                    (prev) => ({ ...prev, damageType }) as SkillEffectDef,
                  ),
              ),
            ),
          );
          break;
        }
        if (
          normalizedEffect.type === 'debuff' &&
          normalizedEffect.debuffSubKind === 'stun'
        ) {
          detailGrid.appendChild(
            createFieldRow(
              '秒数',
              createNumberInput(
                effect.durationSec ?? 1,
                (durationSec) =>
                  patchEffect((prev) => ({ ...prev, durationSec }) as SkillEffectDef),
                { min: 0.1, step: 0.5 },
              ),
            ),
          );
          break;
        }
        detailGrid.appendChild(
          createFieldRow(
            '対象ステ',
            createSelect(
              Array.isArray(effect.debuffStat)
                ? effect.debuffStat[0]!
                : (effect.debuffStat ?? 'atk'),
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (debuffStat) =>
                patchEffect(
                  (prev) =>
                    prev.type === 'debuff' ? { ...prev, debuffStat } : prev,
                ),
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '倍率',
            createNumberInput(
              effect.debuffMultiplier ?? 1,
              (debuffMultiplier) =>
                patchEffect((prev) => ({ ...prev, debuffMultiplier })),
              { step: 0.01 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.debuffDurationSec ?? 5,
              (debuffDurationSec) =>
                patchEffect((prev) =>
                  prev.type === 'debuff' ? { ...prev, debuffDurationSec } : prev,
                ),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        break;
      case 'stun':
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.durationSec,
              (durationSec) => patchEffect((prev) => ({ ...prev, durationSec })),
              { min: 0.1, step: 0.1 },
            ),
          ),
        );
        break;
      case 'knockback':
        detailGrid.appendChild(
          createFieldRow(
            '距離 px',
            createNumberInput(
              effect.distancePx,
              (distancePx) => patchEffect((prev) => ({ ...prev, distancePx })),
              { min: 1, step: 5 },
            ),
          ),
        );
        break;
      case 'barrier':
        appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
          patchEffect((prev) => ({ ...prev, amount }), options),
        );
        detailGrid.appendChild(
          (() => {
            const row = createEl('div', 'editor-field editor-field-checkbox');
            const label = createEl('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = effect.barrierStack !== false;
            input.addEventListener('change', () => {
              patchEffect((prev) => ({
                ...prev,
                barrierStack: input.checked ? undefined : false,
              }));
            });
            label.appendChild(input);
            label.append(' 継ぎ足し（既存バリアに加算）');
            row.appendChild(label);
            return row;
          })(),
        );
        break;
      case 'dot':
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              normalizedEffect.durationSec ?? DEFAULT_DOT_DURATION_SEC,
              (durationSec) => patchEffect((prev) => ({ ...prev, durationSec })),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
          patchEffect((prev) => ({ ...prev, amount }), options),
        );
        detailGrid.appendChild(
          createFieldRow(
            'ダメージ種',
            createSelect(
              effect.damageType ?? 'physical',
              DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
              (damageType) => patchEffect((prev) => ({ ...prev, damageType })),
            ),
          ),
        );
        appendDamageIncreaseFields(
          detailGrid,
          effect.damageIncrease,
          (damageIncrease, options) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), options);
          },
        );
        appendDefenseIgnoreFields(
          detailGrid,
          effect.defenseIgnore,
          (defenseIgnore, options) => {
            patchEffect((prev) => ({ ...prev, defenseIgnore }), options);
          },
        );
        break;
      case 'dispel':
        appendDispelEffectFields(detailGrid, effect, patchEffect);
        break;
      case 'block':
        detailGrid.appendChild(
          createFieldRow(
            'ブロック率 (0–1)',
            createNumberInput(
              effect.blockChance,
              (blockChance) => patchEffect((prev) =>
                prev.type === 'block' ? { ...prev, blockChance } : prev,
              ),
              { min: 0, max: 1, step: 0.01 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.durationSec,
              (durationSec) => patchEffect((prev) =>
                prev.type === 'block' ? { ...prev, durationSec } : prev,
              ),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        break;
      case 'counter':
        appendCounterEffectFields(
          detailGrid,
          effect,
          (patch, options) =>
            patchEffect(
              (prev) =>
                prev.type === 'counter' ? patch(prev) : prev,
              options,
            ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '発動確率 (0–1)',
            createNumberInput(
              effect.chance ?? 1,
              (chance) =>
                patchEffect((prev) =>
                  prev.type === 'counter' ? { ...prev, chance } : prev,
                ),
              { min: 0, max: 1, step: 0.01 },
            ),
          ),
        );
        break;
      case 'move': {
        const moveEffect = effect as MoveSkillEffect;
        detailGrid.appendChild(
          createFieldRow(
            '移動時間（秒）',
            createNumberInput(
              moveEffect.moveDurationSec,
              (moveDurationSec) =>
                patchEffect((prev) => ({
                  ...(prev as MoveSkillEffect),
                  moveDurationSec: moveDurationSec > 0 ? moveDurationSec : 0.1,
                })),
              { min: 0.05, step: 0.05 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '移動モード',
            createSelect(
              moveEffect.moveMode ?? 'engage',
              MOVE_MODES.map((value) => ({
                value,
                label: MOVE_MODE_LABELS[value],
              })),
              (moveMode) =>
                patchEffect((prev) => ({ ...(prev as MoveSkillEffect), moveMode })),
            ),
          ),
        );
        if ((moveEffect.moveMode ?? 'engage') === 'behindTarget') {
          detailGrid.appendChild(
            createFieldRow(
              '背後オフセット px',
              createNumberInput(
                moveEffect.behindOffsetPx ?? 0,
                (behindOffsetPx) =>
                  patchEffect((prev) => ({
                    ...(prev as MoveSkillEffect),
                    behindOffsetPx: behindOffsetPx > 0 ? behindOffsetPx : undefined,
                  })),
                { min: 0, step: 10 },
              ),
            ),
          );
        }
        break;
      }
    }

    if (sequenceContext) {
      appendEffectSequenceTimingFields(
        parent,
        effect,
        patchEffect,
        sequenceContext.effectIndex >= sequenceContext.effectCount - 1,
      );
    }

    if (!isBasicAttack && effectSupportsPresentationFields(effect)) {
      appendEffectPresentationFields(parent, effect, patchEffect);
    }
  }
}

function effectSupportsPresentationFields(effect: SkillEffectDef): boolean {
  return (
    effect.type === 'move' ||
    effect.type === 'damage' ||
    effect.type === 'dot' ||
    effect.type === 'heal'
  );
}
