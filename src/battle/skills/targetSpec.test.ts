import { describe, expect, it } from 'vitest';
import type { CombatantState } from '../types.ts';
import {
  formatTargetLabel,
  getTargetPool,
  normalizeTarget,
  pickTargetFromPool,
} from './targetSpec.ts';

function mockUnit(
  id: string,
  battleX: number,
  opts: {
    hp?: number;
    maxHp?: number;
    isEnemy?: boolean;
    atk?: number;
    def?: number;
    reg?: number;
    rangePx?: number;
    damageType?: 'physical' | 'magic';
    statusEffects?: CombatantState['statusEffects'];
  } = {},
): CombatantState {
  const maxHp = opts.maxHp ?? 100;
  const hp = opts.hp ?? maxHp;
  return {
    id,
    name: id,
    hp,
    maxHp,
    atk: opts.atk ?? 10,
    def: opts.def ?? 5,
    reg: opts.reg ?? 0,
    isAlive: hp > 0,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: opts.rangePx ?? 0,
      damageType: opts.damageType ?? 'physical',
      basicAttackVfx: { preset: 'slash' },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: opts.statusEffects ?? [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: opts.isEnemy ?? false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
  };
}

describe('normalizeTarget', () => {
  it('converts legacy frontEnemy', () => {
    expect(normalizeTarget('frontEnemy')).toEqual({
      kind: 'distance',
      side: 'enemy',
      order: 'nearest',
    });
  });

  it('merges debuffedEnemy with filter tags', () => {
    expect(
      normalizeTarget('debuffedEnemy', 'debuffedEnemy', ['def']),
    ).toEqual({
      kind: 'status',
      side: 'enemy',
      debuffTags: ['def'],
    });
  });
});

describe('getTargetPool / pickTargetFromPool', () => {
  const allies = [
    mockUnit('a1', 200),
    mockUnit('a2', 150, { hp: 40, maxHp: 100 }),
  ];
  const enemies = [
    mockUnit('e1', 80, { isEnemy: true }),
    mockUnit('e2', 40, { isEnemy: true, hp: 20 }),
  ];
  const actor = allies[0]!;

  it('picks front enemy by battleX', () => {
    const spec = { kind: 'distance', side: 'enemy', order: 'nearest' } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    const picked = pickTargetFromPool(spec, actor, pool);
    expect(picked?.id).toBe('e1');
  });

  it('picks lowest hp enemy', () => {
    const spec = {
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'lowest',
    } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    expect(pickTargetFromPool(spec, actor, pool)?.id).toBe('e2');
  });

  it('picks most damaged ally by hp ratio', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    expect(pickTargetFromPool(spec, actor, pool)?.id).toBe('a2');
  });

  it('filters ranged attackers', () => {
    const rangedEnemy = mockUnit('e3', 60, { isEnemy: true, rangePx: 50 });
    const poolEnemies = [...enemies, rangedEnemy];
    const spec = { kind: 'attackType', ranged: true } as const;
    const pool = getTargetPool(spec, actor, allies, poolEnemies);
    expect(pool.map((u) => u.id)).toEqual(['e3']);
  });

  it('enemy basic attack pools and picks player allies', () => {
    const enemyActor = mockUnit('e1', 300, { isEnemy: true });
    const guard = mockUnit('guard', 200, { threat: 80 });
    const healer = mockUnit('healer', 250, { threat: 20 });
    const spec = { kind: 'distance', side: 'enemy', order: 'nearest' } as const;
    const pool = getTargetPool(spec, enemyActor, [guard, healer], [enemyActor]);
    expect(pool.map((u) => u.id).sort()).toEqual(['guard', 'healer']);
    const picked = pickTargetFromPool(spec, enemyActor, pool);
    expect(['guard', 'healer']).toContain(picked?.id);
  });

  it('filters by debuff status', () => {
    const debuffed = mockUnit('e2', 40, {
      isEnemy: true,
      statusEffects: [
        {
          id: 'd1',
          kind: 'debuff',
          stat: 'def',
          multiplier: 0.8,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const spec = {
      kind: 'status',
      side: 'enemy',
      debuffTags: ['def'],
    } as const;
    const pool = getTargetPool(spec, actor, allies, [enemies[0]!, debuffed]);
    expect(pool.map((u) => u.id)).toEqual(['e2']);
  });
});

describe('formatTargetLabel', () => {
  it('formats distance target', () => {
    expect(
      formatTargetLabel({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe('敵・最近');
  });
});
