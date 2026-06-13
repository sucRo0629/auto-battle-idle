import { describe, expect, it, vi } from 'vitest';
import type { PassiveSkillDef } from './types.ts';
import {
  resolvePassiveBarrierTrigger,
  resolvePassivePeriodicTrigger,
  resolvePassiveTriggerChance,
  rollPassiveTriggerChance,
  usesHotAuraMode,
  usesIntervalPeriodicTrigger,
  usesPassiveTriggerChance,
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

  it('ignores legacy intervalSec (removed trigger kind)', () => {
    const passive = hotPassive({ intervalSec: 5 });
    expect(resolvePassivePeriodicTrigger(passive)).toBeUndefined();
    expect(usesHotAuraMode(passive)).toBe(true);
    expect(usesIntervalPeriodicTrigger(passive)).toBe(false);
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

  it('usesPassiveTriggerChance excludes block/evasion/counter', () => {
    expect(
      usesPassiveTriggerChance({
        id: 'x',
        name: 'X',
        effect: 'buff',
        buffSubKind: 'block',
      }),
    ).toBe(false);
    expect(
      usesPassiveTriggerChance({
        id: 'x',
        name: 'X',
        effect: 'counter',
        chance: 0.5,
      }),
    ).toBe(false);
    expect(usesPassiveTriggerChance(hotPassive())).toBe(true);
  });

  it('resolvePassiveTriggerChance defaults to 1', () => {
    expect(resolvePassiveTriggerChance(hotPassive())).toBe(1);
    expect(
      resolvePassiveTriggerChance(
        hotPassive({ periodicTrigger: 'stageStart', chance: 0.4 }),
      ),
    ).toBe(0.4);
  });

  it('rollPassiveTriggerChance respects configured chance', () => {
    const passive = hotPassive({
      periodicTrigger: 'stageStart',
      chance: 0,
    });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollPassiveTriggerChance(passive)).toBe(false);
    randomSpy.mockRestore();
  });
});
