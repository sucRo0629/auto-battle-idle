import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../types.ts';
import { normalizeEntityTraits } from './entityTraits.ts';
import {
  defaultBasicAttackId,
  synthesizeBasicAttackSkill,
} from './synthesizeBasicAttack.ts';
import { sanitizeBasicAttackSkillForJson } from './validateGameData.ts';

describe('sanitizeBasicAttackSkillForJson', () => {
  it('removes trait-owned fields from basic attack JSON', () => {
    const skill: ActiveSkillDef = {
      id: 'sp_cleric_basic_attack',
      name: 'sp_cleric_basic_attack',
      trigger: { kind: 'time', value: 2 },
      vfx: { enabled: true },
      effect: [
        {
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          type: 'damage',
          damageType: 'magic',
          range: 90,
          amount: { kind: 'atkBased', atkScale: 0.5 },
        },
      ],
    };
    const sanitized = sanitizeBasicAttackSkillForJson(skill);
    expect(sanitized.vfx).toBeUndefined();
    expect(sanitized.effect[0]).not.toHaveProperty('damageType');
    expect(sanitized.effect[0]).not.toHaveProperty('range');
  });
});

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

  it('merges multi-hit fields from JSON override', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'at_assassin',
      isEnemy: false,
      traits: normalizeEntityTraits({ rangePx: 5 }),
      attackSpeedTier: 'fast',
      jsonOverride: {
        id: 'at_assassin_basic_attack',
        name: 'at_assassin_basic_attack',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
            type: 'damage',
            amount: { kind: 'atkBased', atkScale: 0.5 },
            targetShape: 'single',
            hitCount: 2,
            hitDurationSec: 0.2,
          },
        ],
      },
    });
    const effect = skill.effect[0];
    expect(effect?.type).toBe('damage');
    if (effect?.type === 'damage') {
      expect(effect.hitCount).toBe(2);
      expect(effect.hitDurationSec).toBe(0.2);
      expect(effect.amount.atkScale).toBe(0.5);
    }
  });

  it('preserves heal override from JSON', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'sp_cleric',
      isEnemy: false,
      traits: normalizeEntityTraits({ rangePx: 50 }),
      attackSpeedTier: 'normal',
      jsonOverride: {
        id: 'sp_cleric_basic_attack',
        name: 'sp_cleric_basic_attack',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: {
              kind: 'stat',
              side: 'ally',
              stat: 'hp',
              order: 'ratio',
            },
            type: 'heal',
            healSubKind: 'instant',
            amount: { kind: 'atkBased', atkScale: 0.5 },
          },
        ],
      },
    });
    expect(skill.effect[0]?.type).toBe('heal');
    if (skill.effect[0]?.type === 'heal') {
      expect(skill.effect[0].target).toEqual({
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      });
      expect(skill.effect[0].amount?.atkScale).toBe(0.5);
    }
  });

  it('merges heal and barrier effects from JSON override', () => {
    const skill = synthesizeBasicAttackSkill({
      entityId: 'sp_abjurer',
      isEnemy: false,
      traits: normalizeEntityTraits({ rangePx: 100 }),
      attackSpeedTier: 'slow',
      jsonOverride: {
        id: 'sp_abjurer_basic_attack',
        name: 'sp_abjurer_basic_attack',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: {
              kind: 'stat',
              side: 'ally',
              stat: 'hp',
              order: 'ratio',
            },
            type: 'heal',
            healSubKind: 'instant',
            amount: { kind: 'atkBased', atkScale: 0.55 },
          },
          {
            target: {
              kind: 'stat',
              side: 'ally',
              stat: 'hp',
              order: 'ratio',
            },
            type: 'buff',
            buffSubKind: 'barrier',
            amount: { kind: 'atkBased', atkScale: 0.55 },
          },
        ],
      },
    });
    expect(skill.effect).toHaveLength(2);
    expect(skill.effect[0]?.type).toBe('heal');
    expect(skill.effect[1]?.type).toBe('buff');
    if (skill.effect[1]?.type === 'buff') {
      expect(skill.effect[1].buffSubKind).toBe('barrier');
      expect(skill.effect[1].amount?.atkScale).toBe(0.55);
    }
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
