import { describe, expect, it } from 'vitest';
import { compressDotEffect } from './dotMechanics.ts';
import {
  applyBlazingFlameStack,
  applySeedFlameStack,
  buildBonusActivePendingHit,
  getBlazingFlameStacks,
  getSeedFlameStacks,
  getBlazingFlameMaxStacks,
  hasBlazingFlameUncap,
  processSorcererActiveDamageHit,
  resolveDetonateExplosionDamage,
  SEED_FLAME_MAX_STACKS,
} from './sorcererFlame.ts';
import type { CombatantState, PassiveSkillDef, StatusEffect } from './types.ts';

function mockCombatant(partial: Partial<CombatantState> = {}): CombatantState {
  return {
    id: 'sorcerer',
    name: 'Sorcerer',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'at_sorcerer',
    formationRow: 'back',
    traits: { rangePx: 150, damageType: 'magic' },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    battleX: 0,
    isEnemy: false,
    ...partial,
  };
}

function mockEnemy(id: string, battleX = 100): CombatantState {
  return mockCombatant({
    id,
    name: id,
    isEnemy: true,
    battleX,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
  });
}

const passives: Record<string, PassiveSkillDef> = {
  at_sorcerer_passive_2: {
    id: 'at_sorcerer_passive_2',
    name: '焼き尽くす熾火',
    effect: 'seedFlameOnActiveHit',
  },
  at_sorcerer_passive_3: {
    id: 'at_sorcerer_passive_3',
    name: '連なる炎',
    effect: 'bonusActiveOnHit',
    bonusActiveSkillId: 'at_sorcerer_active_1',
  },
  at_sorcerer_passive_4: {
    id: 'at_sorcerer_passive_4',
    name: '花開く炎',
    effect: 'blazingFlameDetonate',
    blazingFlameDetonateSpreadRadiusPx: 50,
    blazingFlameDetonatePerSeedScale: 0.5,
    blazingFlameDetonateMultiplier: 1.3,
    blazingFlameUncap: true,
  },
};

describe('sorcererFlame', () => {
  it('converts seed flame at max stacks to blazing when cap allows', () => {
    const source = mockCombatant({
      build: {
        learnedPassiveIds: ['at_sorcerer_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockEnemy('e1');

    for (let i = 0; i < SEED_FLAME_MAX_STACKS; i++) {
      applySeedFlameStack(source, target, passives);
    }

    expect(getSeedFlameStacks(target)).toBe(0);
    expect(getBlazingFlameStacks(target)).toBe(1);
  });

  it('keeps seed at max when blazing cap is reached before P4 uncap', () => {
    const source = mockCombatant({
      build: {
        learnedPassiveIds: ['at_sorcerer_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockEnemy('e1');
    applyBlazingFlameStack(source, target, passives, 1);

    for (let i = 0; i < SEED_FLAME_MAX_STACKS; i++) {
      applySeedFlameStack(source, target, passives);
    }

    expect(getBlazingFlameStacks(target)).toBe(1);
    expect(getSeedFlameStacks(target)).toBe(SEED_FLAME_MAX_STACKS);
  });

  it('uncaps blazing flame stacks after P4', () => {
    const source = mockCombatant({
      build: {
        learnedPassiveIds: ['at_sorcerer_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    expect(hasBlazingFlameUncap(source, passives)).toBe(true);
    expect(getBlazingFlameMaxStacks(source, passives)).toBeGreaterThan(1);

    const target = mockEnemy('e1');
    applyBlazingFlameStack(source, target, passives, 1);
    applyBlazingFlameStack(source, target, passives, 1);
    expect(getBlazingFlameStacks(target)).toBe(2);
  });

  it('resolves detonate explosion as (ATK + seed×N)×multiplier', () => {
    const actor = mockCombatant({ atk: 20 });
    const damage = resolveDetonateExplosionDamage(actor, 3, {
      spreadRadiusPx: 50,
      perSeedAtkScale: 0.5,
      explosionMultiplier: 1.3,
    });
    expect(damage).toBe(65);
  });

  it('spreads seed flame within 50px on detonate', () => {
    const source = mockCombatant({
      build: {
        learnedPassiveIds: [
          'at_sorcerer_passive_2',
          'at_sorcerer_passive_4',
        ],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const primary = mockEnemy('e1', 100);
    const near = mockEnemy('e2', 130);
    const far = mockEnemy('e3', 200);
    applyBlazingFlameStack(source, primary, passives, 1);
    applySeedFlameStack(source, primary, passives);

    const outcome = processSorcererActiveDamageHit(
      source,
      primary,
      [source],
      [primary, near, far],
      passives,
      { skillRegistry: { actives: {}, passives: {} } } as never,
      { battleTimeSec: 0 },
    );

    expect(outcome.explosionDamageByTargetId.get('e1')).toBeGreaterThan(0);
    expect(getSeedFlameStacks(primary)).toBe(2);
    expect(getSeedFlameStacks(near)).toBe(1);
    expect(getSeedFlameStacks(far)).toBe(0);
  });

  it('does not recurse P3 on bonus active hit', () => {
    const source = mockCombatant({
      build: {
        learnedPassiveIds: ['at_sorcerer_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockEnemy('e1');
    const pending = buildBonusActivePendingHit(
      source,
      target,
      'at_sorcerer_active_1',
      {
        skillRegistry: {
          actives: {
            at_sorcerer_active_1: {
              id: 'at_sorcerer_active_1',
              name: '炎術',
              effect: [
                {
                  type: 'damage',
                  damageType: 'magic',
                  amount: { kind: 'atkBased', atkScale: 1.4 },
                  target: {
                    kind: 'distance',
                    side: 'enemy',
                    order: 'nearest',
                  },
                },
              ],
            },
          },
          passives: {},
        },
      } as never,
      0,
    );
    expect(pending?.suppressBonusActiveOnHit).toBe(true);
  });

  it('excludes blazing flame from dot compress', () => {
    const effect: StatusEffect = {
      id: 'blazing',
      kind: 'debuff',
      overlay: 'dot',
      dotFlavor: 'blazingFlame',
      dotCompressImmune: true,
      stacks: 1,
      multiplier: 1,
      durationSec: 99999,
      remainingSec: 10,
      amount: { kind: 'atkBased', atkScale: 0.35 },
    };
    compressDotEffect(effect, 0.5);
    expect(effect.remainingSec).toBe(10);
  });
});
