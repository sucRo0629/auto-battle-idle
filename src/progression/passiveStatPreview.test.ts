import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import type { SkillRegistry } from '../battle/types.ts';
import { loadLevelCurves } from './levelGrowth.ts';
import {
  collectSelfPassiveStatEffects,
  computePreviewCombatStats,
} from './passiveStatPreview.ts';
import type { ClassPresetBeforeEnrich } from './skillUnlocks.ts';

const LEVEL_CURVES = loadLevelCurves(levelCurvesJson);

const registry: SkillRegistry = {
  passives: {
    preview_atk_buff: {
      id: 'preview_atk_buff',
      name: 'ATK Buff',
      effect: 'buff',
      buffSubKind: 'stat',
      buffTargetRule: { kind: 'self' },
      buffStat: 'atk',
      buffMultiplier: 1.2,
    },
    preview_ally_atk_buff: {
      id: 'preview_ally_atk_buff',
      name: 'Ally ATK Buff',
      effect: 'buff',
      buffSubKind: 'stat',
      buffTargetRule: { kind: 'all', side: 'ally' },
      buffStat: 'atk',
      buffMultiplier: 1.5,
    },
    preview_low_hp_def: {
      id: 'preview_low_hp_def',
      name: 'Low HP DEF',
      effect: 'selfHpRatioBuff',
      buffStat: 'def',
      buffMultiplierMax: 1.5,
      maxBuffAtHpRatio: 0.5,
    },
    preview_spd_buff: {
      id: 'preview_spd_buff',
      name: 'SPD Buff',
      effect: 'buff',
      buffSubKind: 'stat',
      buffTargetRule: { kind: 'self' },
      buffStat: 'attackSpeed',
      buffMultiplier: 1.25,
    },
  },
  actives: {},
};

const baseClass: ClassPresetBeforeEnrich = {
  id: 'preview_cls',
  role: 'attacker',
  displayName: 'Preview',
  formationRow: 'front',
  traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
  maxHp: 100,
  atk: 10,
  def: 10,
  res: 0,
  basicAttackSkillId: 'preview_basic',
  growthTier: { maxHp: 1, atk: 1, def: 1 },
  passiveIds: ['preview_atk_buff', 'preview_ally_atk_buff'],
  skills: [
    { level: 0, skillIds: ['preview_atk_buff'] },
    { level: 5, skillIds: ['preview_low_hp_def'] },
    { level: 10, skillIds: ['preview_spd_buff'] },
  ],
};

describe('passiveStatPreview', () => {
  it('applies self-target stat buff passives', () => {
    const effects = collectSelfPassiveStatEffects(
      ['preview_atk_buff', 'preview_ally_atk_buff'],
      registry.passives,
    );
    expect(effects).toHaveLength(1);
    expect(effects[0]?.stat).toBe('atk');
  });

  it('scales selfHpRatioBuff by hp ratio', () => {
    const fullHp = collectSelfPassiveStatEffects(
      ['preview_low_hp_def'],
      registry.passives,
      1,
    );
    const lowHp = collectSelfPassiveStatEffects(
      ['preview_low_hp_def'],
      registry.passives,
      0.25,
    );
    expect(fullHp).toHaveLength(0);
    expect(lowHp).toHaveLength(1);
    expect(lowHp[0]?.multiplier).toBeCloseTo(1.5);
  });

  it('includes learned passives at preview level', () => {
    const lv1 = computePreviewCombatStats(baseClass, 1, LEVEL_CURVES, registry);
    expect(lv1.effective.atk).toBe(12);
    expect(lv1.attackSpeedMultiplier).toBe(1);

    const lv10 = computePreviewCombatStats(
      baseClass,
      10,
      LEVEL_CURVES,
      registry,
    );
    expect(lv10.effective.atk).toBeCloseTo(lv10.base.atk * 1.2);
    expect(lv10.attackSpeedMultiplier).toBe(1.25);
  });
});
