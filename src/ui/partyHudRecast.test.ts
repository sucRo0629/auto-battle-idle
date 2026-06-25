import { describe, expect, it } from 'vitest';
import { resolveRecastFillView } from './partyHudRecast.ts';

const baseCd = {
  skillId: 'df_duelist_active_4',
  remaining: 0,
  triggerKind: 'time' as const,
  triggerValue: 0,
  slotIndex: 3,
};

describe('resolveRecastFillView', () => {
  it('keeps stage-exhausted actives at empty (darkest) even when CD is ready', () => {
    expect(
      resolveRecastFillView(
        { ...baseCd, stageTriggerExhausted: true },
        false,
      ),
    ).toEqual({
      widthPct: 0,
      state: 'empty',
      showFireHold: false,
    });
  });

  it('shows ready fill when CD is ready and stage uses remain', () => {
    expect(resolveRecastFillView(baseCd, false)).toEqual({
      widthPct: 100,
      state: 'ready',
      showFireHold: false,
    });
  });

  it('suppresses fireHold when stage uses are exhausted', () => {
    expect(
      resolveRecastFillView(
        { ...baseCd, fireHold: true, stageTriggerExhausted: true },
        false,
      ),
    ).toMatchObject({ state: 'empty', showFireHold: false });
  });
});
