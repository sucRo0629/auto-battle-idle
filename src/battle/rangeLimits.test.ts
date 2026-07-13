import { describe, expect, it } from 'vitest';
import {
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import { COMBAT_SAFE_RIGHT } from './combatSafeArea.ts';
import {
  attackTypeRangedBandEditorHintJa,
  CONFIGURABLE_RANGE_PX_MAX,
  assertConfigurableRangePx,
  configurableRangeHintJa,
  counterAttackRangeBandEditorHintJa,
  formatAttackMethodLabel,
  parseConfigurableRangePxInput,
} from './rangeLimits.ts';

describe('rangeLimits', () => {
  it('CONFIGURABLE_RANGE_PX_MAX spans safe area from party anchor to right edge', () => {
    expect(CONFIGURABLE_RANGE_PX_MAX).toBe(
      COMBAT_SAFE_RIGHT - PARTY_FORMATION_LEFT_ANCHOR,
    );
  });

  it('hint references the same max constant', () => {
    expect(configurableRangeHintJa()).toContain(String(CONFIGURABLE_RANGE_PX_MAX));
  });

  it('editor hints reference attackMethod for ranged filters', () => {
    expect(counterAttackRangeBandEditorHintJa()).toContain('attackMethod');
    expect(attackTypeRangedBandEditorHintJa()).toContain('attackMethod');
  });

  it('hint describes continuous px range without band thresholds', () => {
    const hint = configurableRangeHintJa();
    expect(hint).toContain('連続値');
    expect(hint).not.toContain('遠隔帯');
    expect(hint).not.toContain('近接帯');
  });

  it('formatAttackMethodLabel maps melee and ranged', () => {
    expect(formatAttackMethodLabel('melee', 'ja')).toBe('近接');
    expect(formatAttackMethodLabel('ranged', 'ja')).toBe('遠隔');
    expect(formatAttackMethodLabel('melee', 'en')).toBe('Melee');
    expect(formatAttackMethodLabel('ranged', 'en')).toBe('Ranged');
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
