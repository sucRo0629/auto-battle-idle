import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  computeBasicAttackDps,
  computeEffectiveBasicAttackIntervalSec,
} from './basicAttackPreview.ts';
import { loadLevelCurves } from './levelGrowth.ts';

const LEVEL_CURVES = loadLevelCurves(levelCurvesJson);

describe('basicAttackPreview', () => {
  it('computes effective interval from attack speed tier', () => {
    expect(computeEffectiveBasicAttackIntervalSec('normal', LEVEL_CURVES)).toBe(2);
    expect(computeEffectiveBasicAttackIntervalSec('fast', LEVEL_CURVES)).toBe(1.6);
  });

  it('computes DPS for normal tier', () => {
    expect(computeBasicAttackDps(10, 'normal', LEVEL_CURVES)).toBe(5);
  });

  it('computes DPS for fast tier', () => {
    expect(computeBasicAttackDps(10, 'fast', LEVEL_CURVES)).toBe(6.25);
  });

  it('returns zero DPS when atk is zero', () => {
    expect(computeBasicAttackDps(0, 'normal', LEVEL_CURVES)).toBe(0);
  });
});
