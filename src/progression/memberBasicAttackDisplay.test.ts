import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, ClassPreset, SkillRegistry } from '../battle/types.ts';
import {
  resolveMemberBasicAttackAttribute,
  resolveMemberBasicAttackDisplay,
} from './memberBasicAttackDisplay.ts';

function mockPreset(
  overrides: Partial<ClassPreset> & Pick<ClassPreset, 'id' | 'basicAttackSkillId'>,
): ClassPreset {
  return {
    displayName: overrides.displayName ?? overrides.id,
    epithetEn: overrides.epithetEn ?? '',
    role: overrides.role ?? 'attacker',
    formationRow: overrides.formationRow ?? 'front',
    maxHp: overrides.maxHp ?? 100,
    atk: overrides.atk ?? 10,
    def: overrides.def ?? 5,
    res: overrides.res ?? 0,
    growthTier: overrides.growthTier ?? { maxHp: 'mid', atk: 'mid', def: 'mid' },
    traits: overrides.traits ?? { rangePx: 5, damageType: 'physical' },
    skills: overrides.skills ?? [],
    ...overrides,
  };
}

describe('resolveMemberBasicAttackDisplay', () => {
  it('formats physical basic attack', () => {
    const skillId = 'test_warrior_basic_attack';
    const registry: SkillRegistry = {
      actives: {
        [skillId]: {
          id: skillId,
          name: skillId,
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        } satisfies ActiveSkillDef,
      },
      passives: {},
    };
    const preset = mockPreset({
      id: 'test_warrior',
      basicAttackSkillId: skillId,
      traits: { rangePx: 8, damageType: 'physical' },
    });

    expect(resolveMemberBasicAttackDisplay(preset, registry)).toEqual({
      rangeLabel: '0.8（近接帯）',
      attributeLabel: '物理',
    });
  });

  it('uses traits damageType when basic effect omits damageType', () => {
    const skillId = 'test_sorcerer_basic_attack';
    const registry: SkillRegistry = {
      actives: {
        [skillId]: {
          id: skillId,
          name: skillId,
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              type: 'damage',
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        } satisfies ActiveSkillDef,
      },
      passives: {},
    };
    const preset = mockPreset({
      id: 'test_sorcerer',
      basicAttackSkillId: skillId,
      traits: { rangePx: 128, damageType: 'magic' },
    });
    const skill = registry.actives[skillId]!;

    expect(resolveMemberBasicAttackAttribute(preset, skill)).toBe('magic');
    expect(resolveMemberBasicAttackDisplay(preset, registry)?.attributeLabel).toBe(
      '魔法',
    );
  });

  it('formats ally heal basic attack as 回復', () => {
    const skillId = 'test_cleric_basic_attack';
    const registry: SkillRegistry = {
      actives: {
        [skillId]: {
          id: skillId,
          name: skillId,
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              type: 'heal',
              healSubKind: 'instant',
              target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        } satisfies ActiveSkillDef,
      },
      passives: {},
    };
    const preset = mockPreset({
      id: 'test_cleric',
      basicAttackSkillId: skillId,
      role: 'supporter',
      traits: { rangePx: 128, damageType: 'physical' },
    });

    expect(resolveMemberBasicAttackDisplay(preset, registry)).toEqual({
      rangeLabel: '12.8（遠隔帯）',
      attributeLabel: '回復',
    });
  });

  it('formats English range band and attribute labels', () => {
    const skillId = 'test_warrior_basic_attack';
    const registry: SkillRegistry = {
      actives: {
        [skillId]: {
          id: skillId,
          name: skillId,
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        } satisfies ActiveSkillDef,
      },
      passives: {},
    };
    const preset = mockPreset({
      id: 'test_warrior',
      basicAttackSkillId: skillId,
      traits: { rangePx: 8, damageType: 'physical' },
    });

    expect(resolveMemberBasicAttackDisplay(preset, registry, 'en')).toEqual({
      rangeLabel: '0.8 (Melee band)',
      attributeLabel: 'Physical',
    });
  });

  it('returns null when basic attack skill is missing', () => {
    const preset = mockPreset({
      id: 'test_missing',
      basicAttackSkillId: 'missing_basic_attack',
    });

    expect(
      resolveMemberBasicAttackDisplay(preset, {
        actives: {},
        passives: {},
      }),
    ).toBeNull();
  });
});
