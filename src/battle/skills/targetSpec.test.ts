import { describe, expect, it } from 'vitest';
import type { CombatantState } from '../types.ts';
import {
  applyIncludeSelfFilter,
  filterSelectablePool,
  getTargetPool,
  orderPoolByTarget,
  normalizeTarget,
  pickTargetFromPool,
  resolveApproachTargetSpec,
  distanceSpecIncludesSelf,
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
    barrierHp?: number;
    threat?: number;
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
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: opts.statusEffects ?? [],
    barrierHp: opts.barrierHp ?? 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: opts.isEnemy ?? false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
    ...(opts.threat !== undefined ? { threat: opts.threat } : {}),
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

  it('resolveApproachTargetSpec maps enemy selfOrigin to nearest', () => {
    expect(
      resolveApproachTargetSpec({
        kind: 'distance',
        side: 'enemy',
        order: 'selfOrigin',
      }),
    ).toEqual({
      kind: 'distance',
      side: 'enemy',
      order: 'nearest',
    });
  });

  it('parses distance selfOrigin with includeSelf', () => {
    expect(
      normalizeTarget({
        kind: 'distance',
        side: 'ally',
        order: 'selfOrigin',
        includeSelf: true,
      }),
    ).toEqual({
      kind: 'distance',
      side: 'ally',
      order: 'selfOrigin',
      includeSelf: true,
    });
  });

  it('treats ally selfOrigin as self-including and enemy selfOrigin as self-excluding', () => {
    const allySpec = {
      kind: 'distance',
      side: 'ally',
      order: 'selfOrigin',
    } as const;
    const enemySpec = {
      kind: 'distance',
      side: 'enemy',
      order: 'selfOrigin',
    } as const;
    expect(distanceSpecIncludesSelf(allySpec)).toBe(true);
    expect(distanceSpecIncludesSelf(enemySpec)).toBe(false);
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

  it('ignores barrierHp when picking ally by hp ratio', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const fullHpWithBarrier = mockUnit('shielded', 200, {
      hp: 100,
      maxHp: 100,
      barrierHp: 80,
    });
    const lowHp = mockUnit('wounded', 180, { hp: 30, maxHp: 100 });
    const pool = getTargetPool(spec, actor, [fullHpWithBarrier, lowHp], enemies);
    expect(pickTargetFromPool(spec, actor, pool)?.id).toBe('wounded');
  });

  it('filterSelectablePool excludes full-HP allies for hp ratio spec', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const damaged = mockUnit('wounded', 180, { hp: 30, maxHp: 100 });
    const healthy = mockUnit('healthy', 200, { hp: 100, maxHp: 100 });
    const pool = getTargetPool(spec, actor, [damaged, healthy], enemies);
    expect(filterSelectablePool(spec, pool).map((u) => u.id)).toEqual([
      'wounded',
    ]);
  });

  it('filters ranged attackers', () => {
    const rangedEnemy = mockUnit('e3', 60, { isEnemy: true, rangePx: 100 });
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
    expect(picked?.id).toBe('guard');
  });

  it('ally selfOrigin keeps the actor in target ordering', () => {
    const spec = {
      kind: 'distance',
      side: 'ally',
      order: 'selfOrigin',
    } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    expect(pickTargetFromPool(spec, actor, pool)?.id).toBe('a1');
    expect(orderPoolByTarget(spec, actor, pool).map((u) => u.id)[0]).toBe('a1');
  });

  it('enemy selfOrigin never keeps the actor in target filtering', () => {
    const spec = {
      kind: 'distance',
      side: 'enemy',
      order: 'selfOrigin',
    } as const;
    const targets = applyIncludeSelfFilter(spec, actor, [
      { unit: actor },
      { unit: enemies[0]! },
    ]);
    expect(targets.map((entry) => entry.unit.id)).toEqual(['e1']);
  });

  it('enemy distance/enemy/farthest picks farthest player ally by battleX distance', () => {
    const enemyActor = mockUnit('e1', 400, { isEnemy: true });
    const front = mockUnit('front', 350, { threat: 100 });
    const back = mockUnit('back', 200, { threat: 10 });
    const spec = { kind: 'distance', side: 'enemy', order: 'farthest' } as const;
    const pool = getTargetPool(spec, enemyActor, [front, back], [enemyActor]);
    const picked = pickTargetFromPool(spec, enemyActor, pool);
    expect(picked?.id).toBe('back');
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
    } as const satisfies import('../types.ts').TargetSpec;
    const pool = getTargetPool(spec, actor, allies, [enemies[0]!, debuffed]);
    expect(pool.map((u) => u.id)).toEqual(['e2']);
  });
});
