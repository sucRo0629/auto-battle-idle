import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, SkillCooldown } from './types.ts';
import type { CombatantState } from './types.ts';
import {
  chargeCountTrigger,
  findReadyCountTriggerCooldowns,
  initializeSkillCooldowns,
  isCountTriggerReady,
  resetCooldownAfterFire,
  resolveSkillTrigger,
  shouldPauseActiveCooldown,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
  tickPendingBasicAttackCountCharges,
} from './skillTrigger.ts';
import type { CooldownPauseContext } from './skillTrigger.ts';

function skill(overrides: Partial<ActiveSkillDef> = {}): ActiveSkillDef {
  return {
    id: 'test',
    name: 'test',
    trigger: { kind: 'time', value: 5 },
    effect: [
      {
        target: { kind: "distance", side: "enemy", order: "nearest" },
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
    ...overrides,
  };
}

describe('skillTrigger', () => {
  it('resolveSkillTrigger uses trigger', () => {
    expect(
      resolveSkillTrigger(
        skill({ trigger: { kind: 'basicAttackCount', value: 3 } }),
      ),
    ).toEqual({ kind: 'basicAttackCount', value: 3 });
  });

  function mockPauseCtx(
    overrides: Partial<CooldownPauseContext> = {},
  ): CooldownPauseContext {
    return {
      isActorUseLocked: () => false,
      ...overrides,
    };
  }

  it('shouldPauseActiveCooldown during use lock for charging time/hitsTaken', () => {
    const timeCd: SkillCooldown = {
      skillId: 't',
      remaining: 3,
      slotKind: 'active',
      slotIndex: 0,
    };
    expect(
      shouldPauseActiveCooldown(
        'actor',
        timeCd,
        skill(),
        mockPauseCtx({ isActorUseLocked: () => true }),
      ),
    ).toBe(true);

    const hitsCd: SkillCooldown = {
      skillId: 'h',
      remaining: 2,
      slotKind: 'active',
      slotIndex: 1,
    };
    expect(
      shouldPauseActiveCooldown(
        'actor',
        hitsCd,
        skill({ trigger: { kind: 'hitsTaken', value: 4 } }),
        mockPauseCtx({ isActorUseLocked: () => true }),
      ),
    ).toBe(true);
  });

  it('shouldPauseActiveCooldown skips use lock when already ready', () => {
    const cd: SkillCooldown = {
      skillId: 't',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    expect(
      shouldPauseActiveCooldown(
        'actor',
        cd,
        skill(),
        mockPauseCtx({ isActorUseLocked: () => true }),
      ),
    ).toBe(false);
  });

  it('shouldPauseActiveCooldown does not pause during active effect without use lock', () => {
    const cd: SkillCooldown = {
      skillId: 't',
      remaining: 8,
      slotKind: 'active',
      slotIndex: 0,
    };
    expect(
      shouldPauseActiveCooldown('actor', cd, skill(), mockPauseCtx()),
    ).toBe(false);
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

  it('initializeSkillCooldowns sets all slots to trigger value at stage start', () => {
    const registry = {
      basic: skill({ id: 'basic', trigger: { kind: 'time', value: 2 } }),
      heavy: skill({ id: 'heavy', trigger: { kind: 'basicAttackCount', value: 4 } }),
      guard: skill({ id: 'guard', trigger: { kind: 'hitsTaken', value: 3 } }),
    };
    const unit = {
      cooldowns: [
        { skillId: 'basic', remaining: 0, slotKind: 'basic' as const },
        { skillId: 'heavy', remaining: 0, slotKind: 'active' as const, slotIndex: 0 },
        { skillId: 'guard', remaining: 0, slotKind: 'active' as const, slotIndex: 1 },
      ],
    } as CombatantState;

    initializeSkillCooldowns(unit, registry);

    expect(unit.cooldowns[0]!.remaining).toBe(2);
    expect(unit.cooldowns[1]!.remaining).toBe(4);
    expect(unit.cooldowns[2]!.remaining).toBe(3);
  });

  it('resetCooldownAfterFire sets trigger value', () => {
    const cd: SkillCooldown = { skillId: 'test', remaining: 0, slotKind: 'active' };
    resetCooldownAfterFire(cd, skill({ trigger: { kind: 'hitsTaken', value: 4 } }));
    expect(cd.remaining).toBe(4);
  });

  it('chargeCountTrigger decrements only while remaining > 0', () => {
    const cd: SkillCooldown = {
      skillId: 'atk',
      remaining: 1,
      slotKind: 'active',
    };
    chargeCountTrigger(cd, skill({ trigger: { kind: 'basicAttackCount', value: 3 } }));
    expect(cd.remaining).toBe(0);

    chargeCountTrigger(cd, skill({ trigger: { kind: 'basicAttackCount', value: 3 } }));
    expect(cd.remaining).toBe(0);
  });

  it('isCountTriggerReady is true only for active count triggers at zero', () => {
    const countSkill = skill({ trigger: { kind: 'basicAttackCount', value: 3 } });
    const timeSkill = skill({ trigger: { kind: 'time', value: 3 } });
    const readyCd: SkillCooldown = {
      skillId: 'test',
      remaining: 0,
      slotKind: 'active',
    };
    const chargingCd: SkillCooldown = {
      skillId: 'test',
      remaining: 1,
      slotKind: 'active',
    };

    expect(isCountTriggerReady(readyCd, countSkill)).toBe(true);
    expect(isCountTriggerReady(chargingCd, countSkill)).toBe(false);
    expect(isCountTriggerReady(readyCd, timeSkill)).toBe(false);
  });

  it('findReadyCountTriggerCooldowns returns matching actives in slot order', () => {
    const registry = {
      a: skill({ id: 'a', trigger: { kind: 'basicAttackCount', value: 2 } }),
      b: skill({ id: 'b', trigger: { kind: 'hitsTaken', value: 2 } }),
      c: skill({ id: 'c', trigger: { kind: 'basicAttackCount', value: 2 } }),
    };
    const unit = {
      cooldowns: [
        { skillId: 'c', remaining: 0, slotKind: 'active' as const, slotIndex: 1 },
        { skillId: 'a', remaining: 0, slotKind: 'active' as const, slotIndex: 0 },
        { skillId: 'b', remaining: 0, slotKind: 'active' as const, slotIndex: 2 },
      ],
    } as CombatantState;

    const ready = findReadyCountTriggerCooldowns(
      unit,
      'basicAttackCount',
      registry,
    );
    expect(ready.map((cd) => cd.skillId)).toEqual(['a', 'c']);
  });

  it('tickCountTriggerCooldowns only charges matching active cooldowns', () => {
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

  it('tickPendingBasicAttackCountCharges applies at most one charge per actor per tick', () => {
    const queue = [
      { actorId: 'a', applyAtBattleSec: 0 },
      { actorId: 'a', applyAtBattleSec: 0 },
      { actorId: 'b', applyAtBattleSec: 0 },
    ];
    const charged: string[] = [];
    const remaining = tickPendingBasicAttackCountCharges(queue, 0, (actorId) => {
      charged.push(actorId);
    });
    expect(charged).toEqual(['a', 'b']);
    expect(remaining).toEqual([{ actorId: 'a', applyAtBattleSec: 0 }]);
  });

});
