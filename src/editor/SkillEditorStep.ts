import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  MOVE_MODE_LABELS,
  MOVE_MODES,
  PASSIVE_EFFECT_KIND_LABELS,
  PASSIVE_EFFECT_KIND_OPTIONS,
  COUNTER_RESPONSE_KIND_LABELS,
  COUNTER_RESPONSE_KINDS,
  RESOURCE_AMOUNT_KIND_LABELS,
  RESOURCE_AMOUNT_KIND_OPTIONS,
  SKILL_EFFECT_ANIM_LABELS,
  SKILL_EFFECT_ANIM_OPTIONS,
  SKILL_EFFECT_KIND_OPTIONS,
  SKILL_TRIGGER_KIND_LABELS,
  SKILL_TRIGGER_KIND_OPTIONS,
  SKILL_TRIGGER_VALUE_LABELS,
  STATUS_EFFECT_STAT_OPTIONS,
  TARGET_SHAPE_LABELS,
  TARGET_SHAPE_OPTIONS,
  VFX_PRESET_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  CounterResponseDef,
  CounterResponseKind,
  CounterSkillEffect,
  MoveSkillEffect,
  PassiveEffectKind,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillEffectKind,
  SkillTriggerKind,
  SkillVfxDef,
  SkillVfxPresetId,
  StatusEffectStat,
  TargetShape,
} from '../battle/types.ts';
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
  appendPassiveDispelFields,
  appendPassiveDamageReductionFields,
  appendPassiveHotFields,
  appendTargetSpecFields,
} from './skillEditorCombatFields.ts';
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

const EFFECT_KIND_LABELS: Record<SkillEffectKind, string> = {
  damage: 'ダメージ',
  heal: '回復',
  buff: 'バフ',
  debuff: 'デバフ',
  hot: 'HOT',
  dot: 'DOT',
  barrier: 'バリア',
  move: '移動',
  stun: 'スタン',
  knockback: 'ノックバック',
  dispel: 'デバフ解除',
  block: 'ブロック付与',
  counter: '反撃',
};

const STAT_LABELS: Record<StatusEffectStat, string> = {
  atk: '攻撃',
  def: '防御',
  reg: '耐魔',
  damageTaken: '被ダメ',
  attackSpeed: '攻撃速度',
};

function defaultResourceAmount(atkScale = 1): ResourceAmountSpec {
  return { kind: 'atkBased', atkScale };
}

function defaultDefResourceAmount(defScale = 1): ResourceAmountSpec {
  return { kind: 'defBased', defScale };
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
        {},
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
      passive.damageIncrease ??= {
        scale: 1.2,
        conditions: [{ kind: 'debuff', tags: ['def'] }],
      };
      break;
    case 'defenseIgnore':
      passive.defenseIgnore ??= { def: { mode: 'percent', amount: 0.2 } };
      break;
    case 'periodicDispel':
      passive.intervalSec ??= 5;
      passive.dispelTargetRule ??= { kind: 'self' };
      passive.dispelCount ??= 0;
      break;
    case 'damageTakenToHeal':
      passive.ratio ??= 0.1;
      break;
    case 'hot':
      passive.hotTargetRule ??= { kind: 'self' };
      passive.hotAmount ??= { kind: 'atkBased', atkScale: 0.05 };
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
    case 'extendSelfAppliedDebuff':
      passive.extendSec ??= 2;
      break;
    case 'healReceivedIncrease':
      passive.percent ??= 0.2;
      break;
    case 'counterChance':
      passive.counterChance ??= 0.3;
      passive.counterResponses ??= [defaultCounterResponse('damage')];
      passive.counterRange ??= 0;
      break;
  }
}

function passiveToCounterEffect(passive: PassiveSkillDef): CounterSkillEffect {
  return {
    type: 'counter',
    target: { kind: 'self' },
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
      return { target, type: 'heal', amount: defaultResourceAmount() };
    case 'buff':
      return {
        target,
        type: 'buff',
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
      };
    case 'debuff':
      return {
        target,
        type: 'debuff',
        debuffStat: 'def',
        debuffMultiplier: 0.8,
        debuffDurationSec: 5,
      };
    case 'hot':
      return {
        target,
        type: 'hot',
        durationSec: 5,
        amount: defaultResourceAmount(0.2),
      };
    case 'dot':
      return {
        target,
        type: 'dot',
        durationSec: 5,
        powerMultiplier: 0.2,
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
  const identity = createSection('クラス ID');
  container.appendChild(identity);
  const grid = appendGrid(identity);
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
  identity.appendChild(
    createEl(
      'p',
      'editor-hint',
      'classId 確定後、通常攻撃（{classId}_basic_attack）を自動追加します。',
    ),
  );
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

export class SkillEditorStep {
  private container: HTMLElement;
  private basicAttackExpanded = false;

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

    const section = createEl(
      'section',
      'editor-skill-section editor-basic-attack-section',
    );

    const details = createEl('details', 'editor-basic-attack-details');
    details.open = this.basicAttackExpanded;
    details.addEventListener('toggle', () => {
      this.basicAttackExpanded = details.open;
    });

    const summary = createEl('summary', 'editor-basic-attack-summary');
    summary.appendChild(
      createEl('span', 'editor-basic-attack-summary-label', '通常攻撃'),
    );

    const descriptions = indices
      .map((index) => {
        const entry = entries[index]!;
        return entry.active
          ? formatActiveDescription(entry.active)
          : entry.ref.skillId;
      })
      .join(' / ');
    summary.appendChild(
      createEl('span', 'editor-basic-attack-summary-desc', descriptions),
    );
    details.appendChild(summary);

    const list = createEl('div', 'editor-skill-list');
    for (const index of indices) {
      this.renderEntryCard(list, entries[index]!, index, { hideTitle: true });
    }
    details.appendChild(list);
    section.appendChild(details);
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
        this.renderEntryCard(list, entries[index]!, index);
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

  private renderEntryCard(
    parent: HTMLElement,
    entry: SkillDraftEntry,
    index: number,
    cardOptions?: { hideTitle?: boolean },
  ): void {
    const idReadonly = this.options.isIdReadonly?.(entry) ?? false;
    const card = cardOptions?.hideTitle
      ? createEl('div', 'editor-skill-card')
      : createSection(skillCardTitle(entry, idReadonly));
    if (!cardOptions?.hideTitle) {
      card.classList.add('editor-skill-card');
    }

    if (!idReadonly && this.options.onRemoveSkill) {
      const removeBtn = createButton('削除', 'editor-btn editor-btn-small', () => {
        this.options.onRemoveSkill?.(index);
      });
      removeBtn.style.float = 'right';
      const cardTitle = card.querySelector('.editor-section-title');
      if (cardTitle) cardTitle.appendChild(removeBtn);
    }

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

    parent.appendChild(card);
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
          PASSIVE_EFFECT_KIND_OPTIONS.map((value) => ({
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
        effectGrid.appendChild(
          createFieldRow(
            '回避率 (0–1)',
            createNumberInput(
              passive.evasionChance ?? 0,
              (evasionChance) => {
                this.patchPassive(index, (current) => {
                  current.evasionChance = evasionChance;
                }, { rerender: false });
              },
              { min: 0, step: 0.01 },
            ),
          ),
        );
        break;
      case 'block':
        effectGrid.appendChild(
          createFieldRow(
            'ブロック率 (0–1)',
            createNumberInput(
              passive.blockChance ?? 0,
              (blockChance) => {
                this.patchPassive(index, (current) => {
                  current.blockChance = blockChance;
                }, { rerender: false });
              },
              { min: 0, max: 1, step: 0.01 },
            ),
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
      case 'damageTakenToHeal':
        effectGrid.appendChild(
          createFieldRow(
            'ratio',
            createNumberInput(
              passive.ratio ?? 0,
              (ratio) => {
                this.patchPassive(index, (current) => {
                  current.ratio = ratio;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        break;
      case 'healReceivedIncrease':
        effectGrid.appendChild(
          createFieldRow(
            '増加率 (0–1)',
            createNumberInput(
              passive.percent ?? 0,
              (percent) => {
                this.patchPassive(index, (current) => {
                  current.percent = percent;
                }, { rerender: false });
              },
              { min: 0, step: 0.01 },
            ),
          ),
        );
        break;
      case 'hot':
        appendPassiveHotFields(
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
              const next = [...currentSources];
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
          createFieldRow(
            'extendSec（任意）',
            createNumberInput(
              passive.extendSec ?? 0,
              (extendSec) => {
                this.patchPassive(index, (current) => {
                  current.extendSec = extendSec || undefined;
                }, { rerender: false });
              },
              { step: 0.1 },
            ),
          ),
        );
        effectGrid.appendChild(
          createFieldRow(
            'durationMultiplier（任意）',
            createNumberInput(
              passive.durationMultiplier ?? 1,
              (durationMultiplier) => {
                this.patchPassive(index, (current) => {
                  current.durationMultiplier =
                    durationMultiplier === 1 ? undefined : durationMultiplier;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
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
      case 'counterChance':
        effectGrid.appendChild(
          createFieldRow(
            '発動確率 (0–1)',
            createNumberInput(
              passive.counterChance ?? 0,
              (counterChance) => {
                this.patchPassive(index, (current) => {
                  current.counterChance = counterChance;
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
          '発動時間（秒）',
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
          '0 = 即時。硬直中は全スキル発動不可（効果は即時適用）。参考: attack/dash 0.33s、heal 0.30s',
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
      );
      effectsSection.appendChild(block);
    });

    effectsSection.appendChild(
      createButton('+ 効果を追加', 'editor-btn editor-btn-small', () => {
        setActive((current) => {
          current.effect.push(defaultEffect('damage'));
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
                current.vfx = { ...current.vfx, preset: value };
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
    showPerEffectPresentation = false,
    isBasicAttack = false,
  ): void {
    const { patch: patchEffect, get: getEffect } = patchEffectState(effect, onUpdate);
    const grid = appendGrid(parent);
    grid.appendChild(
      createFieldRow(
        '種別',
        createSelect(
          effect.type,
          SKILL_EFFECT_KIND_OPTIONS.map((value) => ({
            value,
            label: EFFECT_KIND_LABELS[value],
          })),
          (type) => patchEffect(defaultEffect(type), { rerender: true }),
        ),
      ),
    );
    if (effect.type === 'counter') {
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
    const isMove = effect.type === 'move';
    const isCounter = effect.type === 'counter';
    const targetShape: TargetShape = effect.targetShape ?? 'single';
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
            { min: 0, step: 10 },
          ),
        ),
      );
    }

    const detailGrid = appendGrid(parent);
    detailGrid.classList.add('editor-subgrid');

    switch (effect.type) {
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
          (damageIncrease) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), { rerender: true });
          },
        );
        appendDefenseIgnoreFields(
          detailGrid,
          effect.defenseIgnore,
          (defenseIgnore) => {
            patchEffect((prev) => ({ ...prev, defenseIgnore }), { rerender: true });
          },
        );
        break;
      case 'heal':
        appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
          patchEffect((prev) => ({ ...prev, amount }), options),
        );
        appendDamageIncreaseFields(
          detailGrid,
          effect.damageIncrease,
          (damageIncrease) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), { rerender: true });
          },
        );
        break;
      case 'buff':
        detailGrid.appendChild(
          createFieldRow(
            '対象ステ',
            createSelect(
              Array.isArray(effect.buffStat) ? effect.buffStat[0]! : effect.buffStat,
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (buffStat) => patchEffect((prev) => ({ ...prev, buffStat })),
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
              effect.buffDurationSec,
              (buffDurationSec) => patchEffect((prev) => ({ ...prev, buffDurationSec })),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        break;
      case 'debuff':
        detailGrid.appendChild(
          createFieldRow(
            '対象ステ',
            createSelect(
              Array.isArray(effect.debuffStat)
                ? effect.debuffStat[0]!
                : effect.debuffStat,
              STATUS_EFFECT_STAT_OPTIONS.map((value) => ({
                value,
                label: STAT_LABELS[value],
              })),
              (debuffStat) => patchEffect((prev) => ({ ...prev, debuffStat })),
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
              effect.debuffDurationSec,
              (debuffDurationSec) =>
                patchEffect((prev) => ({ ...prev, debuffDurationSec })),
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
      case 'hot':
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.durationSec,
              (durationSec) => patchEffect((prev) => ({ ...prev, durationSec })),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        appendResourceAmountFields(detailGrid, normalizeEffectAmount(effect), (amount, options) =>
          patchEffect((prev) => ({ ...prev, amount }), options),
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
            input.checked = effect.barrierStack ?? false;
            input.addEventListener('change', () => {
              patchEffect((prev) => ({
                ...prev,
                barrierStack: input.checked ? true : undefined,
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
              effect.durationSec,
              (durationSec) => patchEffect((prev) => ({ ...prev, durationSec })),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '威力倍率',
            createNumberInput(
              effect.powerMultiplier,
              (powerMultiplier) => patchEffect((prev) => ({ ...prev, powerMultiplier })),
              { step: 0.01 },
            ),
          ),
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
          (damageIncrease) => {
            patchEffect((prev) => ({ ...prev, damageIncrease }), { rerender: true });
          },
        );
        appendDefenseIgnoreFields(
          detailGrid,
          effect.defenseIgnore,
          (defenseIgnore) => {
            patchEffect((prev) => ({ ...prev, defenseIgnore }), { rerender: true });
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
    effect.type === 'heal' ||
    effect.type === 'hot'
  );
}
