import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState } from './types.ts';
import {
  applyArenaDominanceDamageMitigation,
  applyArenaMarkDamageMitigation,
  ARENA_MARK_DISPLAY_NAME,
  clearArenaDominanceMarks,
  grantArenaDominance,
  grantArenaMark,
  handleArenaDominanceEnd,
  hasActiveStageTriggerRemaining,
  consumeActiveStageTrigger,
  initActiveStageTriggerLimits,
  isAllySupportBlockedDuringArenaDominance,
  isArenaDominanceActive,
  isArenaMarked,
  pickHighestAtkEnemy,
} from './arenaDominance.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string; atk?: number },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: overrides.atk ?? 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: ['df_duelist_active_4'], equippedActiveSlots: [] },
    cooldowns: [{ skillId: 'df_duelist_active_4', remaining: 0, slotKind: 'active', slotIndex: 3 }],
    statusEffects: [],
    spriteKey: 'unit',
    iconKey: 'unit',
    isEnemy: overrides.isEnemy ?? false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const arenaSkill: ActiveSkillDef = {
  id: 'df_duelist_active_4',
  name: '闘技場の掟',
  trigger: { kind: 'time', value: 0 },
  firePolicy: 'smart',
  fireConditions: [{ kind: 'finalWaveStart' }],
  stageTriggerLimit: 1,
  arenaDominanceNonMarkDamageMultiplier: 0.5,
  effect: [{ type: 'arenaDominance', target: { kind: 'self' } }],
};

describe('arenaDominance', () => {
  it('marks highest ATK enemy as 闘士の指名 and reduces non-mark damage by 50%', () => {
    const duelist = mockUnit({ id: 'duelist' });
    const boss = mockUnit({ id: 'boss', isEnemy: true, atk: 50 });
    const grunt = mockUnit({ id: 'grunt', isEnemy: true, atk: 5 });
    grantArenaDominance(duelist, arenaSkill.id, 15);
    grantArenaMark(boss, duelist.id, arenaSkill.id, 15);

    const mark = boss.statusEffects.find((effect) => effect.overlay === 'arenaMark');
    expect(mark?.displayName).toBe(ARENA_MARK_DISPLAY_NAME);
    expect(isArenaDominanceActive(duelist)).toBe(true);
    expect(isArenaMarked(boss)).toBe(true);
    expect(pickHighestAtkEnemy([grunt, boss])?.id).toBe('boss');
    expect(
      applyArenaDominanceDamageMitigation(duelist, grunt, 100, 0.5),
    ).toBe(50);
    expect(
      applyArenaDominanceDamageMitigation(duelist, boss, 100, 0.5),
    ).toBe(100);
  });

  it('reduces damage to marked enemy from non-duelist by 50%', () => {
    const duelist = mockUnit({ id: 'duelist' });
    const ally = mockUnit({ id: 'ally', classId: 'at_swordsman' });
    const boss = mockUnit({ id: 'boss', isEnemy: true, atk: 50 });
    grantArenaMark(boss, duelist.id, arenaSkill.id, 15);

    expect(applyArenaMarkDamageMitigation(boss, duelist, 100)).toBe(100);
    expect(applyArenaMarkDamageMitigation(boss, ally, 100)).toBe(50);
  });

  it('clears 闘士の指名 when arena dominance ends', () => {
    const duelist = mockUnit({ id: 'duelist' });
    const boss = mockUnit({ id: 'boss', isEnemy: true });
    grantArenaDominance(duelist, arenaSkill.id, 15);
    grantArenaMark(boss, duelist.id, arenaSkill.id, 15);

    duelist.statusEffects[0]!.remainingSec = 0;
    handleArenaDominanceEnd([boss]);

    expect(isArenaMarked(boss)).toBe(false);
    clearArenaDominanceMarks([boss]);
  });

  it('blocks ally support on duelist during arena dominance', () => {
    const duelist = mockUnit({ id: 'duelist' });
    const ally = mockUnit({ id: 'ally', classId: 'df_paladin' });
    grantArenaDominance(duelist, arenaSkill.id, 15);

    expect(isAllySupportBlockedDuringArenaDominance(duelist, ally)).toBe(true);
    expect(isAllySupportBlockedDuringArenaDominance(duelist, duelist)).toBe(false);
  });

  it('enforces stage trigger limit once', () => {
    const duelist = mockUnit({ id: 'duelist' });
    initActiveStageTriggerLimits([duelist], { [arenaSkill.id]: arenaSkill });
    expect(hasActiveStageTriggerRemaining(duelist, arenaSkill)).toBe(true);
    consumeActiveStageTrigger(duelist, arenaSkill);
    expect(hasActiveStageTriggerRemaining(duelist, arenaSkill)).toBe(false);
  });
});
