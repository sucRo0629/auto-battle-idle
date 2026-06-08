import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  MOVE_MODE_LABELS,
  MOVE_MODES,
  PASSIVE_EFFECT_KIND_OPTIONS,
  RESOURCE_AMOUNT_KIND_LABELS,
  RESOURCE_AMOUNT_KIND_OPTIONS,
  SKILL_EFFECT_ANIM_LABELS,
  SKILL_EFFECT_ANIM_OPTIONS,
  SKILL_EFFECT_KIND_OPTIONS,
  SKILL_TRIGGER_KIND_LABELS,
  SKILL_TRIGGER_KIND_OPTIONS,
  SKILL_TRIGGER_VALUE_LABELS,
  STATUS_EFFECT_STAT_OPTIONS,
  TARGET_RULE_LABELS,
  TARGET_RULE_OPTIONS,
  TARGET_SHAPE_LABELS,
  TARGET_SHAPE_OPTIONS,
  VFX_PRESET_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  BarrierSkillEffect,
  HealSkillEffect,
  HotSkillEffect,
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
import { skillHasMoveEffect } from '../battle/skills/skillSequence.ts';
import { resolveSkillTrigger } from '../battle/skillTrigger.ts';
import type { SkillDraftEntry, SkillSlotKind } from './editorApi.ts';
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

const PASSIVE_EFFECT_LABELS: Record<PassiveEffectKind, string> = {
  damageMultiplier: '与ダメ倍率',
  damageTakenMultiplier: '被ダメ倍率',
  healBonus: '回復ボーナス',
  targetRuleOverride: 'ターゲット上書き',
  evasionChance: '回避率',
  activeCooldownRate: 'アクティブCD倍率',
};

const EFFECT_KIND_LABELS: Record<SkillEffectKind, string> = {
  damage: 'ダメージ',
  heal: '回復',
  buff: 'バフ',
  debuff: 'デバフ',
  hot: 'HOT',
  dot: 'DOT',
  barrier: 'バリア',
  move: '移動',
};

const STAT_LABELS: Record<StatusEffectStat, string> = {
  atk: '攻撃',
  def: '防御',
  reg: '再生',
  damageTaken: '被ダメ',
};

function defaultResourceAmount(atkMultiply = 1): ResourceAmountSpec {
  return { kind: 'atkBased', atkMultiply };
}

function normalizeResourceAmount(
  effect: HealSkillEffect | HotSkillEffect | BarrierSkillEffect,
): ResourceAmountSpec {
  if (effect.amount) return effect.amount;
  const legacy = (effect as { powerMultiplier?: number }).powerMultiplier;
  return defaultResourceAmount(legacy ?? 1);
}

function appendResourceAmountFields(
  grid: HTMLElement,
  amount: ResourceAmountSpec,
  onUpdate: (amount: ResourceAmountSpec, options?: { rerender?: boolean }) => void,
): void {
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
            onUpdate(defaultResourceAmount(amount.atkMultiply ?? 1), { rerender: true });
          } else if (kind === 'flat') {
            onUpdate({ kind, flatAmount: amount.flatAmount ?? 0 }, { rerender: true });
          } else {
            onUpdate(
              {
                kind,
                percentOfMaxHp: amount.percentOfMaxHp ?? 0.1,
              },
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
        'ATK 加算',
        createNumberInput(
          amount.atkAdd ?? 0,
          (atkAdd) => onUpdate({ ...amount, atkAdd }),
          { step: 1 },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'ATK 乗算',
        createNumberInput(
          amount.atkMultiply ?? 1,
          (atkMultiply) => onUpdate({ ...amount, atkMultiply }),
          { step: 0.01 },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'ATK 除算',
        createNumberInput(
          amount.atkDivide ?? 1,
          (atkDivide) => onUpdate({ ...amount, atkDivide }),
          { step: 0.01, min: 0.01 },
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'ATK 減算',
        createNumberInput(
          amount.atkSubtract ?? 0,
          (atkSubtract) => onUpdate({ ...amount, atkSubtract }),
          { step: 1 },
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
          (flatAmount) => onUpdate({ ...amount, flatAmount }),
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
          onUpdate({
            ...amount,
            percentOfMaxHp: Math.min(100, Math.max(0, percent)) / 100,
          }),
        { step: 1, min: 0 },
      ),
    ),
  );
}

function appendEffectPresentationFields(
  parent: HTMLElement,
  effect: SkillEffectDef,
  onUpdate: (effect: SkillEffectDef, options?: { rerender?: boolean }) => void,
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
          const next = { ...effect } as SkillEffectDef;
          if (value.length === 0) {
            delete next.anim;
          } else {
            next.anim = value as SkillEffectAnimId;
          }
          onUpdate(next);
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
          const next = { ...effect } as SkillEffectDef;
          if (value.length === 0) {
            delete next.vfx;
          } else {
            next.vfx = { ...next.vfx, preset: value as SkillVfxPresetId };
          }
          onUpdate(next);
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
            const vfx: SkillVfxDef = {
              ...effect.vfx!,
              durationMs: durationMs || undefined,
            };
            onUpdate({ ...effect, vfx });
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
      onUpdate({
        ...effect,
        vfx: {
          ...effect.vfx!,
          arc: arcInput.checked || undefined,
        },
      });
    });
    arcRow.appendChild(createEl('label', undefined, 'VFX arc（放物線）'));
    arcRow.appendChild(arcInput);
    grid.appendChild(arcRow);
    section.appendChild(
      createButton('effect VFX を削除', 'editor-btn editor-btn-small', () => {
        const next = { ...effect } as SkillEffectDef;
        delete next.vfx;
        onUpdate(next, { rerender: true });
      }),
    );
  }
}

function defaultEffect(type: SkillEffectKind): SkillEffectDef {
  switch (type) {
    case 'damage':
      return {
        targetRule: 'frontEnemy',
        type: 'damage',
        damageType: 'physical',
        powerMultiplier: 1,
      };
    case 'heal':
      return {
        targetRule: 'mostDamagedAlly',
        type: 'heal',
        amount: defaultResourceAmount(),
      };
    case 'buff':
      return {
        targetRule: 'self',
        type: 'buff',
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
      };
    case 'debuff':
      return {
        targetRule: 'frontEnemy',
        type: 'debuff',
        debuffStat: 'def',
        debuffMultiplier: 0.8,
        debuffDurationSec: 5,
      };
    case 'hot':
      return {
        targetRule: 'mostDamagedAlly',
        type: 'hot',
        durationSec: 5,
        amount: defaultResourceAmount(0.2),
      };
    case 'dot':
      return {
        targetRule: 'frontEnemy',
        type: 'dot',
        durationSec: 5,
        powerMultiplier: 0.2,
        damageType: 'physical',
      };
    case 'barrier':
      return {
        targetRule: 'mostDamagedAlly',
        type: 'barrier',
        amount: defaultResourceAmount(),
      };
    case 'move':
      return {
        targetRule: 'frontEnemy',
        type: 'move',
        moveMode: 'engage',
        moveDurationSec: 0.25,
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
    if (item.id === entityPicker.selectedId) opt.selected = true;
    select.appendChild(opt);
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
  const kindLabel = entry.ref.kind === 'passive' ? 'パッシブ' : 'アクティブ';
  if (idReadonly) {
    return `${kindLabel}: 通常攻撃`;
  }
  return kindLabel;
}

export class SkillEditorStep {
  private container: HTMLElement;

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

    if (entries.length === 0) {
      this.container.appendChild(
        createEl(
          'p',
          'editor-hint',
          classIdentity
            ? 'classId を入力すると通常攻撃が追加されます。パッシブ / アクティブはボタンで追加してください。'
            : 'スキル ID が未設定のため、編集対象がありません。',
        ),
      );
    }

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      const idReadonly = this.options.isIdReadonly?.(entry) ?? false;
      const card = createSection(skillCardTitle(entry, idReadonly));
      card.classList.add('editor-skill-card');

      if (!idReadonly && this.options.onRemoveSkill) {
        const removeBtn = createButton('削除', 'editor-btn editor-btn-small', () => {
          this.options.onRemoveSkill?.(index);
        });
        removeBtn.style.float = 'right';
        const title = card.querySelector('.editor-section-title');
        if (title) title.appendChild(removeBtn);
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
                  current.unlockLevel = Math.max(0, Math.round(unlockLevel));
                }, { rerender: false });
              },
              { min: 0, step: 1 },
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

      this.container.appendChild(card);
    }

    if (onAddSkill) {
      const addRow = createEl('div', 'editor-actions');
      addRow.appendChild(
        createButton('+ パッシブ', 'editor-btn editor-btn-small', () => {
          onAddSkill('passive');
        }),
      );
      addRow.appendChild(
        createButton('+ アクティブ', 'editor-btn editor-btn-small', () => {
          onAddSkill('active');
        }),
      );
      this.container.appendChild(addRow);
    }

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
        '効果種別',
        createSelect(
          passive.effect,
          PASSIVE_EFFECT_KIND_OPTIONS.map((value) => ({
            value,
            label: PASSIVE_EFFECT_LABELS[value],
          })),
          (effect) => {
            this.patchPassive(index, (current) => {
              current.effect = effect;
            }, { rerender: true });
          },
        ),
      ),
    );

    const effectGrid = appendGrid(parent);
    effectGrid.classList.add('editor-subgrid');

    switch (passive.effect) {
      case 'damageMultiplier':
        effectGrid.appendChild(
          createFieldRow(
            '与ダメ倍率',
            createNumberInput(
              passive.damageMultiplier ?? 1,
              (damageMultiplier) => {
                this.patchPassive(index, (current) => {
                  current.damageMultiplier = damageMultiplier;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        break;
      case 'damageTakenMultiplier':
        effectGrid.appendChild(
          createFieldRow(
            '被ダメ倍率',
            createNumberInput(
              passive.damageTakenMultiplier ?? 1,
              (damageTakenMultiplier) => {
                this.patchPassive(index, (current) => {
                  current.damageTakenMultiplier = damageTakenMultiplier;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        break;
      case 'healBonus':
        effectGrid.appendChild(
          createFieldRow(
            '回復ボーナス',
            createNumberInput(
              passive.healBonus ?? 0,
              (healBonus) => {
                this.patchPassive(index, (current) => {
                  current.healBonus = healBonus;
                }, { rerender: false });
              },
              { step: 1 },
            ),
          ),
        );
        break;
      case 'targetRuleOverride':
        effectGrid.appendChild(
          createFieldRow(
            'ターゲット',
            createSelect(
              passive.targetRuleOverride ?? 'frontEnemy',
              TARGET_RULE_OPTIONS.map((value) => ({
                value,
                label: TARGET_RULE_LABELS[value],
              })),
              (targetRuleOverride) => {
                this.patchPassive(index, (current) => {
                  current.targetRuleOverride = targetRuleOverride;
                }, { rerender: false });
              },
            ),
          ),
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
      case 'activeCooldownRate':
        effectGrid.appendChild(
          createFieldRow(
            'CD倍率',
            createNumberInput(
              passive.activeCooldownRate ?? 1,
              (activeCooldownRate) => {
                this.patchPassive(index, (current) => {
                  current.activeCooldownRate = activeCooldownRate;
                }, { rerender: false });
              },
              { step: 0.01 },
            ),
          ),
        );
        break;
    }
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
          '通常攻撃の間隔はクラス設定の「攻撃速度（SPD 段階）」から決まります。',
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
      const valueMin = trigger.kind === 'time' ? 0.1 : 1;
      const valueStep = trigger.kind === 'time' ? 0.1 : 1;
      grid.appendChild(
        createFieldRow(
          SKILL_TRIGGER_VALUE_LABELS[trigger.kind],
          createNumberInput(
            trigger.value,
            (value) => {
              setActive((current) => {
                const kind = resolveSkillTrigger(current).kind;
                const nextValue =
                  kind === 'time'
                    ? Math.max(0.1, value)
                    : Math.max(1, Math.round(value));
                current.trigger = { kind, value: nextValue };
                delete current.interval;
              }, { rerender: false });
            },
            { min: valueMin, step: valueStep },
          ),
        ),
      );
    }

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
          (preset || 'slash') as SkillVfxPresetId,
          [
            { value: 'slash' as SkillVfxPresetId, label: 'slash' },
            ...VFX_PRESET_OPTIONS.filter((v) => v !== 'slash').map((value) => ({
              value,
              label: value,
            })),
          ],
          (value) => {
            setActive((current) => {
              current.vfx = { ...current.vfx, preset: value };
            }, { rerender: false });
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
  ): void {
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
          (type) => onUpdate(defaultEffect(type), { rerender: true }),
        ),
      ),
    );
    grid.appendChild(
      createFieldRow(
        'ターゲット',
        createSelect(
          effect.targetRule,
          TARGET_RULE_OPTIONS.map((value) => ({
            value,
            label: TARGET_RULE_LABELS[value],
          })),
          (targetRule) => onUpdate({ ...effect, targetRule } as SkillEffectDef),
        ),
      ),
    );
    const isMove = effect.type === 'move';
    const targetShape: TargetShape = effect.targetShape ?? 'single';
    if (!isMove) {
      grid.appendChild(
        createFieldRow(
          'ターゲット形状',
          createSelect(
            targetShape,
            TARGET_SHAPE_OPTIONS.map((value) => ({
              value,
              label: TARGET_SHAPE_LABELS[value],
            })),
            (shape) => {
            const next: SkillEffectDef = { ...effect, targetShape: shape };
            delete next.aoeRadiusPx;
            delete next.hitCount;
            delete next.piercePowerStepMultiplier;
            delete next.piercePowerStepMode;
            delete next.pierceDurationSec;
            delete next.chainCount;
            delete next.chainMaxDistancePx;
            delete next.chainPowerStepMultiplier;
            delete next.chainPowerStepMode;
            delete next.scatterRadiusPx;
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
              next.scatterHitCount = 3;
              next.scatterDurationSec = 1;
              next.scatterSpreadRate = 1;
            }
            onUpdate(next, { rerender: true });
          },
        ),
      ),
      );
    } else {
      grid.appendChild(
        createEl('p', 'editor-hint', '移動効果は単体（single）のみ。ターゲットは移動先の基準（anchor）です。'),
      );
    }
    if (!isMove && targetShape === 'aoe') {
      grid.appendChild(
        createFieldRow(
          '範囲半径 px',
          createNumberInput(
            effect.aoeRadiusPx ?? 70,
            (aoeRadiusPx) =>
              onUpdate({
                ...effect,
                targetShape: 'aoe',
                aoeRadiusPx: aoeRadiusPx > 0 ? aoeRadiusPx : 70,
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'multiLock',
                hitCount: Math.max(2, Math.round(hitCount)),
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'chain',
                chainCount: Math.max(1, Math.round(chainCount)),
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'chain',
                chainMaxDistancePx: chainMaxDistancePx > 0 ? chainMaxDistancePx : 80,
              } as SkillEffectDef),
            { min: 1, step: 10 },
          ),
        ),
      );
    }
    if (!isMove && targetShape === 'scatter') {
      grid.appendChild(
        createFieldRow(
          '乱打半径 px',
          createNumberInput(
            effect.scatterRadiusPx ?? 70,
            (scatterRadiusPx) =>
              onUpdate({
                ...effect,
                targetShape: 'scatter',
                scatterRadiusPx: scatterRadiusPx > 0 ? scatterRadiusPx : 70,
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'scatter',
                scatterHitCount: Math.max(2, Math.round(scatterHitCount)),
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'scatter',
                scatterDurationSec: scatterDurationSec > 0 ? scatterDurationSec : 1,
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'scatter',
                scatterSpreadRate: Math.min(1, Math.max(0, scatterSpreadRate)),
              } as SkillEffectDef),
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
              onUpdate({
                ...effect,
                targetShape: 'pierce',
                pierceDurationSec: pierceDurationSec > 0 ? pierceDurationSec : undefined,
              } as SkillEffectDef),
            { min: 0, step: 0.1 },
          ),
        ),
      );
    }
    grid.appendChild(
      createFieldRow(
        '射程 px（任意）',
        createNumberInput(
          effect.range ?? 0,
          (range) =>
            onUpdate({
              ...effect,
              range: range > 0 ? range : undefined,
            } as SkillEffectDef),
          { min: 0, step: 10 },
        ),
      ),
    );

    const detailGrid = appendGrid(parent);
    detailGrid.classList.add('editor-subgrid');

    switch (effect.type) {
      case 'damage':
        detailGrid.appendChild(
          createFieldRow(
            'ダメージ種',
            createSelect(
              effect.damageType,
              DAMAGE_TYPE_OPTIONS.map((value) => ({ value, label: value })),
              (damageType) => onUpdate({ ...effect, damageType }),
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '威力倍率',
            createNumberInput(
              effect.powerMultiplier,
              (powerMultiplier) => onUpdate({ ...effect, powerMultiplier }),
              { step: 0.01 },
            ),
          ),
        );
        break;
      case 'heal':
        appendResourceAmountFields(detailGrid, normalizeResourceAmount(effect), (amount, options) =>
          onUpdate({ ...effect, amount }, options),
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
              (buffStat) => onUpdate({ ...effect, buffStat }),
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '倍率',
            createNumberInput(
              effect.buffMultiplier ?? 1,
              (buffMultiplier) => onUpdate({ ...effect, buffMultiplier }),
              { step: 0.01 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.buffDurationSec,
              (buffDurationSec) => onUpdate({ ...effect, buffDurationSec }),
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
              (debuffStat) => onUpdate({ ...effect, debuffStat }),
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '倍率',
            createNumberInput(
              effect.debuffMultiplier ?? 1,
              (debuffMultiplier) => onUpdate({ ...effect, debuffMultiplier }),
              { step: 0.01 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '秒数',
            createNumberInput(
              effect.debuffDurationSec,
              (debuffDurationSec) => onUpdate({ ...effect, debuffDurationSec }),
              { min: 0.1, step: 0.5 },
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
              (durationSec) => onUpdate({ ...effect, durationSec }),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        appendResourceAmountFields(detailGrid, normalizeResourceAmount(effect), (amount, options) =>
          onUpdate({ ...effect, amount }, options),
        );
        break;
      case 'barrier':
        appendResourceAmountFields(detailGrid, normalizeResourceAmount(effect), (amount, options) =>
          onUpdate({ ...effect, amount }, options),
        );
        detailGrid.appendChild(
          (() => {
            const row = createEl('div', 'editor-field editor-field-checkbox');
            const label = createEl('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = effect.barrierStack ?? false;
            input.addEventListener('change', () => {
              onUpdate({
                ...effect,
                barrierStack: input.checked ? true : undefined,
              });
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
              (durationSec) => onUpdate({ ...effect, durationSec }),
              { min: 0.1, step: 0.5 },
            ),
          ),
        );
        detailGrid.appendChild(
          createFieldRow(
            '威力倍率',
            createNumberInput(
              effect.powerMultiplier,
              (powerMultiplier) => onUpdate({ ...effect, powerMultiplier }),
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
              (damageType) => onUpdate({ ...effect, damageType }),
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
                onUpdate({
                  ...moveEffect,
                  moveDurationSec: moveDurationSec > 0 ? moveDurationSec : 0.1,
                }),
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
              (moveMode) => onUpdate({ ...moveEffect, moveMode }),
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
                  onUpdate({
                    ...moveEffect,
                    behindOffsetPx: behindOffsetPx > 0 ? behindOffsetPx : undefined,
                  }),
                { min: 0, step: 10 },
              ),
            ),
          );
        }
        break;
      }
    }

    if (showPerEffectPresentation) {
      appendEffectPresentationFields(parent, effect, onUpdate);
    }
  }
}
