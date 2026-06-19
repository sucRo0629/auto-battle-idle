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
  ClassId,
  GrowthPresetKey,
  GrowthTier,
  Role,
} from '../battle/types.ts';
import {
  CONFIGURABLE_RANGE_PX_MAX,
  parseConfigurableRangePxInput,
} from '../battle/rangeLimits.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  computeBasicAttackDps,
  formatBasicAttackDps,
} from '../progression/basicAttackPreview.ts';
import {
  computeStatsAtLevel,
  loadLevelCurves,
  resolveStatGrowth,
} from '../progression/levelGrowth.ts';
import { computePreviewCombatStats } from '../progression/passiveStatPreview.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import type { SkillRegistry } from '../battle/types.ts';
import {
  BALANCE_DISPLAY_MODE_OPTIONS,
  BALANCE_RANGE_COLUMN_HINT,
  BALANCE_ROLE_ORDER,
  type BalanceDisplayMode,
  filterBalanceRowsForDisplay,
  groupBalanceRowsByRole,
  sortBalanceRowsByClassOrder,
} from './balanceReference.ts';
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
  supporter: 'ヒーラー',
};

function computeRowDerived(
  cls: ClassPresetBeforeEnrich,
  skillRegistry?: SkillRegistry,
): {
  growth: { maxHp: number; atk: number; def: number };
  lv10: { maxHp: number; atk: number; def: number };
  lv1Dps: number;
  lv10Dps: number;
} {
  ensureClassGrowthFields(cls);
  const growth = resolveStatGrowth(cls, LEVEL_CURVES);
  const attackSpeedTier = cls.attackSpeedTier ?? 'normal';
  const lv1Preview = skillRegistry
    ? computePreviewCombatStats(cls, 1, LEVEL_CURVES, skillRegistry)
    : null;
  const lv10Preview = skillRegistry
    ? computePreviewCombatStats(cls, PREVIEW_LEVEL, LEVEL_CURVES, skillRegistry)
    : null;
  const baseAtLevel = (level: number) =>
    computeStatsAtLevel(
      {
        maxHp: cls.maxHp,
        atk: cls.atk,
        def: cls.def,
        reg: cls.reg,
      },
      cls,
      level,
      LEVEL_CURVES,
    );
  const lv1Atk = lv1Preview?.effective.atk ?? cls.atk;
  const lv10 = lv10Preview?.effective ?? baseAtLevel(PREVIEW_LEVEL);
  const lv1AttackSpeedMul = lv1Preview?.attackSpeedMultiplier ?? 1;
  const lv10AttackSpeedMul = lv10Preview?.attackSpeedMultiplier ?? 1;
  return {
    growth,
    lv10,
    lv1Dps: computeBasicAttackDps(
      lv1Atk,
      attackSpeedTier,
      LEVEL_CURVES,
      lv1AttackSpeedMul,
    ),
    lv10Dps: computeBasicAttackDps(
      lv10.atk,
      attackSpeedTier,
      LEVEL_CURVES,
      lv10AttackSpeedMul,
    ),
  };
}

const ROLE_SECTION_HINTS: Record<Role, string> = {
  defender: '基準: 鉄衛士',
  attacker: '基準: 剣術士・弓術士・魔術士',
  supporter: '基準: 療養師',
};

export interface BalanceEditorStepOptions {
  getRows: () => BalanceClassRow[];
  getSkillRegistry?: () => SkillRegistry;
  /** 既存クラス選択プルダウンと同じ classId 並び */
  getClassOrder: () => ClassId[];
  displayMode: BalanceDisplayMode;
  onDisplayModeChange: (mode: BalanceDisplayMode) => void;
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
    this.saveBtn = null;
  }

  refreshRow(classId: string): void {
    const row = this.options.getRows().find((entry) => entry.id === classId);
    if (!row) return;

    const tr = this.container.querySelector<HTMLTableRowElement>(
      `tr[data-class-id="${CSS.escape(classId)}"]`,
    );
    if (!tr) return;

    const derived = computeRowDerived(
      row.current,
      this.options.getSkillRegistry?.(),
    );
    tr.classList.toggle('is-dirty', isBalanceRowDirty(row));

    this.setCellText(tr, 'growth-hp', `+${derived.growth.maxHp}/Lv`);
    this.setCellText(tr, 'growth-atk', `+${derived.growth.atk}/Lv`);
    this.setCellText(tr, 'growth-def', `+${derived.growth.def}/Lv`);
    this.setCellText(tr, 'lv10-hp', String(derived.lv10.maxHp));
    this.setCellText(tr, 'lv10-atk', String(derived.lv10.atk));
    this.setCellText(tr, 'lv10-def', String(derived.lv10.def));
    this.setCellText(tr, 'lv1-dps', formatBasicAttackDps(derived.lv1Dps));
    this.setCellText(tr, 'lv10-dps', formatBasicAttackDps(derived.lv10Dps));

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
    setNumber('rangePx', cls.traits.rangePx ?? 0);
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
      this.saveBtn = null;
      this.renderContent();
    });
  }

  private renderContent(): void {
    const {
      getRows,
      getClassOrder,
      displayMode,
      onDisplayModeChange,
      jobTier,
      onJobTierChange,
      onRowChange,
      onSave,
    } = this.options;
    this.container.replaceChildren();

    const header = createEl('div', 'editor-step-header');
    header.appendChild(createEl('h2', 'editor-step-title', 'バランス調整'));
    header.appendChild(
      createEl(
        'p',
        'editor-step-desc',
        '同じ jobTier のクラスステータスを比較・編集します。表示は「すべて」「基準クラスのみ」「ロール別」で切り替えられます。スキル・表示名はクラスタブで編集してください。',
      ),
    );
    this.container.appendChild(header);

    const toolbar = createEl('div', 'editor-balance-toolbar');
    const tierPicker = createEl('div', 'editor-balance-tier-picker');
    tierPicker.appendChild(createEl('span', 'editor-picker-label', 'jobTier'));
    tierPicker.appendChild(
      createSelect(
        jobTier,
        JOB_TIER_OPTIONS.map((tier) => ({ value: tier, label: String(tier) })),
        (tier) => onJobTierChange(tier),
      ),
    );
    toolbar.appendChild(tierPicker);

    const modePicker = createEl('div', 'editor-balance-mode-picker');
    modePicker.appendChild(createEl('span', 'editor-picker-label', '表示'));
    modePicker.appendChild(
      createSelect(
        displayMode,
        BALANCE_DISPLAY_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
        (mode) => onDisplayModeChange(mode as BalanceDisplayMode),
      ),
    );
    toolbar.appendChild(modePicker);
    this.container.appendChild(toolbar);

    const classOrder = getClassOrder();
    const filteredRows = sortBalanceRowsByClassOrder(
      filterBalanceRowsForDisplay(getRows(), jobTier, displayMode),
      classOrder,
    );
    let renderedRowCount = 0;

    this.container.appendChild(
      createEl(
        'p',
        'editor-hint editor-balance-global-hint',
        `Lv${PREVIEW_LEVEL} 試算列は Lv1 + 成長 × ${PREVIEW_LEVEL - 1} に、Lv 時点の自身向けパッシブ stat バフ（満HP想定）を反映します。DPS = floor(ATK) ÷ 実効基本攻撃 interval（2s ÷ SPD 係数 × パッシブ攻撃速度）。基本攻撃のみ。未保存の行は色付きで表示されます。${BALANCE_RANGE_COLUMN_HINT}`,
      ),
    );

    if (displayMode === 'byRole') {
      renderedRowCount = this.renderRoleGroupedTables(
        filteredRows,
        classOrder,
        jobTier,
        onRowChange,
      );
    } else {
      const sectionTitle =
        displayMode === 'reference'
          ? `基準クラス比較（jobTier ${jobTier}）`
          : `同格クラス比較（jobTier ${jobTier}）`;
      renderedRowCount = this.renderFlatTable(
        filteredRows,
        sectionTitle,
        onRowChange,
        { showRole: true },
      );
    }

    if (renderedRowCount === 0) {
      const emptyMessage =
        displayMode === 'reference'
          ? 'この jobTier に該当する基準クラスがありません。'
          : 'この jobTier に該当するクラスがありません。';
      this.container.appendChild(createEl('p', 'editor-hint', emptyMessage));
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

  private renderFlatTable(
    rows: BalanceClassRow[],
    sectionTitle: string,
    onRowChange: BalanceEditorStepOptions['onRowChange'],
    options: { showRole: boolean },
  ): number {
    const section = createEl('section', 'editor-section');
    section.appendChild(createEl('h3', 'editor-section-title', sectionTitle));
    const count = this.appendCompareTable(section, rows, onRowChange, options);
    this.container.appendChild(section);
    return count;
  }

  private renderRoleGroupedTables(
    rows: BalanceClassRow[],
    classOrder: ClassId[],
    jobTier: number,
    onRowChange: BalanceEditorStepOptions['onRowChange'],
  ): number {
    const groupedRows = groupBalanceRowsByRole(rows, classOrder);
    let renderedRowCount = 0;

    for (const role of BALANCE_ROLE_ORDER) {
      const roleRows = groupedRows.get(role) ?? [];
      if (roleRows.length === 0) continue;

      const section = createEl('section', 'editor-section editor-balance-role-section');
      section.dataset.role = role;
      section.appendChild(
        createEl(
          'h3',
          'editor-section-title',
          `${ROLE_LABELS[role]}ロール（jobTier ${jobTier}）`,
        ),
      );
      section.appendChild(createEl('p', 'editor-hint', ROLE_SECTION_HINTS[role]));

      renderedRowCount += this.appendCompareTable(
        section,
        roleRows,
        onRowChange,
        { showRole: false },
      );
      this.container.appendChild(section);
    }

    return renderedRowCount;
  }

  private appendCompareTable(
    section: HTMLElement,
    rows: BalanceClassRow[],
    onRowChange: BalanceEditorStepOptions['onRowChange'],
    options: { showRole: boolean },
  ): number {
    const wrap = createEl('div', 'editor-compare-wrap');
    const table = createEl('table', 'editor-compare-table');
    const thead = createEl('thead');
    const headRow = createEl('tr');
    const columns: { label: string; compact?: boolean }[] = [
      { label: 'クラス' },
      ...(options.showRole ? [{ label: 'ロール' }] : []),
      { label: 'Lv1 HP', compact: true },
      { label: 'Lv1 ATK', compact: true },
      { label: 'Lv1 DEF', compact: true },
      { label: '射程', compact: true },
      { label: '耐魔' },
      { label: 'HP 成長' },
      { label: 'ATK 成長' },
      { label: 'DEF 成長' },
      { label: 'preset' },
      { label: `Lv${PREVIEW_LEVEL} HP`, compact: true },
      { label: `Lv${PREVIEW_LEVEL} ATK`, compact: true },
      { label: `Lv${PREVIEW_LEVEL} DEF`, compact: true },
      { label: 'SPD' },
      { label: 'Lv1 DPS', compact: true },
      { label: `Lv${PREVIEW_LEVEL} DPS`, compact: true },
    ];
    for (const column of columns) {
      headRow.appendChild(
        createEl('th', column.compact ? 'col-compact' : undefined, column.label),
      );
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = createEl('tbody') as HTMLTableSectionElement;
    for (const row of rows) {
      tbody.appendChild(this.buildDataRow(row, onRowChange, options.showRole));
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    return rows.length;
  }

  private buildDataRow(
    row: BalanceClassRow,
    onRowChange: BalanceEditorStepOptions['onRowChange'],
    showRole = false,
  ): HTMLTableRowElement {
    const cls = row.current;
    ensureClassGrowthFields(cls);
    const growthTier = cls.growthTier!;
    const derived = computeRowDerived(
      cls,
      this.options.getSkillRegistry?.(),
    );

    const tr = createEl('tr') as HTMLTableRowElement;
    tr.dataset.classId = cls.id;
    if (isBalanceRowDirty(row)) tr.classList.add('is-dirty');

    const mutate = (apply: (current: ClassPresetBeforeEnrich) => void) => {
      onRowChange(cls.id, apply);
    };

    const nameCell = createEl('td');
    nameCell.textContent = cls.displayName;
    tr.appendChild(nameCell);

    if (showRole) {
      const roleCell = createEl('td');
      roleCell.textContent = ROLE_LABELS[cls.role];
      tr.appendChild(roleCell);
    }

    tr.appendChild(
      this.numberCell('maxHp', cls.maxHp, (value) => {
        mutate((current) => {
          current.maxHp = value;
        });
      }, true),
    );
    tr.appendChild(
      this.numberCell('atk', cls.atk, (value) => {
        mutate((current) => {
          current.atk = value;
        });
      }, true),
    );
    tr.appendChild(
      this.numberCell('def', cls.def, (value) => {
        mutate((current) => {
          current.def = value;
        });
      }, true),
    );
    tr.appendChild(
      this.numberCell(
        'rangePx',
        cls.traits.rangePx ?? 0,
        (value) => {
          mutate((current) => {
            current.traits.rangePx = value;
          });
        },
        true,
        {
          min: 0,
          max: CONFIGURABLE_RANGE_PX_MAX,
          step: 1,
          parseInput: (raw) =>
            parseConfigurableRangePxInput(raw, cls.traits.rangePx ?? 0),
        },
      ),
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

    tr.appendChild(this.readonlyNumCell('lv10-hp', derived.lv10.maxHp, true));
    tr.appendChild(this.readonlyNumCell('lv10-atk', derived.lv10.atk, true));
    tr.appendChild(this.readonlyNumCell('lv10-def', derived.lv10.def, true));

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

    tr.appendChild(this.readonlyDpsCell('lv1-dps', derived.lv1Dps));
    tr.appendChild(this.readonlyDpsCell('lv10-dps', derived.lv10Dps));

    return tr;
  }

  private numberCell(
    field: string,
    value: number,
    onInput: (value: number) => void,
    compact = false,
    inputOptions?: {
      min?: number;
      max?: number;
      step?: number;
      parseInput?: (raw: string) => number | null;
    },
  ): HTMLTableCellElement {
    const cell = createEl('td', compact ? 'num col-compact' : 'num');
    const input = createNumberInput(value, onInput, inputOptions);
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

  private readonlyDpsCell(col: string, dps: number): HTMLTableCellElement {
    const cell = createEl('td', 'num col-compact');
    cell.dataset.col = col;
    cell.textContent = formatBasicAttackDps(dps);
    return cell;
  }

  private readonlyNumCell(
    col: string,
    value: number,
    compact = false,
  ): HTMLTableCellElement {
    const cell = createEl('td', compact ? 'num col-compact' : 'num');
    cell.dataset.col = col;
    cell.textContent = String(value);
    return cell;
  }
}
