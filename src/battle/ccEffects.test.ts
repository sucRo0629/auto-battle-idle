import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import {
  KNOCKBACK_MOVE_LOCK_SEC,
  STUN_MAX_DURATION_SEC,
  applyKnockbackToTarget,
  applyStunToTarget,
  clampStunDurationSec,
  isUnitMovementLocked,
  isUnitStunned,
} from './ccEffects.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: 'test_basic',
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

const actives = {
  test_basic: {
    id: 'test_basic',
    name: 'test_basic',
    trigger: { kind: 'time' as const, value: 2 },
    effect: [],
  },
};

describe('ccEffects', () => {
  it('applyStunToTarget adds cc status and isUnitStunned returns true', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    expect(
      applyStunToTarget(target, 1.2, { skillId: 'bash', sourceId: 'ally' }),
    ).toBe(true);
    expect(isUnitStunned(target)).toBe(true);
    expect(target.statusEffects[0]?.kind).toBe('cc');
    expect(target.statusEffects[0]?.overlay).toBe('stun');
    expect(target.statusEffects[0]?.remainingSec).toBe(1.2);
  });

  it('applyStunToTarget keeps longer duration when re-applied', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    applyStunToTarget(target, 1, { skillId: 'a', sourceId: 'ally' });
    applyStunToTarget(target, 2, { skillId: 'b', sourceId: 'ally' });
    expect(target.statusEffects).toHaveLength(1);
    expect(target.statusEffects[0]?.remainingSec).toBe(2);
  });

  it('applyStunToTarget does not shorten existing stun', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    applyStunToTarget(target, 2, { skillId: 'a', sourceId: 'ally' });
    applyStunToTarget(target, 0.5, { skillId: 'b', sourceId: 'ally' });
    expect(target.statusEffects[0]?.remainingSec).toBe(2);
  });

  it('clampStunDurationSec caps at STUN_MAX_DURATION_SEC', () => {
    expect(clampStunDurationSec(7)).toBe(STUN_MAX_DURATION_SEC);
    expect(clampStunDurationSec(3)).toBe(3);
    expect(STUN_MAX_DURATION_SEC).toBe(5);
  });

  it('applyStunToTarget clamps duration to STUN_MAX_DURATION_SEC', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    applyStunToTarget(target, 8, { skillId: 'bash', sourceId: 'ally' });
    expect(target.statusEffects[0]?.remainingSec).toBe(5);
  });

  it('applyStunToTarget does not reset basic cooldown when actives provided', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    const basicCd = target.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    applyStunToTarget(
      target,
      1,
      { skillId: 'bash', sourceId: 'ally' },
      { actives },
    );
    expect(basicCd.remaining).toBe(0);
  });

  it('applyKnockbackToTarget pushes each side toward rear', () => {
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 150 });
    const ally = mockUnit({ id: 'ally', battleX: 200 });
    applyKnockbackToTarget(enemy, 40);
    applyKnockbackToTarget(ally, 40);
    expect(enemy.battleX).toBe(190);
    expect(ally.battleX).toBe(160);
  });

  it('applyKnockbackToTarget applies move lock without stun', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true, battleX: 150 });
    applyKnockbackToTarget(target, 20, { skillId: 'push', sourceId: 'ally' });
    expect(isUnitMovementLocked(target)).toBe(true);
    expect(isUnitStunned(target)).toBe(false);
    expect(target.statusEffects[0]?.overlay).toBe('moveLock');
    expect(target.statusEffects[0]?.remainingSec).toBe(KNOCKBACK_MOVE_LOCK_SEC);
  });

  it('applyKnockbackToTarget keeps longer move lock when re-applied', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true, battleX: 150 });
    applyKnockbackToTarget(target, 10, { skillId: 'a', sourceId: 'ally' });
    const effect = target.statusEffects.find((e) => e.overlay === 'moveLock');
    if (effect) effect.remainingSec = 0.5;
    applyKnockbackToTarget(target, 10, { skillId: 'b', sourceId: 'ally' });
    expect(target.statusEffects.filter((e) => e.overlay === 'moveLock')).toHaveLength(1);
    expect(target.statusEffects[0]?.remainingSec).toBe(KNOCKBACK_MOVE_LOCK_SEC);
  });
});
