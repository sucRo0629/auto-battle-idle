import {
  ATTACK_SPEED_TIER_LABELS,
  ATTACK_SPEED_TIER_OPTIONS,
  GROWTH_PRESET_KEY_LABELS,
  GROWTH_PRESET_KEY_OPTIONS,
  GROWTH_TIER_LABELS,
  GROWTH_TIER_OPTIONS,
  JOB_TIER_OPTIONS,
  REG_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import type {
  GrowthPresetKey,
  GrowthTier,
  Role,
} from '../battle/types.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  computeStatsAtLevel,
  loadLevelCurves,
  resolveStatGrowth,
} from '../progression/levelGrowth.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import {
  type BalanceClassRow,
  ensureClassGrowthFields,
  isBalanceRowDirty,
} from './editorApi.ts';
import {
  createActionButton,
  createEl,
  createNumberInput,
  createSelect,
  preserveScrollDuring,
} from './formUtils.ts';

const LEVEL_CURVES = loadLevelCurves(levelCurvesJson);
const PREVIEW_LEVEL = 10;

const ROLE_LABELS: Record<Role, string> = {
  defender: '守備',
  attacker: '攻撃',
  supporter: '支援',
};

function computeRowDerived(cls: ClassPresetBeforeEnrich): {
  growth: { maxHp: number; atk: number; def: number };
  lv10: { maxHp: number; atk: number; def: number };
} {
  ensureClassGrowthFields(cls);
  const growth = resolveStatGrowth(cls, LEVEL_CURVES);
  const lv10 = computeStatsAtLevel(
    {
      maxHp: cls.maxHp,
      atk: cls.atk,
      def: cls.def,
      reg: cls.reg,
    },
    cls,
    PREVIEW_LEVEL,
    LEVEL_CURVES,
  );
  return { growth, lv10 };
}

function peerJobTier(cls: ClassPresetBeforeEnrich): number {
  return cls.jobTier ?? 1;
}

export interface BalanceEditorStepOptions {
  getRows: () => BalanceClassRow[];
  jobTier: number;
  onJobTierChange: (tier: number) => void;
  onRowChange: (
    classId: string,
    mutate: (current: ClassPresetBeforeEnrich) => void,
  ) => void;
  onSave: () => void;
  saving?: boolean;
}

export class BalanceEditorStep {
  private tableBody: HTMLTableSectionElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;

  constructor(
    private container: HTMLElement,
    private options: BalanceEditorStepOptions,
  ) {
    this.render();
  }

  update(options: BalanceEditorStepOptions): void {
    this.options = options;
    this.render();
  }

  destroy(): void {
    this.container.replaceChildren();
    this.tableBody = null;
    this.saveBtn = null;
  }

  refreshRow(classId: string): void {
    const row = this.options.getRows().find((entry) => entry.id === classId);
    if (!row || !this.tableBody) return;

    const tr = this.tableBody.querySelector<HTMLTableRowElement>(
      `tr[data-class-id="${CSS.escape(classId)}"]`,
    );
    if (!tr) return;

    const derived = computeRowDerived(row.current);
    tr.classList.toggle('is-dirty', isBalanceRowDirty(row));

    this.setCellText(tr, 'growth-hp', `+${derived.growth.maxHp}/Lv`);
    this.setCellText(tr, 'growth-atk', `+${derived.growth.atk}/Lv`);
    this.setCellText(tr, 'growth-def', `+${derived.growth.def}/Lv`);
    this.setCellText(tr, 'lv10-hp', String(derived.lv10.maxHp));
    this.setCellText(tr, 'lv10-atk', String(derived.lv10.atk));
    this.setCellText(tr, 'lv10-def', String(derived.lv10.def));

    if (!tr.contains(document.activeElement)) {
      this.syncRowInputs(tr, row.current);
    }

    this.refreshSaveButton();
  }

  refreshSaveButton(): void {
    if (!this.saveBtn) return;
    const { saving, getRows } = this.options;
    const dirtyCount = getRows().filter(isBalanceRowDirty).length;
    this.saveBtn.disabled = Boolean(saving) || dirtyCount === 0;
    this.saveBtn.textContent =
      saving ? '保存中…' : dirtyCount > 0 ? `保存（${dirtyCount} 件の変更）` : '保存';
  }

  private setCellText(tr: HTMLTableRowElement, col: string, text: string): void {
    const cell = tr.querySelector(`[data-col="${col}"]`);
    if (cell) cell.textContent = text;
  }

  private syncRowInputs(tr: HTMLTableRowElement, cls: ClassPresetBeforeEnrich): void {
    ensureClassGrowthFields(cls);
    const growthTier = cls.growthTier!;

    const setNumber = (field: string, value: number) => {
      const input = tr.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
      if (input) input.value = String(value);
    };
    const setSelect = (field: string, value: string) => {
      const select = tr.querySelector<HTMLSelectElement>(`select[data-field="${field}"]`);
      if (select) select.value = value;
    };

    setNumber('maxHp', cls.maxHp);
    setNumber('atk', cls.atk);
    setNumber('def', cls.def);
    setSelect('reg', String(cls.reg));
    setSelect('growth-maxHp', String(growthTier.maxHp));
    setSelect('growth-atk', String(growthTier.atk));
    setSelect('growth-def', String(growthTier.def));
    setSelect('attackSpeedTier', cls.attackSpeedTier ?? 'normal');
    if (cls.role === 'attacker') {
      const presetKey: GrowthPresetKey =
        cls.growthPresetKey === 'caster' ? 'caster' : 'attacker';
      setSelect('growthPresetKey', presetKey);
    }
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.tableBody = null;
      this.saveBtn = null;
      this.renderContent();
    });
  }

  private renderContent(): void {
    const { getRows, jobTier, onJobTierChange, onRowChange, onSave } = this.options;
    this.container.replaceChildren();

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', 'バランス調整'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        '同じ jobTier のクラスステータスを比較・編集します。スキル・表示名の編集はクラスタブで行ってください。',
      ),
    );
    this.container.appendChild(header);

    const tierPicker = createEl('div', 'editor-balance-tier-picker');
    tierPicker.appendChild(createEl('span', 'editor-picker-label', 'jobTier'));
    tierPicker.appendChild(
      createSelect(
        jobTier,
        JOB_TIER_OPTIONS.map((tier) => ({ value: tier, label: String(tier) })),
        (tier) => onJobTierChange(tier),
      ),
    );
    this.container.appendChild(tierPicker);

    const filteredRows = getRows()
      .filter((row) => peerJobTier(row.current) === jobTier)
      .sort((a, b) =>
        a.current.displayName.localeCompare(b.current.displayName, 'ja'),
      );

    const section = createEl('section', 'editor-section');
    section.appendChild(
      createEl(
        'h3',
        'editor-section-title',
        `同格クラス比較（jobTier ${jobTier}）`,
      ),
    );
    section.appendChild(
      createEl(
        'p',
        'editor-hint',
        `Lv${PREVIEW_LEVEL} 試算列は Lv1 + 成長 × ${PREVIEW_LEVEL - 1} です。未保存の行は色付きで表示されます。`,
      ),
    );

    const wrap = createEl('div', 'editor-compare-wrap');
    const table = createEl('table', 'editor-compare-table');
    const thead = createEl('thead');
    const headRow = createEl('tr');
    for (const label of [
      'クラス',
      'ロール',
      'Lv1 HP',
      'Lv1 ATK',
      'Lv1 DEF',
      'REG',
      'HP 成長',
      'ATK 成長',
      'DEF 成長',
      'preset',
      `Lv${PREVIEW_LEVEL} HP`,
      `Lv${PREVIEW_LEVEL} ATK`,
      `Lv${PREVIEW_LEVEL} DEF`,
      'SPD',
    ]) {
      headRow.appendChild(createEl('th', undefined, label));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = createEl('tbody') as HTMLTableSectionElement;
    this.tableBody = tbody;

    for (const row of filteredRows) {
      tbody.appendChild(this.buildDataRow(row, onRowChange));
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    this.container.appendChild(section);

    if (filteredRows.length === 0) {
      section.appendChild(
        createEl('p', 'editor-hint', 'この jobTier に該当するクラスがありません。'),
      );
    }

    const actions = createEl('div', 'editor-actions');
    const dirtyCount = getRows().filter(isBalanceRowDirty).length;
    this.saveBtn = createActionButton(
      this.options.saving
        ? '保存中…'
        : dirtyCount > 0
          ? `保存（${dirtyCount} 件の変更）`
          : '保存',
      'editor-btn editor-btn-primary',
      onSave,
    );
    this.saveBtn.disabled = Boolean(this.options.saving) || dirtyCount === 0;
    actions.appendChild(this.saveBtn);
    this.container.appendChild(actions);
  }

  private buildDataRow(
    row: BalanceClassRow,
    onRowChange: BalanceEditorStepOptions['onRowChange'],
  ): HTMLTableRowElement {
    const cls = row.current;
    ensureClassGrowthFields(cls);
    const growthTier = cls.growthTier!;
    const derived = computeRowDerived(cls);

    const tr = createEl('tr') as HTMLTableRowElement;
    tr.dataset.classId = cls.id;
    if (isBalanceRowDirty(row)) tr.classList.add('is-dirty');

    const mutate = (apply: (current: ClassPresetBeforeEnrich) => void) => {
      onRowChange(cls.id, apply);
    };

    const nameCell = createEl('td');
    nameCell.textContent = cls.displayName;
    tr.appendChild(nameCell);

    const roleCell = createEl('td');
    roleCell.textContent = ROLE_LABELS[cls.role];
    tr.appendChild(roleCell);

    tr.appendChild(
      this.numberCell('maxHp', cls.maxHp, { min: 1 }, (value) => {
        mutate((current) => {
          current.maxHp = value;
        });
      }),
    );
    tr.appendChild(
      this.numberCell('atk', cls.atk, { min: 0 }, (value) => {
        mutate((current) => {
          current.atk = value;
        });
      }),
    );
    tr.appendChild(
      this.numberCell('def', cls.def, { min: 0 }, (value) => {
        mutate((current) => {
          current.def = value;
        });
      }),
    );

    const regCell = createEl('td');
    const regSelect = createSelect(
      cls.reg,
      REG_OPTIONS.map((value) => ({ value, label: String(value) })),
      (reg) => {
        mutate((current) => {
          current.reg = reg;
        });
      },
    );
    regSelect.dataset.field = 'reg';
    regCell.appendChild(regSelect);
    tr.appendChild(regCell);

    tr.appendChild(
      this.growthCell('growth-maxHp', 'growth-hp', growthTier.maxHp, derived.growth.maxHp, (tier) => {
        mutate((current) => {
          ensureClassGrowthFields(current);
          current.growthTier!.maxHp = tier;
        });
      }),
    );
    tr.appendChild(
      this.growthCell('growth-atk', 'growth-atk', growthTier.atk, derived.growth.atk, (tier) => {
        mutate((current) => {
          ensureClassGrowthFields(current);
          current.growthTier!.atk = tier;
        });
      }),
    );
    tr.appendChild(
      this.growthCell('growth-def', 'growth-def', growthTier.def, derived.growth.def, (tier) => {
        mutate((current) => {
          ensureClassGrowthFields(current);
          current.growthTier!.def = tier;
        });
      }),
    );

    const presetCell = createEl('td');
    if (cls.role === 'attacker') {
      const presetKey: GrowthPresetKey =
        cls.growthPresetKey === 'caster' ? 'caster' : 'attacker';
      const presetSelect = createSelect(
        presetKey,
        GROWTH_PRESET_KEY_OPTIONS.map((value) => ({
          value,
          label: GROWTH_PRESET_KEY_LABELS[value],
        })),
        (key) => {
          mutate((current) => {
            if (key === 'caster') {
              current.growthPresetKey = 'caster';
            } else {
              delete current.growthPresetKey;
            }
          });
        },
      );
      presetSelect.dataset.field = 'growthPresetKey';
      presetCell.appendChild(presetSelect);
    } else {
      presetCell.textContent = '—';
    }
    tr.appendChild(presetCell);

    tr.appendChild(this.readonlyNumCell('lv10-hp', derived.lv10.maxHp));
    tr.appendChild(this.readonlyNumCell('lv10-atk', derived.lv10.atk));
    tr.appendChild(this.readonlyNumCell('lv10-def', derived.lv10.def));

    const spdCell = createEl('td');
    const spdSelect = createSelect(
      cls.attackSpeedTier ?? 'normal',
      ATTACK_SPEED_TIER_OPTIONS.map((value) => ({
        value,
        label: ATTACK_SPEED_TIER_LABELS[value],
      })),
      (attackSpeedTier) => {
        mutate((current) => {
          current.attackSpeedTier = attackSpeedTier;
        });
      },
    );
    spdSelect.dataset.field = 'attackSpeedTier';
    spdCell.appendChild(spdSelect);
    tr.appendChild(spdCell);

    return tr;
  }

  private numberCell(
    field: string,
    value: number,
    options: { min: number },
    onInput: (value: number) => void,
  ): HTMLTableCellElement {
    const cell = createEl('td', 'num');
    const input = createNumberInput(value, onInput, options);
    input.dataset.field = field;
    cell.appendChild(input);
    return cell;
  }

  private growthCell(
    selectField: string,
    textCol: string,
    tier: GrowthTier,
    perLevel: number,
    onChange: (tier: GrowthTier) => void,
  ): HTMLTableCellElement {
    const cell = createEl('td');
    const select = createSelect(
      tier,
      GROWTH_TIER_OPTIONS.map((value) => ({
        value,
        label: GROWTH_TIER_LABELS[value],
      })),
      onChange,
    );
    select.dataset.field = selectField;
    cell.appendChild(select);
    const note = createEl('span', 'editor-compare-growth-note', `+${perLevel}/Lv`);
    note.dataset.col = textCol;
    cell.appendChild(note);
    return cell;
  }

  private readonlyNumCell(col: string, value: number): HTMLTableCellElement {
    const cell = createEl('td', 'num');
    cell.dataset.col = col;
    cell.textContent = String(value);
    return cell;
  }
}
