import { describe, expect, it } from 'vitest';
import { resolveRecastFillView } from './partyHudRecast.ts';

const baseCd = {
  skillId: 'df_duelist_active_4',
  remaining: 0,
  triggerKind: 'time' as const,
  triggerValue: 8,
  slotIndex: 0,
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

  it('shows charging fill while cooldown is recovering', () => {
    expect(resolveRecastFillView({ ...baseCd, remaining: 4 }, false)).toEqual({
      widthPct: 50,
      state: 'charging',
      showFireHold: false,
    });
  });

  it('avoids NaN fill when triggerValue is zero while remaining is positive', () => {
    expect(
      resolveRecastFillView(
        {
          ...baseCd,
          remaining: 3,
          triggerKind: 'time',
          triggerValue: 0,
        },
        false,
      ),
    ).toEqual({
      widthPct: 0,
      state: 'charging',
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
