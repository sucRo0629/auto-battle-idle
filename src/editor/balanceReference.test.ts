import { describe, expect, it } from 'vitest';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import {
  BALANCE_RANGE_COLUMN_HINT,
  BALANCE_REFERENCE_CLASS_IDS,
  filterBalanceRowsForDisplay,
  groupBalanceRowsByRole,
  isBalanceReferenceClass,
  sortBalanceRowsByClassOrder,
} from './balanceReference.ts';
import { CONFIGURABLE_RANGE_PX_MAX } from '../battle/rangeLimits.ts';
import type { BalanceClassRow } from './editorApi.ts';

function row(
  id: string,
  role: ClassPresetBeforeEnrich['role'],
  jobTier: ClassPresetBeforeEnrich['jobTier'] = 1,
): BalanceClassRow {
  const current: ClassPresetBeforeEnrich = {
    id,
    role,
    displayName: id,
    formationRow: role === 'supporter' ? 'middle' : role === 'attacker' ? 'back' : 'front',
    traits: { rangePx: role === 'attacker' ? 50 : 0 },
    maxHp: 100,
    atk: 10,
    def: 10,
    reg: 0,
    jobTier,
    basicAttackSkillId: `${id}_basic`,
    skills: [],
  };
  return { id, baseline: structuredClone(current), current };
}

describe('balanceReference', () => {
  it('identifies baseline class ids', () => {
    expect(isBalanceReferenceClass('df_guardian')).toBe(true);
    expect(isBalanceReferenceClass('df_paladin')).toBe(false);
    expect(BALANCE_REFERENCE_CLASS_IDS).toContain('df_guardian');
  });

  it('range column hint references configurable max', () => {
    expect(BALANCE_RANGE_COLUMN_HINT).toContain(String(CONFIGURABLE_RANGE_PX_MAX));
  });

  it('filterBalanceRowsForDisplay supports all, reference, and byRole modes', () => {
    const rows = [
      row('df_guardian', 'defender'),
      row('df_paladin', 'defender'),
      row('at_warrior', 'attacker'),
      row('sp_cleric', 'supporter', 2),
    ];
    expect(
      filterBalanceRowsForDisplay(rows, 1, 'all').map((entry) => entry.id),
    ).toEqual(['df_guardian', 'df_paladin', 'at_warrior']);
    expect(
      filterBalanceRowsForDisplay(rows, 1, 'byRole').map((entry) => entry.id),
    ).toEqual(['df_guardian', 'df_paladin', 'at_warrior']);
    expect(
      filterBalanceRowsForDisplay(rows, 1, 'reference').map((entry) => entry.id),
    ).toEqual(['df_guardian', 'at_warrior']);
  });

  it('sortBalanceRowsByClassOrder follows class list order', () => {
    const classOrder = ['at_warrior', 'df_guardian', 'sp_cleric'];
    const rows = [
      row('sp_cleric', 'supporter'),
      row('df_guardian', 'defender'),
      row('at_warrior', 'attacker'),
    ];
    expect(
      sortBalanceRowsByClassOrder(rows, classOrder).map((entry) => entry.id),
    ).toEqual(['at_warrior', 'df_guardian', 'sp_cleric']);
  });

  it('groupBalanceRowsByRole buckets by role using class list order', () => {
    const classOrder = [
      'df_guardian',
      'df_paladin',
      'at_warrior',
      'at_ranger',
      'at_sorcerer',
      'sp_cleric',
    ];
    const rows = [
      row('sp_cleric', 'supporter'),
      row('at_sorcerer', 'attacker'),
      row('at_ranger', 'attacker'),
      row('df_guardian', 'defender'),
      row('at_warrior', 'attacker'),
    ];
    const grouped = groupBalanceRowsByRole(rows, classOrder);
    expect(grouped.get('defender')!.map((entry) => entry.id)).toEqual([
      'df_guardian',
    ]);
    expect(grouped.get('attacker')!.map((entry) => entry.id)).toEqual([
      'at_warrior',
      'at_ranger',
      'at_sorcerer',
    ]);
    expect(grouped.get('supporter')!.map((entry) => entry.id)).toEqual([
      'sp_cleric',
    ]);
  });
});
