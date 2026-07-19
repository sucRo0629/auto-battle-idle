import { describe, expect, it } from 'vitest';
import type { OperationPassiveCatalogDef } from '../battle/types.ts';
import {
  resolveOperationPassiveAcquireCost,
  resolveOperationPassiveBaseCost,
} from './operationPassiveAcquireCost.ts';

const catalog: OperationPassiveCatalogDef = {
  passiveAcquireCost: 1,
  waveClearResourceGrant: 12,
  sameClassStackStep: 1,
  fixedCostByPassiveId: {},
  unlockLevelCostTable: { '0': 1, '10': 10, '20': 20 },
  costUnlockLevelByPassiveId: {
    cheap: 0,
    mid: 10,
    pricey: 20,
  },
  candidatesByClass: {
    df_guardian: ['cheap', 'mid', 'pricey'],
  },
};

describe('operationPassiveAcquireCost (R11c)', () => {
  it('resolves base cost from unlockLevel band table', () => {
    expect(resolveOperationPassiveBaseCost(catalog, 'cheap')).toBe(1);
    expect(resolveOperationPassiveBaseCost(catalog, 'mid')).toBe(10);
    expect(resolveOperationPassiveBaseCost(catalog, 'pricey')).toBe(20);
  });

  it('falls back to passiveAcquireCost when unlockLevel is missing', () => {
    expect(resolveOperationPassiveBaseCost(catalog, 'unknown')).toBe(1);
  });

  it('adds sameClassStackStep per already-acquired count', () => {
    expect(resolveOperationPassiveAcquireCost(catalog, 'cheap', 0)).toBe(1);
    expect(resolveOperationPassiveAcquireCost(catalog, 'cheap', 1)).toBe(2);
    expect(resolveOperationPassiveAcquireCost(catalog, 'mid', 2)).toBe(12);
    expect(resolveOperationPassiveAcquireCost(catalog, 'pricey', 3)).toBe(23);
  });

  it('treats negative acquired count as zero', () => {
    expect(resolveOperationPassiveAcquireCost(catalog, 'mid', -2)).toBe(10);
  });

  it('supports zero stack step (legacy flat cost)', () => {
    const flat: OperationPassiveCatalogDef = {
      ...catalog,
      sameClassStackStep: 0,
    };
    expect(resolveOperationPassiveAcquireCost(flat, 'pricey', 5)).toBe(20);
  });

  it('prefers fixedCostByPassiveId over unlockLevel bands', () => {
    const fixed: OperationPassiveCatalogDef = {
      ...catalog,
      fixedCostByPassiveId: { pricey: 10 },
    };
    expect(resolveOperationPassiveBaseCost(fixed, 'pricey')).toBe(10);
    expect(resolveOperationPassiveAcquireCost(fixed, 'pricey', 2)).toBe(12);
  });
});
