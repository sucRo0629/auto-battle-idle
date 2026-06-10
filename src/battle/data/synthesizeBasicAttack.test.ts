import { describe, expect, it } from 'vitest';
import { normalizeEntityTraits } from './entityTraits.ts';
import {
  defaultBasicAttackId,
  synthesizeBasicAttackSkill,
} from './synthesizeBasicAttack.ts';

describe('synthesizeBasicAttackSkill', () => {
  it('synthesizes ally basic with frontEnemy', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'df_guardian',
      isEnemy: false,
      traits: normalizeEntityTraits({}),
      attackSpeedTier: 'normal',
    });
    expect(skill.id).toBe(defaultBasicAttackId('df_guardian'));
    expect(skill.effect[0]?.target).toEqual({ kind: "distance", side: "enemy", order: "nearest" });
    expect(skill.effect[0]?.type).toBe('damage');
    expect(skill.effect[0]).not.toHaveProperty('range');
    expect(skill.vfx).toBeUndefined();
  });

  it('synthesizes enemy basic targeting opposing faction (player allies)', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'test_enemy',
      isEnemy: true,
      traits: normalizeEntityTraits({}),
      attackSpeedTier: 'normal',
    });
    expect(skill.effect[0]?.target).toEqual({ kind: "distance", side: "enemy", order: "nearest" });
  });

  it('merges atkScale override from JSON', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'at_sorcerer',
      isEnemy: false,
      traits: normalizeEntityTraits({ rangePx: 50, damageType: 'magic' }),
      attackSpeedTier: 'somewhatSlow',
      jsonOverride: {
        id: 'at_sorcerer_basic_attack',
        name: '魔弾',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: "distance", side: "enemy", order: "nearest" },
            type: 'damage',
            amount: { kind: 'atkBased', atkScale: 0.85 },
          },
        ],
      },
    });
    expect(skill.name).toBe('魔弾');
    if (skill.effect[0]?.type === 'damage') {
      expect(skill.effect[0].amount.atkScale).toBe(0.85);
    }
  });
});
