import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, SkillCooldown } from './types.ts';
import {
  isTimeTrigger,
  resetCooldownAfterFire,
  resolveSkillTrigger,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from './skillTrigger.ts';

function skill(overrides: Partial<ActiveSkillDef> = {}): ActiveSkillDef {
  return {
    id: 'test',
    name: 'test',
    trigger: { kind: 'time', value: 5 },
    effect: [
      {
        targetRule: 'frontEnemy',
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
    ...overrides,
  };
}

describe('skillTrigger', () => {
  it('resolveSkillTrigger prefers trigger over legacy interval', () => {
    expect(
      resolveSkillTrigger(
        skill({ trigger: { kind: 'basicAttackCount', value: 3 }, interval: 9 }),
      ),
    ).toEqual({ kind: 'basicAttackCount', value: 3 });
  });

  it('resolveSkillTrigger falls back to legacy interval', () => {
    expect(resolveSkillTrigger(skill({ trigger: undefined, interval: 4 }))).toEqual({
      kind: 'time',
      value: 4,
    });
  });

  it('shouldTickCooldown is true only for time actives and all basics', () => {
    expect(shouldTickCooldown(skill(), 'active')).toBe(true);
    expect(
      shouldTickCooldown(
        skill({ trigger: { kind: 'hitsTaken', value: 2 } }),
        'active',
      ),
    ).toBe(false);
    expect(shouldTickCooldown(skill(), 'basic')).toBe(true);
  });

  it('resetCooldownAfterFire sets trigger value', () => {
    const cd: SkillCooldown = { skillId: 'test', remaining: 0, slotKind: 'active' };
    resetCooldownAfterFire(cd, skill({ trigger: { kind: 'hitsTaken', value: 4 } }));
    expect(cd.remaining).toBe(4);
  });

  it('tickCountTriggerCooldowns decrements matching active cooldowns', () => {
    const registry = {
      atk: skill({ id: 'atk', trigger: { kind: 'basicAttackCount', value: 3 } }),
      guard: skill({ id: 'guard', trigger: { kind: 'hitsTaken', value: 2 } }),
    };
    const cooldowns: SkillCooldown[] = [
      { skillId: 'atk', remaining: 2, slotKind: 'active' },
      { skillId: 'guard', remaining: 2, slotKind: 'active' },
      { skillId: 'atk', remaining: 0, slotKind: 'basic' },
    ];
    tickCountTriggerCooldowns(cooldowns, registry, 'basicAttackCount');
    expect(cooldowns[0]!.remaining).toBe(1);
    expect(cooldowns[1]!.remaining).toBe(2);
    expect(cooldowns[2]!.remaining).toBe(0);
  });

  it('isTimeTrigger reflects trigger kind', () => {
    expect(isTimeTrigger(skill())).toBe(true);
    expect(
      isTimeTrigger(skill({ trigger: { kind: 'basicAttackCount', value: 2 } })),
    ).toBe(false);
  });
});
