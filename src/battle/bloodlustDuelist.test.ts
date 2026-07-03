import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { resolveSelfHpRatioBuffScale } from './passiveEffects.ts';
import { syncBloodlustDuelistAuras } from './bloodlustDuelist.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: overrides.hp ?? 50,
    maxHp: overrides.maxHp ?? 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['bloodlust'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'ally',
    iconKey: 'ally',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

function curvedAtkMultiplier(
  unit: CombatantState,
  atkRatio: number,
  atkMulMax: number,
  exponent: number,
): number {
  const tLinear = resolveSelfHpRatioBuffScale(unit, atkRatio);
  const tCurve = exponent === 1 ? tLinear : tLinear ** exponent;
  return 1 + (atkMulMax - 1) * tCurve;
}

function linearAtkMultiplier(
  unit: CombatantState,
  atkRatio: number,
  atkMulMax: number,
): number {
  const t = resolveSelfHpRatioBuffScale(unit, atkRatio);
  return 1 + (atkMulMax - 1) * t;
}

function readAtkMultiplier(unit: CombatantState): number | undefined {
  return unit.statusEffects.find(
    (effect) => effect.stat === 'atk' && effect.id.includes('bloodlust_hp'),
  )?.multiplier;
}

function readDefMultiplier(unit: CombatantState): number | undefined {
  return unit.statusEffects.find(
    (effect) => effect.stat === 'def' && effect.id.includes('bloodlust_hp'),
  )?.multiplier;
}

const curvedPassive: PassiveSkillDef = {
  id: 'bloodlust',
  name: '流血闘志',
  effect: 'bloodlustDuelist',
  bloodlustBlockChance: 0,
  bloodlustAtkMaxBuffAtHpRatio: 0,
  bloodlustAtkBuffMultiplierMax: 4,
  bloodlustAtkBuffCurveExponent: 3,
  bloodlustDefMaxBuffAtHpRatio: 0.5,
  bloodlustDefBuffMultiplierMax: 1.5,
};

const linearPassive: PassiveSkillDef = {
  ...curvedPassive,
  bloodlustAtkBuffCurveExponent: 1,
};

describe('bloodlustDuelist', () => {
  it('applies cubic ATK curve at 50% / 20% / 1 HP', () => {
    const passives = { bloodlust: curvedPassive };

    const at50 = mockUnit({ id: 'u50', hp: 50, maxHp: 100 });
    syncBloodlustDuelistAuras([at50], passives);
    expect(readAtkMultiplier(at50)).toBeCloseTo(
      curvedAtkMultiplier(at50, 0, 4, 3),
      4,
    );
    expect(readAtkMultiplier(at50)).toBeCloseTo(1.375, 2);

    const at20 = mockUnit({ id: 'u20', hp: 20, maxHp: 100 });
    syncBloodlustDuelistAuras([at20], passives);
    expect(readAtkMultiplier(at20)).toBeCloseTo(2.536, 2);

    const at1 = mockUnit({ id: 'u1', hp: 1, maxHp: 100 });
    syncBloodlustDuelistAuras([at1], passives);
    expect(readAtkMultiplier(at1)).toBeCloseTo(3.91, 2);
  });

  it('matches linear ATK when exponent is 1 or omitted', () => {
    const passives = { bloodlust: linearPassive };
    const unit = mockUnit({ id: 'linear', hp: 30, maxHp: 100 });
    syncBloodlustDuelistAuras([unit], passives);
    expect(readAtkMultiplier(unit)).toBeCloseTo(
      linearAtkMultiplier(unit, 0, 4),
      4,
    );

    const omitted: PassiveSkillDef = { ...curvedPassive };
    delete omitted.bloodlustAtkBuffCurveExponent;
    const unitOmitted = mockUnit({ id: 'omitted', hp: 30, maxHp: 100 });
    syncBloodlustDuelistAuras([unitOmitted], { bloodlust: omitted });
    expect(readAtkMultiplier(unitOmitted)).toBeCloseTo(
      linearAtkMultiplier(unitOmitted, 0, 4),
      4,
    );
  });

  it('keeps DEF scaling linear', () => {
    const passives = { bloodlust: curvedPassive };
    const unit = mockUnit({ id: 'def', hp: 50, maxHp: 100 });
    syncBloodlustDuelistAuras([unit], passives);
    const defT = resolveSelfHpRatioBuffScale(unit, 0.5);
    const expectedDef = 1 + (1.5 - 1) * defT;
    expect(readDefMultiplier(unit)).toBeCloseTo(expectedDef, 4);
  });
});
