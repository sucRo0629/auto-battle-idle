import { describe, expect, it } from 'vitest';
import {
  applyBasicAttackTransform,
  getActiveBasicAttackTransform,
  resolveEffectiveBasicAttackSkill,
} from './resolveEffectiveBasicAttack.ts';
import type {
  ActiveSkillDef,
  BasicAttackTransformSpec,
  CombatantState,
} from './types.ts';

function mockBasicSkill(): ActiveSkillDef {
  return {
    id: 'test_basic_attack',
    name: '打撃',
    trigger: { kind: 'time', value: 2 },
    effect: [
      {
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        amount: { kind: 'atkBased', atkScale: 1 },
        hitCount: 2,
        hitDurationSec: 0.2,
      },
    ],
  };
}

function mockUnit(statusEffects: CombatantState['statusEffects'] = []): CombatantState {
  return {
    id: 'unit',
    name: 'unit',
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 10,
    reg: 5,
    isAlive: true,
    barrierHp: 0,
    role: 'attacker',
    classId: 'at_warrior',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedActiveIds: [], learnedPassiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects,
    spriteKey: '',
    iconKey: '',
    isEnemy: false,
    battleX: 0,
    corpseVisible: false,
  };
}

describe('resolveEffectiveBasicAttack', () => {
  it('triples hit count with hitCountMultiplier', () => {
    const skill = applyBasicAttackTransform(mockBasicSkill(), {
      hitCountMultiplier: 3,
    });
    expect(skill.effect[0]?.hitCount).toBe(6);
  });

  it('replaces primary effect with heal override', () => {
    const skill = applyBasicAttackTransform(mockBasicSkill(), {
      primaryEffectOverride: {
        type: 'heal',
        healSubKind: 'instant',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        amount: { kind: 'atkBased', atkScale: 0.5 },
      },
    });
    expect(skill.effect[0]?.type).toBe('heal');
  });

  it('patches damage type and atk scale and appends heal', () => {
    const transform: BasicAttackTransformSpec = {
      primaryPatch: {
        damageType: 'magic',
        amount: { atkScale: 1.2 },
      },
      appendEffects: [
        {
          type: 'heal',
          healSubKind: 'instant',
          target: { kind: 'self' },
          targetShape: 'aoe',
          aoeRadiusPx: 80,
          amount: { kind: 'atkBased', atkScale: 0.3 },
        },
      ],
    };
    const skill = applyBasicAttackTransform(mockBasicSkill(), transform);
    expect(skill.effect[0]?.type).toBe('damage');
    if (skill.effect[0]?.type === 'damage') {
      expect(skill.effect[0].damageType).toBe('magic');
      expect(skill.effect[0].amount.atkScale).toBe(1.2);
    }
    expect(skill.effect[1]?.type).toBe('heal');
  });

  it('reads active transform from status effects (latest wins)', () => {
    const unit = mockUnit([
      {
        id: 'old',
        kind: 'buff',
        overlay: 'basicAttackTransform',
        multiplier: 1,
        durationSec: 5,
        remainingSec: 3,
        basicAttackTransform: { hitCountMultiplier: 2 },
      },
      {
        id: 'new',
        kind: 'buff',
        overlay: 'basicAttackTransform',
        multiplier: 1,
        durationSec: 5,
        remainingSec: 4,
        basicAttackTransform: { hitCountMultiplier: 3 },
      },
    ]);
    expect(getActiveBasicAttackTransform(unit)?.hitCountMultiplier).toBe(3);
    expect(resolveEffectiveBasicAttackSkill(unit, mockBasicSkill()).effect[0]?.hitCount).toBe(
      6,
    );
  });
});
