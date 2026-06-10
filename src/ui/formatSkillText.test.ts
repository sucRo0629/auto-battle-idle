import { describe, expect, it } from 'vitest';
import skillsData from '../../data/skills.json';
import type { ActiveSkillDef, PassiveSkillDef } from '../battle/types.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
} from './formatSkillText.ts';

const passives = skillsData.passives as PassiveSkillDef[];
const actives = skillsData.actives as ActiveSkillDef[];

function findPassive(id: string): PassiveSkillDef {
  const def = passives.find((p) => p.id === id);
  if (!def) throw new Error(`passive not found: ${id}`);
  return def;
}

function findActive(id: string): ActiveSkillDef {
  const def = actives.find((a) => a.id === id);
  if (!def) throw new Error(`active not found: ${id}`);
  return def;
}

describe('formatPassiveDescription', () => {
  it('formats target rule override', () => {
    expect(formatPassiveDescription(findPassive('passive_target_highest_atk'))).toBe(
      'ターゲット → 敵・ATK最高',
    );
  });

  it('formats damage taken to heal', () => {
    expect(formatPassiveDescription(findPassive('passive_damage_taken_heal'))).toBe(
      '被ダメの 10% を即時回復',
    );
  });

  it('formats self HP ratio buff', () => {
    expect(formatPassiveDescription(findPassive('passive_self_low_hp_dmg'))).toBe(
      '自HP比例 ATK ×2（0%以下で最大）',
    );
  });

  it('formats extend debuff', () => {
    expect(formatPassiveDescription(findPassive('passive_extend_debuff'))).toBe(
      '付与デバフ +2s',
    );
  });
});

describe('formatActiveDescription', () => {
  it('formats aoe physical damage', () => {
    const desc = formatActiveDescription(findActive('at_warrior_active_2'));
    expect(desc).toContain('11s');
    expect(desc).toContain('物理 ATK×0.9');
    expect(desc).toContain('範囲 ±50px');
  });

  it('formats move + multi-lock damage', () => {
    const desc = formatActiveDescription(findActive('at_assassin_active_1'));
    expect(desc).toContain('9s');
    expect(desc).toContain('移動 背後');
    expect(desc).toContain('マルチロック（複数対象・同一可） ×3');
    expect(desc).toContain('物理 ATK×0.7');
  });

  it('formats pierce damage', () => {
    const desc = formatActiveDescription(findActive('at_lancer_active_1'));
    expect(desc).toContain('貫通');
    expect(desc).toContain('物理 ATK×1.1');
  });
});
