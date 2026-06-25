import { describe, expect, it } from 'vitest';
import { readActiveFile, readPassiveFile } from './data/skillsJsonFs.ts';
import { resolveEffectTargets } from './skills/targeting.ts';
import { resolveEffectiveBasicAttackSkill } from './resolveEffectiveBasicAttack.ts';
import type { ActiveSkillDef, CombatantState } from './types.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 15,
    def: 22,
    reg: 10,
    isAlive: true,
    role: 'defender',
    classId: 'df_paladin',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_paladin',
    iconKey: 'df_paladin',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: { passives: {}, actives: {} },
} as never;

describe('df_paladin skill data v1', () => {
  it('has 4 passives and 4 actives plus basic in stem files', () => {
    const passives = readPassiveFile('df_paladin');
    const actives = readActiveFile('df_paladin');
    expect(passives.map((p) => p.id)).toEqual([
      'df_paladin_passive_1',
      'df_paladin_passive_2',
      'df_paladin_passive_3',
      'df_paladin_passive_4',
    ]);
    expect(actives.map((a) => a.id).sort()).toEqual([
      'df_paladin_active_1',
      'df_paladin_active_2',
      'df_paladin_active_3',
      'df_paladin_active_4',
      'df_paladin_basic_attack',
    ]);
    expect(passives.find((p) => p.id === 'df_paladin_passive_5')).toBeUndefined();
  });

  it('障身法 targets only front row allies within self-origin aoe', () => {
    const actives = readActiveFile('df_paladin');
    const active2 = actives.find((a) => a.id === 'df_paladin_active_2');
    expect(active2).toBeDefined();
    const paladin = mockUnit({ id: 'paladin', battleX: 100 });
    const frontAlly = mockUnit({
      id: 'front',
      role: 'attacker',
      formationRow: 'front',
      battleX: 120,
    });
    const backAlly = mockUnit({
      id: 'back',
      role: 'supporter',
      formationRow: 'back',
      battleX: 110,
    });

    for (const effect of active2!.effect) {
      const targets = resolveEffectTargets(
        effect,
        paladin,
        [paladin, frontAlly, backAlly],
        [],
        gameData,
      );
      expect(targets.map((t) => t.id).sort()).toEqual(['front', 'paladin']);
      expect(targets.some((t) => t.id === 'back')).toBe(false);
    }
  });

  it('慈光 applies party-wide buffs without barrier', () => {
    const actives = readActiveFile('df_paladin');
    const active3 = actives.find((a) => a.id === 'df_paladin_active_3');
    expect(active3?.effect.some((e) => e.type === 'buff' && e.buffSubKind === 'barrier')).toBe(
      false,
    );
    expect(
      active3?.effect.filter(
        (e) =>
          e.type === 'buff' &&
          e.buffSubKind === 'stat' &&
          (e.buffStat === 'damageTaken' || e.buffStat === 'reg'),
      ).length,
    ).toBe(2);
  });

  it('降魔光明 transforms basic attack to magic damage + heal append', () => {
    const actives = readActiveFile('df_paladin');
    const active4 = actives.find((a) => a.id === 'df_paladin_active_4');
    const basic = actives.find((a) => a.id === 'df_paladin_basic_attack');
    expect(active4).toBeDefined();
    expect(basic).toBeDefined();

    const paladin = mockUnit({
      id: 'paladin',
      statusEffects: [
        {
          id: 'bat',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          basicAttackTransform: active4!.effect[0] as never,
          sourceId: 'paladin',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });

    const resolved = resolveEffectiveBasicAttackSkill(
      paladin,
      basic as ActiveSkillDef,
    );
    expect(resolved.effect[0]?.type).toBe('damage');
    expect(resolved.effect[0]?.damageType).toBe('magic');
    expect(resolved.effect[1]?.type).toBe('heal');
  });

  it('df_guardian_passive_4 uses lastStandInvulnerable effect', () => {
    const passives = readPassiveFile('df_guardian');
    const p4 = passives.find((p) => p.id === 'df_guardian_passive_4');
    expect(p4?.effect).toBe('lastStandInvulnerable');
  });
});
