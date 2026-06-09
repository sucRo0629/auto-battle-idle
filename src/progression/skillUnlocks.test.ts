import { describe, expect, it } from 'vitest';
import { enrichClassPreset, resolveLearnedSkills } from './skillUnlocks.ts';
import type { SkillRegistry } from '../battle/types.ts';
import type { ClassPresetBeforeEnrich } from './skillUnlocks.ts';

const registry: SkillRegistry = {
  passives: {
    cls_passive: {
      id: 'cls_passive',
      name: 'Passive',
      effect: 'targetRuleOverride',
      targetRuleOverride: { kind: "stat", side: "enemy", stat: "hp", order: "highest" },
    },
  },
  actives: {
    cls_basic: { id: 'cls_basic', name: 'Basic', effect: [] },
    cls_active_lv0: { id: 'cls_active_lv0', name: 'Active0', effect: [] },
    cls_active_lv2: { id: 'cls_active_lv2', name: 'Active2', effect: [] },
  },
};

const baseClass: ClassPresetBeforeEnrich = {
  id: 'test_cls',
  role: 'attacker',
  displayName: 'Test',
  formationRow: 'front',
  traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
  maxHp: 100,
  atk: 10,
  def: 10,
  reg: 0,
  basicAttackSkillId: 'cls_basic',
  passiveIds: ['cls_passive'],
  skills: [
    { level: 0, skillIds: ['cls_active_lv0'] },
    { level: 2, skillIds: ['cls_active_lv2'] },
  ],
};

describe('passiveIds separation', () => {
  it('enrichClassPreset puts passives in starterPassiveIds from passiveIds', () => {
    const enriched = enrichClassPreset(baseClass, registry);
    expect(enriched.starterPassiveIds).toEqual(['cls_passive']);
    expect(enriched.starterActiveIds).toEqual(['cls_active_lv0']);
    expect(enriched.classSkillIds).toContain('cls_passive');
    expect(enriched.classSkillIds).toContain('cls_active_lv0');
  });

  it('resolveLearnedSkills always returns passiveIds regardless of level', () => {
    const enriched = enrichClassPreset(baseClass, registry);
    const lv1 = resolveLearnedSkills(enriched, 1, registry);
    expect(lv1.learnedPassiveIds).toEqual(['cls_passive']);
    expect(lv1.learnedActiveIds).toEqual(['cls_active_lv0']);

    const lv2 = resolveLearnedSkills(enriched, 2, registry);
    expect(lv2.learnedPassiveIds).toEqual(['cls_passive']);
    expect(lv2.learnedActiveIds).toEqual(['cls_active_lv0', 'cls_active_lv2']);
  });
});
