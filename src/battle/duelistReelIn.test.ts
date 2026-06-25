import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './skills/effectConditions.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import type { ActiveSkillDef, CombatantState, GameData } from './types.ts';

function mockDuelist(battleX: number): CombatantState {
  return {
    id: 'duelist',
    name: 'duelist',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_duelist',
    iconKey: 'df_duelist',
    isEnemy: false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
  };
}

function mockEnemy(
  id: string,
  battleX: number,
  rangePx: number,
): CombatantState {
  return {
    id,
    name: id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'enemy',
    iconKey: 'enemy',
    isEnemy: true,
    battleX,
    visualX: battleX,
    corpseVisible: true,
  };
}

const gameData = { stages: [], enemyRegistry: {}, classRegistry: {} } as GameData;

function loadReelInSkill(): ActiveSkillDef {
  const actives = JSON.parse(
    readFileSync('data/skills/actives/df_duelist.json', 'utf8'),
  ) as ActiveSkillDef[];
  const skill = actives.find((entry) => entry.id === 'df_duelist_active_1');
  if (!skill) throw new Error('df_duelist_active_1 not found');
  return skill;
}

describe('df_duelist_active_1 誘い込み', () => {
  const skill = loadReelInSkill();
  const reelInEffect = skill.effect[0]!;
  const debuffEffect = skill.effect[1]!;

  it('targets ranged enemy when melee is closer on the front line', () => {
    const duelist = mockDuelist(50);
    const melee = mockEnemy('melee', 120, 30);
    const ranged = mockEnemy('ranged', 250, 100);
    const enemies = [melee, ranged];

    const reelIn = resolveEffectResolution(
      reelInEffect,
      duelist,
      [duelist],
      enemies,
      gameData,
    );
    const debuff = resolveEffectResolution(
      debuffEffect,
      duelist,
      [duelist],
      enemies,
      gameData,
    );

    expect(reelIn?.waves[0]?.targets[0]?.unit.id).toBe('ranged');
    expect(debuff?.waves[0]?.targets[0]?.unit.id).toBe('ranged');
  });

  it('does not resolve debuff against melee-only waves', () => {
    const duelist = mockDuelist(50);
    const melee = mockEnemy('melee', 120, 30);
    const enemies = [melee];

    expect(
      resolveEffectResolution(
        reelInEffect,
        duelist,
        [duelist],
        enemies,
        gameData,
      ),
    ).toBeNull();
    expect(
      resolveEffectResolution(
        debuffEffect,
        duelist,
        [duelist],
        enemies,
        gameData,
      ),
    ).toBeNull();
  });

  it('smart fire waits until a ranged enemy exists', () => {
    const duelist = mockDuelist(50);
    const melee = mockEnemy('melee', 120, 30);
    const ranged = mockEnemy('ranged', 250, 100);
    const referenceEffect = skill.effect[0];
    const minTargets = skill.fireConditions?.[0];
    expect(minTargets?.kind).toBe('minTargets');

    const ctx = {
      actor: duelist,
      allies: [duelist],
      enemies: [melee],
      passives: [],
      gameData,
      referenceEffect,
    };
    expect(evaluateCondition(ctx, minTargets!)).toBe(false);

    ctx.enemies = [melee, ranged];
    expect(evaluateCondition(ctx, minTargets!)).toBe(true);
  });
});
