import { describe, expect, it } from 'vitest';
import type { PassiveSkillDef } from './types.ts';
import {
  resolvePassiveBarrierTrigger,
  resolvePassivePeriodicTrigger,
  usesHotAuraMode,
  usesIntervalPeriodicTrigger,
} from './passivePeriodicTrigger.ts';

function hotPassive(
  fields: Partial<PassiveSkillDef> = {},
): PassiveSkillDef {
  return {
    id: 'hot',
    name: 'Hot',
    effect: 'heal',
    healSubKind: 'hot',
    hotAmount: { kind: 'flat', flatAmount: 1 },
    ...fields,
  };
}

describe('passivePeriodicTrigger', () => {
  it('treats hot without trigger fields as aura mode', () => {
    const passive = hotPassive();
    expect(resolvePassivePeriodicTrigger(passive)).toBeUndefined();
    expect(usesHotAuraMode(passive)).toBe(true);
    expect(usesIntervalPeriodicTrigger(passive)).toBe(false);
  });

  it('treats legacy intervalSec as interval trigger', () => {
    const passive = hotPassive({ intervalSec: 5 });
    expect(resolvePassivePeriodicTrigger(passive)).toBe('interval');
    expect(usesHotAuraMode(passive)).toBe(false);
    expect(usesIntervalPeriodicTrigger(passive)).toBe(true);
  });

  it('defaults passive barrier trigger to stageStart', () => {
    const passive = {
      id: 'shield',
      name: 'Shield',
      effect: 'buff' as const,
      buffSubKind: 'barrier' as const,
      barrierAmount: { kind: 'flat' as const, flatAmount: 10 },
    };
    expect(resolvePassiveBarrierTrigger(passive)).toBe('stageStart');
  });

  it('supports explicit stageStart and waveStart', () => {
    expect(
      resolvePassivePeriodicTrigger(
        hotPassive({ periodicTrigger: 'stageStart' }),
      ),
    ).toBe('stageStart');
    expect(
      resolvePassivePeriodicTrigger(
        hotPassive({ periodicTrigger: 'waveStart' }),
      ),
    ).toBe('waveStart');
  });
});
