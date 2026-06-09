import {
  BUFF_FILTER_TAGS,
  DAMAGE_INCREASE_CONDITION_KIND_LABELS,
  DAMAGE_INCREASE_CONDITION_KINDS,
  DEBUFF_FILTER_TAGS,
  DEFENSE_IGNORE_DEF_MODE_LABELS,
  DEFENSE_IGNORE_DEF_MODES,
  TARGET_DISTANCE_ORDER_LABELS,
  TARGET_DISTANCE_ORDER_OPTIONS,
  TARGET_SIDE_LABELS,
  TARGET_SPEC_KIND_LABELS,
  TARGET_SPEC_KINDS,
  TARGET_STAT_LABELS,
  TARGET_STAT_ORDER_LABELS,
  TARGET_STAT_OPTIONS,
  TARGET_STAT_ORDER_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import { formatTargetLabel } from '../battle/skills/targetSpec.ts';
import type {
  BuffFilterTag,
  DamageIncreaseCondition,
  DamageIncreaseSpec,
  DebuffFilterTag,
  DefenseIgnoreSpec,
  PassiveSkillDef,
  ResourceAmountSpec,
  TargetSpec,
  TargetSpecKind,
} from '../battle/types.ts';
import {
  createActionButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSelect,
} from './formUtils.ts';

function defaultDamageIncrease(): DamageIncreaseSpec {
  return {
    scale: 1.2,
    conditions: [{ kind: 'debuff', tags: ['def'] }],
  };
}

function defaultDefenseIgnore(): DefenseIgnoreSpec {
  return { def: { mode: 'percent', amount: 0.2 } };
}

export function appendDebuffFilterCheckboxes(
  parent: HTMLElement,
  selected: DebuffFilterTag[],
  onChange: (tags: DebuffFilterTag[]) => void,
): void {
  const wrap = createEl('div', 'editor-debuff-tag-checkboxes');
  for (const tag of DEBUFF_FILTER_TAGS) {
    const row = createEl('div', 'editor-field editor-field-checkbox');
    const input = createEl('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = selected.includes(tag.id);
    input.addEventListener('change', () => {
      const next = new Set(selected);
      if (input.checked) next.add(tag.id);
      else next.delete(tag.id);
      onChange([...next]);
    });
    row.appendChild(createEl('label', undefined, tag.label));
    row.appendChild(input);
    wrap.appendChild(row);
  }
  parent.appendChild(wrap);
}

function appendDamageIncreaseConditionFields(
  parent: HTMLElement,
  condition: DamageIncreaseCondition,
  onChange: (condition: DamageIncreaseCondition) => void,
  onRemove: () => void,
): void {
  const card = createEl('div', 'editor-condition-card');
  card.appendChild(
    createFieldRow(
      '条件種別',
      createSelect(
        condition.kind,
        DAMAGE_INCREASE_CONDITION_KINDS.map((kind) => ({
          value: kind,
          label: DAMAGE_INCREASE_CONDITION_KIND_LABELS[kind],
        })),
        (kind) => {
          if (kind === 'debuff') {
            onChange({ kind, tags: ['def'] });
          } else if (kind === 'targetHp') {
            onChange({ kind, maxHpRatio: 0.5 });
          } else {
            onChange({ kind, maxHpRatio: 0.5, mode: 'threshold' });
          }
        },
      ),
    ),
  );

  if (condition.kind === 'debuff') {
    card.appendChild(createEl('p', 'editor-hint', '対象デバフ（いずれか）'));
    appendDebuffFilterCheckboxes(card, condition.tags, (tags) => {
      onChange({ ...condition, tags });
    });
    card.appendChild(
      createFieldRow(
        '自分付与のみ',
        createSelect(
          condition.selfAppliedOnly ? 'true' : 'false',
          [
            { value: 'false', label: 'いいえ' },
            { value: 'true', label: 'はい' },
          ],
          (value) => {
            onChange({
              ...condition,
              selfAppliedOnly: value === 'true' || undefined,
            });
          },
        ),
      ),
    );
  } else if (condition.kind === 'targetHp') {
    card.appendChild(
      createFieldRow(
        '対象HP残り割合以下',
        createNumberInput(
          condition.maxHpRatio,
          (maxHpRatio) => onChange({ ...condition, maxHpRatio }),
          { min: 0, max: 1, step: 0.01 },
        ),
      ),
    );
  } else {
    card.appendChild(
      createFieldRow(
        '自身HP残り割合',
        createNumberInput(
          condition.maxHpRatio,
          (maxHpRatio) => onChange({ ...condition, maxHpRatio }),
          { min: 0, max: 1, step: 0.01 },
        ),
      ),
    );
    card.appendChild(
      createFieldRow(
        '判定モード',
        createSelect(
          condition.mode ?? 'threshold',
          [
            { value: 'threshold', label: '閾値（以下で倍率適用）' },
            { value: 'scaling', label: 'スケーリング（欠損HP比例）' },
          ],
          (mode) => {
            onChange({
              ...condition,
              mode: mode as 'threshold' | 'scaling',
            });
          },
        ),
      ),
    );
    if ((condition.mode ?? 'threshold') === 'scaling') {
      card.appendChild(
        createFieldRow(
          'maxMul',
          createNumberInput(
            condition.maxMul ?? 1.5,
            (maxMul) => onChange({ ...condition, maxMul }),
            { step: 0.01 },
          ),
        ),
      );
    }
  }

  card.appendChild(
    createActionButton('条件を削除', 'editor-btn editor-btn-small', onRemove),
  );
  parent.appendChild(card);
}

export function appendDamageIncreaseFields(
  parent: HTMLElement,
  spec: DamageIncreaseSpec | undefined,
  onChange: (spec: DamageIncreaseSpec | undefined) => void,
): void {
  const section = createEl('div', 'editor-subsection');
  section.appendChild(createEl('h4', 'editor-subsection-title', '特効ダメージ'));

  const enabledRow = createEl('div', 'editor-field editor-field-checkbox');
  const enabledInput = createEl('input') as HTMLInputElement;
  enabledInput.type = 'checkbox';
  enabledInput.checked = Boolean(spec);
  enabledInput.addEventListener('change', () => {
    onChange(enabledInput.checked ? defaultDamageIncrease() : undefined);
  });
  enabledRow.appendChild(createEl('label', undefined, '有効'));
  enabledRow.appendChild(enabledInput);
  section.appendChild(enabledRow);

  if (!spec) {
    parent.appendChild(section);
    return;
  }

  section.appendChild(
    createFieldRow(
      '倍率 scale',
      createNumberInput(
        spec.scale,
        (scale) => onChange({ ...spec, scale }),
        { step: 0.01 },
      ),
    ),
  );

  const conditionsWrap = createEl('div', 'editor-conditions-list');
  spec.conditions.forEach((condition, index) => {
    appendDamageIncreaseConditionFields(
      conditionsWrap,
      condition,
      (next) => {
        const conditions = [...spec.conditions];
        conditions[index] = next;
        onChange({ ...spec, conditions });
      },
      () => {
        const conditions = spec.conditions.filter((_, i) => i !== index);
        onChange(
          conditions.length > 0
            ? { ...spec, conditions }
            : { ...spec, conditions: [{ kind: 'debuff', tags: ['def'] }] },
        );
      },
    );
  });
  section.appendChild(conditionsWrap);
  section.appendChild(
    createActionButton('増加条件を追加', 'editor-btn editor-btn-small', () => {
      onChange({
        ...spec,
        conditions: [...spec.conditions, { kind: 'debuff', tags: ['def'] }],
      });
    }),
  );
  parent.appendChild(section);
}

export function appendDefenseIgnoreFields(
  parent: HTMLElement,
  spec: DefenseIgnoreSpec | undefined,
  onChange: (spec: DefenseIgnoreSpec | undefined) => void,
): void {
  const section = createEl('div', 'editor-subsection');
  section.appendChild(createEl('h4', 'editor-subsection-title', '防御無視'));

  const enabledRow = createEl('div', 'editor-field editor-field-checkbox');
  const enabledInput = createEl('input') as HTMLInputElement;
  enabledInput.type = 'checkbox';
  enabledInput.checked = Boolean(spec);
  enabledInput.addEventListener('change', () => {
    onChange(enabledInput.checked ? defaultDefenseIgnore() : undefined);
  });
  enabledRow.appendChild(createEl('label', undefined, '有効'));
  enabledRow.appendChild(enabledInput);
  section.appendChild(enabledRow);

  if (!spec) {
    parent.appendChild(section);
    return;
  }

  const defEnabled = Boolean(spec.def);
  const defEnableRow = createEl('div', 'editor-field editor-field-checkbox');
  const defEnableInput = createEl('input') as HTMLInputElement;
  defEnableInput.type = 'checkbox';
  defEnableInput.checked = defEnabled;
  defEnableInput.addEventListener('change', () => {
    if (defEnableInput.checked) {
      onChange({ ...spec, def: { mode: 'percent', amount: 0.2 } });
    } else {
      const next = { ...spec };
      delete next.def;
      onChange(Object.keys(next).length > 1 ? next : undefined);
    }
  });
  defEnableRow.appendChild(createEl('label', undefined, 'DEF 無視'));
  defEnableRow.appendChild(defEnableInput);
  section.appendChild(defEnableRow);

  if (spec.def) {
    section.appendChild(
      createFieldRow(
        'DEF 無視方式',
        createSelect(
          spec.def.mode,
          DEFENSE_IGNORE_DEF_MODES.map((mode) => ({
            value: mode,
            label: DEFENSE_IGNORE_DEF_MODE_LABELS[mode],
          })),
          (mode) => {
            onChange({
              ...spec,
              def: { mode: mode as 'flat' | 'percent', amount: spec.def!.amount },
            });
          },
        ),
      ),
    );
    section.appendChild(
      createFieldRow(
        spec.def.mode === 'flat' ? 'DEF 固定値' : 'DEF 割合 (0–1)',
        createNumberInput(
          spec.def.amount,
          (amount) => {
            onChange({ ...spec, def: { ...spec.def!, amount } });
          },
          { step: 0.01 },
        ),
      ),
    );
  }

  const regEnabled = Boolean(spec.reg);
  const regEnableRow = createEl('div', 'editor-field editor-field-checkbox');
  const regEnableInput = createEl('input') as HTMLInputElement;
  regEnableInput.type = 'checkbox';
  regEnableInput.checked = regEnabled;
  regEnableInput.addEventListener('change', () => {
    if (regEnableInput.checked) {
      onChange({ ...spec, reg: { percent: 0.2 } });
    } else {
      const next = { ...spec };
      delete next.reg;
      onChange(next.def || next.reg ? next : undefined);
    }
  });
  regEnableRow.appendChild(createEl('label', undefined, '耐魔無視'));
  regEnableRow.appendChild(regEnableInput);
  section.appendChild(regEnableRow);

  if (spec.reg) {
    section.appendChild(
      createFieldRow(
        '耐魔割合 (0–1)',
        createNumberInput(
          spec.reg.percent,
          (percent) => {
            onChange({ ...spec, reg: { percent } });
          },
          { min: 0, max: 1, step: 0.01 },
        ),
      ),
    );
  }

  parent.appendChild(section);
}

export function appendDispelEffectFields(
  parent: HTMLElement,
  effect: Extract<SkillEffectDef, { type: 'dispel' }>,
  patchEffect: (
    patch: SkillEffectDef | ((prev: SkillEffectDef) => SkillEffectDef),
    options?: { rerender?: boolean },
  ) => void,
): void {
  parent.appendChild(
    createFieldRow(
      '解除数 (0=すべて)',
      createNumberInput(
        effect.dispelCount,
        (dispelCount) => {
          patchEffect((prev) =>
            prev.type === 'dispel' ? { ...prev, dispelCount } : prev,
          );
        },
        { min: 0, step: 1 },
      ),
    ),
  );
  parent.appendChild(createEl('p', 'editor-hint', '解除対象デバフ（未選択=すべて）'));
  appendDebuffFilterCheckboxes(
    parent,
    effect.dispelTags ?? [],
    (tags) => {
      patchEffect((prev) =>
        prev.type === 'dispel'
          ? { ...prev, dispelTags: tags.length > 0 ? tags : undefined }
          : prev,
      );
    },
  );
}

export function appendPassiveDamageReductionFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean },
  ) => void,
): void {
  appendTargetSpecFields(
    parent,
    passive.damageReductionTargetRule ?? { kind: 'self' },
    (damageReductionTargetRule) => {
      patchPassive((current) => {
        current.damageReductionTargetRule = damageReductionTargetRule;
      });
    },
  );
  parent.appendChild(
    createFieldRow(
      '軽減率 (0–1)',
      createNumberInput(
        passive.damageReductionPercent ?? 0,
        (damageReductionPercent) => {
          patchPassive((current) => {
            current.damageReductionPercent = damageReductionPercent;
          });
        },
        { min: 0, max: 1, step: 0.01 },
      ),
    ),
  );
}

export function appendPassiveHotFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean },
  ) => void,
  appendResourceAmountFields: (
    grid: HTMLElement,
    amount: ResourceAmountSpec,
    onUpdate: (
      amount: ResourceAmountSpec,
      options?: { rerender?: boolean },
    ) => void,
  ) => void,
): void {
  parent.appendChild(
    createFieldRow(
      '発動間隔 (秒)',
      createNumberInput(
        passive.intervalSec ?? 5,
        (intervalSec) => {
          patchPassive((current) => {
            current.intervalSec = intervalSec;
          });
        },
        { min: 0.1, step: 0.1 },
      ),
    ),
  );
  parent.appendChild(
    createFieldRow(
      '効果時間 (秒, 0=無限)',
      createNumberInput(
        passive.hotDurationSec ?? 0,
        (hotDurationSec) => {
          patchPassive((current) => {
            current.hotDurationSec = hotDurationSec;
          });
        },
        { min: 0, step: 0.1 },
      ),
    ),
  );
  appendTargetSpecFields(
    parent,
    passive.hotTargetRule ?? { kind: 'self' },
    (hotTargetRule) => {
      patchPassive((current) => {
        current.hotTargetRule = hotTargetRule;
      });
    },
  );
  appendResourceAmountFields(
    parent,
    passive.hotAmount ?? { kind: 'atkBased', atkScale: 0.05 },
    (amount) => {
      patchPassive((current) => {
        current.hotAmount = amount;
      });
    },
  );
}

export function appendPassiveDispelFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean },
  ) => void,
): void {
  parent.appendChild(
    createFieldRow(
      '解除間隔 (秒)',
      createNumberInput(
        passive.intervalSec ?? 5,
        (intervalSec) => {
          patchPassive((current) => {
            current.intervalSec = intervalSec;
          });
        },
        { min: 0.1, step: 0.1 },
      ),
    ),
  );
  appendTargetSpecFields(
    parent,
    passive.dispelTargetRule ?? { kind: 'self' },
    (dispelTargetRule) => {
      patchPassive((current) => {
        current.dispelTargetRule = dispelTargetRule;
      });
    },
  );
  parent.appendChild(
    createFieldRow(
      '解除数 (0=すべて)',
      createNumberInput(
        passive.dispelCount ?? 0,
        (dispelCount) => {
          patchPassive((current) => {
            current.dispelCount = dispelCount;
          });
        },
        { min: 0, step: 1 },
      ),
    ),
  );
  parent.appendChild(createEl('p', 'editor-hint', '解除対象デバフ（未選択=すべて）'));
  appendDebuffFilterCheckboxes(
    parent,
    passive.dispelTags ?? [],
    (tags) => {
      patchPassive((current) => {
        current.dispelTags = tags.length > 0 ? tags : undefined;
      });
    },
  );
}

function targetSpecKind(spec: TargetSpec): TargetSpecKind {
  return spec.kind;
}

function defaultTargetForKind(kind: TargetSpecKind): TargetSpec {
  switch (kind) {
    case 'self':
      return { kind: 'self' };
    case 'all':
      return { kind: 'all', side: 'ally' };
    case 'distance':
      return { kind: 'distance', side: 'enemy', order: 'nearest' };
    case 'stat':
      return { kind: 'stat', side: 'enemy', stat: 'hp', order: 'lowest' };
    case 'attackType':
      return { kind: 'attackType', physical: true };
    case 'status':
      return { kind: 'status', side: 'enemy', debuffTags: ['def'] };
  }
}

function appendStatusTagCheckboxes(
  parent: HTMLElement,
  debuffTags: DebuffFilterTag[],
  buffTags: BuffFilterTag[],
  onChange: (debuffTags: DebuffFilterTag[], buffTags: BuffFilterTag[]) => void,
): void {
  parent.appendChild(createEl('p', 'editor-hint', 'デバフ（いずれか）'));
  appendDebuffFilterCheckboxes(parent, debuffTags, (nextDebuff) => {
    onChange(nextDebuff, buffTags);
  });
  parent.appendChild(createEl('p', 'editor-hint', 'バフ（いずれか）'));
  const buffWrap = createEl('div', 'editor-debuff-tag-checkboxes');
  for (const tag of BUFF_FILTER_TAGS) {
    const row = createEl('div', 'editor-field editor-field-checkbox');
    const input = createEl('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = buffTags.includes(tag.id);
    input.addEventListener('change', () => {
      const next = new Set(buffTags);
      if (input.checked) next.add(tag.id);
      else next.delete(tag.id);
      onChange(debuffTags, [...next]);
    });
    row.appendChild(createEl('label', undefined, tag.label));
    row.appendChild(input);
    buffWrap.appendChild(row);
  }
  parent.appendChild(buffWrap);
}

export function appendTargetSpecFields(
  parent: HTMLElement,
  target: TargetSpec,
  onChange: (target: TargetSpec) => void,
): void {
  const wrap = createEl('div', 'editor-target-spec-fields');
  const kind = targetSpecKind(target);

  wrap.appendChild(
    createFieldRow(
      '種別',
      createSelect(
        kind,
        TARGET_SPEC_KINDS.map((value) => ({
          value,
          label: TARGET_SPEC_KIND_LABELS[value],
        })),
        (nextKind) => onChange(defaultTargetForKind(nextKind)),
      ),
    ),
  );

  if (target.kind === 'distance') {
    wrap.appendChild(
      createFieldRow(
        '距離',
        createSelect(
          target.order,
          TARGET_DISTANCE_ORDER_OPTIONS.map((value) => ({
            value,
            label: TARGET_DISTANCE_ORDER_LABELS[value],
          })),
          (order) => onChange({ ...target, order }),
        ),
      ),
    );
    wrap.appendChild(
      createFieldRow(
        '対象側',
        createSelect(
          target.side,
          (['ally', 'enemy'] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...target, side }),
        ),
      ),
    );
  }

  if (target.kind === 'stat') {
    wrap.appendChild(
      createFieldRow(
        '対象側',
        createSelect(
          target.side,
          (['ally', 'enemy'] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...target, side }),
        ),
      ),
    );
    wrap.appendChild(
      createFieldRow(
        'ステータス',
        createSelect(
          target.stat,
          TARGET_STAT_OPTIONS.map((value) => ({
            value,
            label: TARGET_STAT_LABELS[value],
          })),
          (stat) =>
            onChange({
              ...target,
              stat,
              order: stat === 'hp' ? target.order : target.order === 'ratio' ? 'lowest' : target.order,
            }),
        ),
      ),
    );
    const orderOptions =
      target.stat === 'hp'
        ? TARGET_STAT_ORDER_OPTIONS
        : TARGET_STAT_ORDER_OPTIONS.filter((value) => value !== 'ratio');
    wrap.appendChild(
      createFieldRow(
        '順序',
        createSelect(
          target.order,
          orderOptions.map((value) => ({
            value,
            label: TARGET_STAT_ORDER_LABELS[value],
          })),
          (order) => onChange({ ...target, order }),
        ),
      ),
    );
  }

  if (target.kind === 'attackType') {
    const attackRow = createEl('div', 'editor-debuff-tag-checkboxes');
    for (const [key, label] of [
      ['physical', '物理'],
      ['magic', '魔法'],
      ['melee', '近接'],
      ['ranged', '遠隔'],
    ] as const) {
      const row = createEl('div', 'editor-field editor-field-checkbox');
      const input = createEl('input') as HTMLInputElement;
      input.type = 'checkbox';
      input.checked = target[key] === true;
      input.addEventListener('change', () => {
        const next = { ...target, [key]: input.checked ? true : undefined };
        const hasAny =
          next.physical || next.magic || next.melee || next.ranged;
        if (hasAny) onChange(next);
      });
      row.appendChild(createEl('label', undefined, label));
      row.appendChild(input);
      attackRow.appendChild(row);
    }
    wrap.appendChild(attackRow);
  }

  if (target.kind === 'status') {
    wrap.appendChild(
      createFieldRow(
        '対象側',
        createSelect(
          target.side ?? 'enemy',
          (['ally', 'enemy'] as const).map((value) => ({
            value,
            label: TARGET_SIDE_LABELS[value],
          })),
          (side) => onChange({ ...target, side }),
        ),
      ),
    );
    appendStatusTagCheckboxes(
      wrap,
      target.debuffTags ?? [],
      target.buffTags ?? [],
      (debuffTags, buffTags) =>
        onChange({
          ...target,
          debuffTags: debuffTags.length > 0 ? debuffTags : undefined,
          buffTags: buffTags.length > 0 ? buffTags : undefined,
        }),
    );
  }

  if (target.kind === 'all') {
    wrap.appendChild(
      createFieldRow(
        '対象側',
        createSelect(
          target.side,
          (['ally', 'enemy'] as const).map((value) => ({
            value,
            label: value === 'ally' ? '味方全員' : '敵全員',
          })),
          (side) => onChange({ ...target, side }),
        ),
      ),
    );
  }

  wrap.appendChild(
    createEl('p', 'editor-hint', `プレビュー: ${formatTargetLabel(target)}`),
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
    options?: { rerender?: boolean },
  ) => void,
): void {
  appendDamageIncreaseFields(
    parent,
    passive.damageIncrease,
    (damageIncrease) => {
      patchPassive((current) => {
        current.damageIncrease = damageIncrease;
      }, { rerender: true });
    },
  );
}

export function appendPassiveDefenseIgnoreFields(
  parent: HTMLElement,
  passive: PassiveSkillDef,
  patchPassive: (
    mutate: (current: PassiveSkillDef) => void,
    options?: { rerender?: boolean },
  ) => void,
): void {
  appendDefenseIgnoreFields(parent, passive.defenseIgnore, (defenseIgnore) => {
    patchPassive((current) => {
      current.defenseIgnore = defenseIgnore;
    }, { rerender: true });
  });
}
