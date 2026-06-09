import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import {
  applyKnockbackToTarget,
  applyStunToTarget,
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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
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

describe('ccEffects', () => {
  it('applyStunToTarget adds cc status and isUnitStunned returns true', () => {
    const target = mockUnit({ id: 'enemy', isEnemy: true });
    expect(applyStunToTarget(target, 1.2, { skillId: 'bash', sourceId: 'ally' })).toBe(
      true,
    );
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

  it('applyKnockbackToTarget pushes enemy left and ally right', () => {
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 150 });
    const ally = mockUnit({ id: 'ally', battleX: 200 });
    applyKnockbackToTarget(enemy, 40);
    applyKnockbackToTarget(ally, 40);
    expect(enemy.battleX).toBe(110);
    expect(ally.battleX).toBe(240);
  });
});
