import { describe, expect, it } from 'vitest';
import {
  defaultFacingSign,
  isHostileBehindDefaultForward,
  resolveFacingSign,
} from './combatFacing.ts';
import { mockUnit } from './testFixtures.ts';

describe('combatFacing', () => {
  it('defaults player to +X and enemy to -X', () => {
    const ally = mockUnit('ally', 200);
    const enemy = mockUnit('e1', 300, { isEnemy: true });
    expect(defaultFacingSign(ally)).toBe(1);
    expect(defaultFacingSign(enemy)).toBe(-1);
  });

  it('detects hostile behind default forward', () => {
    const ally = mockUnit('ally', 220);
    const behind = mockUnit('e-behind', 200, { isEnemy: true });
    const front = mockUnit('e-front', 250, { isEnemy: true });
    expect(isHostileBehindDefaultForward(ally, behind)).toBe(true);
    expect(isHostileBehindDefaultForward(ally, front)).toBe(false);
  });

  it('flips facing when attack focus is behind', () => {
    const ally = mockUnit('ally', 220);
    const behind = mockUnit('e-behind', 200, { isEnemy: true });
    expect(resolveFacingSign(ally, behind)).toBe(-1);
    expect(resolveFacingSign(ally, null)).toBe(1);
  });
});
