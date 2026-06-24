import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { isMeleeRangePx } from './types.ts';

describe('sp_alchemist_active_1 melee HoT', () => {
  it('class data uses melee band as front-row supporter', () => {
    const alchemistClass = loadGameData().classRegistry['sp_alchemist'];
    expect(isMeleeRangePx(alchemistClass?.traits.rangePx ?? 0)).toBe(true);
    expect(alchemistClass?.formationRow).toBe('front');
  });

  it('active_1 applies melee-band HoT with stackOnApply', () => {
    const active1 = loadGameData().skillRegistry.actives['sp_alchemist_active_1']!;
    const hot = active1.effect.find((e) => e.type === 'heal' && e.healSubKind === 'hot');
    expect(hot?.targetShape).toBe('aoe');
    expect(hot?.aoeRadiusPx).toBe(70);
    expect(hot?.target?.order).toBe('selfOrigin');
    expect(hot?.stackOnApply).toBe(1);
    expect(active1.effect.some((e) => e.type === 'debuff')).toBe(false);
  });
});
