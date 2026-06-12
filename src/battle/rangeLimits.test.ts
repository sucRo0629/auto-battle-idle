import { describe, expect, it } from 'vitest';
import {
  CANVAS_W,
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import {
  attackTypeRangedBandEditorHintJa,
  CONFIGURABLE_RANGE_PX_MAX,
  assertConfigurableRangePx,
  configurableRangeHintJa,
  counterAttackRangeBandEditorHintJa,
  formatRangeBandJa,
  parseConfigurableRangePxInput,
} from './rangeLimits.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';

describe('rangeLimits', () => {
  it('CONFIGURABLE_RANGE_PX_MAX spans left anchor to canvas right edge', () => {
    expect(CONFIGURABLE_RANGE_PX_MAX).toBe(
      CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR,
    );
  });

  it('hint references the same max constant', () => {
    expect(configurableRangeHintJa()).toContain(String(CONFIGURABLE_RANGE_PX_MAX));
  });

  it('editor band hints reference RANGED_ATTACK_MIN_PX', () => {
    const threshold = String(RANGED_ATTACK_MIN_PX);
    expect(counterAttackRangeBandEditorHintJa()).toContain(threshold);
    expect(attackTypeRangedBandEditorHintJa()).toContain(threshold);
  });

  it('hint describes bands with ranged minimum px', () => {
    const hint = configurableRangeHintJa();
    expect(hint).toContain('遠隔帯');
    expect(hint).toContain(`${RANGED_ATTACK_MIN_PX} 以上`);
    expect(hint).not.toMatch(/\d+ 以上=遠隔帯/);
  });

  it('formatRangeBandJa follows melee/ranged band threshold', () => {
    expect(formatRangeBandJa(0)).toBe('近接帯');
    expect(formatRangeBandJa(RANGED_ATTACK_MIN_PX - 1)).toBe('近接帯');
    expect(formatRangeBandJa(RANGED_ATTACK_MIN_PX)).toBe('遠隔帯');
  });

  it('assertConfigurableRangePx rejects out-of-range values', () => {
    expect(() =>
      assertConfigurableRangePx('射程', CONFIGURABLE_RANGE_PX_MAX + 1),
    ).toThrow(String(CONFIGURABLE_RANGE_PX_MAX));
  });

  it('parseConfigurableRangePxInput adds delta to traits.rangePx for +syntax', () => {
    expect(parseConfigurableRangePxInput('+10', 40)).toBe(50);
    expect(parseConfigurableRangePxInput('+ 5', 24)).toBe(29);
    expect(parseConfigurableRangePxInput('55', 40)).toBe(55);
    expect(parseConfigurableRangePxInput('nope', 40)).toBeNull();
  });
});
