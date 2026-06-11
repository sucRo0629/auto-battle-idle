import { describe, expect, it } from 'vitest';
import {
  compareByClassListOrder,
  sortClassIdsByListOrder,
} from './classListOrder.ts';

describe('classListOrder', () => {
  const classOrder = ['df_guardian', 'at_warrior', 'at_ranger', 'sp_cleric'];

  it('sortClassIdsByListOrder follows classes.json order', () => {
    expect(
      sortClassIdsByListOrder(
        ['sp_cleric', 'df_guardian', 'at_ranger'],
        classOrder,
      ),
    ).toEqual(['df_guardian', 'at_ranger', 'sp_cleric']);
  });

  it('compareByClassListOrder puts unknown ids after known ids', () => {
    expect(
      compareByClassListOrder('zz_unknown', 'df_guardian', classOrder),
    ).toBeGreaterThan(0);
    expect(
      compareByClassListOrder('df_guardian', 'zz_unknown', classOrder),
    ).toBeLessThan(0);
  });
});
