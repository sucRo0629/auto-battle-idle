import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './skills/effectConditions.ts';
import type { CombatantState } from './types.ts';
import { getBlockResonanceStacks, setBlockResonanceStacks } from './blockResonance.ts';
import {
  applyBlockResonanceStance,
  consumeBlockResonanceStacks,
  resolveEffectiveUseDurationSec,
} from './blockResonance.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

function mockGuardian(id: string): CombatantState {
  return {
    id,
    name: id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 30,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['df_guardian_passive_3'],
      learnedActiveIds: ['df_guardian_active_4'],
      equippedActiveSlots: ['df_guardian_active_4'],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_guardian',
    iconKey: 'df_guardian',
    isEnemy: false,
    battleX: 100,
    corpseVisible: true,
  };
}

describe('城塞の構え fire gate', () => {
  it('requires blockResonance stack >= 1', () => {
    const actor = mockGuardian('g1');
    const ctx = {
      actor,
      allies: [actor],
      enemies: [],
      passives: [],
      gameData: { skillRegistry: { passives: {}, actives: {} } } as never,
    };
    expect(
      evaluateCondition(ctx, { kind: 'blockResonanceStacks', min: 1 }),
    ).toBe(false);
    setBlockResonanceStacks(actor, 2, actor.id);
    expect(
      evaluateCondition(ctx, { kind: 'blockResonanceStacks', min: 1 }),
    ).toBe(true);
  });
});

describe('城塞の構え consume', () => {
  const active4 = {
    id: 'df_guardian_active_4',
    name: '城塞の構え',
    trigger: { kind: 'hitsTaken' as const, value: 8 },
    effect: [{ type: 'blockResonanceConsume' as const }],
    useDurationSec: 2,
    blockResonanceStanceDurationBaseSec: 2,
    blockResonanceStanceDamageTakenPerStack: 0.04,
    blockResonanceStanceDefPerStack: 0.05,
    blockResonanceStanceBlockPerStack: 0.05,
    blockResonanceOnBlockDamage: { kind: 'defBased' as const, defScale: 1 },
    blockResonanceOnBlockKnockbackRadiusPx: 50,
    blockResonanceOnBlockKnockbackDistancePx: 50,
  };

  it('consumes stacks and sets useDurationSec = 2 + n', () => {
    const actor = mockGuardian('g2');
    setBlockResonanceStacks(actor, 3, actor.id);
    const consumed = consumeBlockResonanceStacks(actor);
    expect(consumed).toBe(3);
    expect(getBlockResonanceStacks(actor)).toBe(0);

    const consumedMap = new Map([[actor.id, consumed]]);
    expect(resolveEffectiveUseDurationSec(active4, actor.id, consumedMap)).toBe(5);

    applyBlockResonanceStance(actor, active4, consumed);
    const stance = actor.statusEffects.find(
      (effect) => effect.overlay === 'blockResonanceStance',
    );
    expect(stance?.remainingSec).toBe(5);
  });

  it('blocks basic attack during useDurationSec lock', () => {
    const runner = new SkillSequenceRunner();
    runner.beginUse('g3', 2.5);
    expect(runner.isBasicAttackBlocked('g3')).toBe(true);
    expect(runner.isActorUseLocked('g3')).toBe(true);
  });
});
