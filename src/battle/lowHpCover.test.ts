import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  LOW_HP_COVER_WAVE_LIMIT_DEFAULT,
  resetLowHpCoverRedirects,
  resolveLowHpCoverTarget,
} from './lowHpCover.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: overrides.hp ?? 20,
    maxHp: overrides.maxHp ?? 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'sp_cleric',
    formationRow: 'back',
    traits: { rangePx: 100, damageType: 'magic', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'ally',
    iconKey: 'ally',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {
  cover: {
    id: 'df_duelist_passive_3',
    name: '攻撃誘導',
    effect: 'lowHpCover',
  },
};

describe('lowHpCover', () => {
  it('redirects low HP ally single-target damage to duelist', () => {
    const duelist = mockUnit({
      id: 'duelist',
      classId: 'df_duelist',
      formationRow: 'front',
      build: { learnedPassiveIds: ['df_duelist_passive_3'], learnedActiveIds: [], equippedActiveSlots: [] },
    });
    const ally = mockUnit({ id: 'ally', hp: 30, maxHp: 100 });
    resetLowHpCoverRedirects([duelist], passives);

    const result = resolveLowHpCoverTarget(ally, [duelist, ally], {
      df_duelist_passive_3: passives.cover!,
    });

    expect(result.redirected).toBe(true);
    expect(result.target.id).toBe('duelist');
    expect(duelist.coverRedirectsRemaining).toBe(LOW_HP_COVER_WAVE_LIMIT_DEFAULT - 1);
  });

  it('stops redirecting after wave limit', () => {
    const duelist = mockUnit({
      id: 'duelist',
      classId: 'df_duelist',
      coverRedirectsRemaining: 0,
      build: { learnedPassiveIds: ['df_duelist_passive_3'], learnedActiveIds: [], equippedActiveSlots: [] },
    });
    const ally = mockUnit({ id: 'ally', hp: 10, maxHp: 100 });

    const result = resolveLowHpCoverTarget(ally, [duelist, ally], {
      df_duelist_passive_3: passives.cover!,
    });

    expect(result.redirected).toBe(false);
    expect(result.target.id).toBe('ally');
  });

  it('does not redirect when ally HP is above threshold', () => {
    const duelist = mockUnit({
      id: 'duelist',
      classId: 'df_duelist',
      build: { learnedPassiveIds: ['df_duelist_passive_3'], learnedActiveIds: [], equippedActiveSlots: [] },
    });
    const ally = mockUnit({ id: 'ally', hp: 80, maxHp: 100 });
    resetLowHpCoverRedirects([duelist], passives);

    const result = resolveLowHpCoverTarget(ally, [duelist, ally], {
      df_duelist_passive_3: passives.cover!,
    });

    expect(result.redirected).toBe(false);
    expect(duelist.coverRedirectsRemaining).toBeUndefined();
  });
});
