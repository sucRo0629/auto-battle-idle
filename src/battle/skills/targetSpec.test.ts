import { describe, expect, it } from 'vitest';
import type { CombatantState } from '../types.ts';
import { loadGameData } from '../data/loadGameData.ts';
import {
  applyIncludeSelfFilter,
  filterSelectablePool,
  getTargetPool,
  orderPoolByTarget,
  normalizeTarget,
  pickDefaultHostileSingleTarget,
  pickMoveAnchorOptions,
  pickTargetFromPool,
  resolveApproachTargetSpec,
  distanceSpecIncludesSelf,
  isDefaultHostileChaseSpec,
  resolveEditorHostileTargetMode,
  sanitizeHostileTargetSpecForJson,
  shouldUseHostileTargetEditorMode,
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
    res?: number;
    rangePx?: number;
    damageType?: 'physical' | 'magic';
    statusEffects?: CombatantState['statusEffects'];
    barrierHp?: number;
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
    res: opts.res ?? 0,
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
    corpseVisible: true,
  };
}

const gameData = loadGameData();

function withBasicSkill(
  unit: CombatantState,
  skillId: string,
): CombatantState {
  return {
    ...unit,
    cooldowns: [{ skillId, remaining: 0, slotKind: 'basic' }],
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

  it('picks front enemy by min battleX (enemy frontline)', () => {
    const spec = { kind: 'distance', side: 'enemy', order: 'nearest' } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    const picked = pickTargetFromPool(spec, actor, pool);
    expect(picked?.id).toBe('e2');
  });

  it('rear toAnchor move anchor picks enemy frontline contact not battle-line depth nearest', () => {
    const spec = { kind: 'distance', side: 'enemy', order: 'nearest' } as const;
    const pool = getTargetPool(spec, actor, allies, enemies);
    const moveEffect = {
      type: 'move',
      moveMode: 'toAnchor',
      anchorOffsetPx: 32,
    } as const;
    const picked = pickTargetFromPool(
      spec,
      actor,
      pool,
      pickMoveAnchorOptions(actor, moveEffect),
    );
    // 敵前衛 = min battleX（e2=40）。AttackTarget nearest の max（e1=80）ではない
    expect(picked?.id).toBe('e2');
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

  it('includes actor in ally hp ratio pool for heal effects', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const woundedHealer = mockUnit('a1', 200, { hp: 30, maxHp: 100 });
    const healthier = mockUnit('a2', 150, { hp: 60, maxHp: 100 });
    const pool = getTargetPool(spec, woundedHealer, [woundedHealer, healthier], enemies);
    expect(
      pickTargetFromPool(spec, woundedHealer, pool, {
        includeActorInAllyPool: true,
      })?.id,
    ).toBe('a1');
    expect(
      orderPoolByTarget(spec, woundedHealer, pool, {
        includeActorInAllyPool: true,
      }).map((u) => u.id),
    ).toEqual(['a1', 'a2']);
  });

  it('falls back to self for ally stat target when alone in party', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const solo = mockUnit('solo', 200);
    const pool = getTargetPool(spec, solo, [solo], []);
    expect(pickTargetFromPool(spec, solo, pool)?.id).toBe('solo');
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

  it('filters ranged attackers by attackMethod', () => {
    const rangedEnemy = withBasicSkill(
      mockUnit('e3', 60, { isEnemy: true, rangePx: 30 }),
      'at_ranger_basic_attack',
    );
    const meleeEnemy = withBasicSkill(
      mockUnit('e4', 50, { isEnemy: true, rangePx: 300 }),
      'at_swordsman_basic_attack',
    );
    const poolEnemies = [...enemies, rangedEnemy, meleeEnemy];
    const spec = { kind: 'attackType', ranged: true } as const;
    const pool = getTargetPool(spec, actor, allies, poolEnemies, gameData);
    expect(pool.map((u) => u.id)).toEqual(['e3']);
  });

  it('heal-only supporter is excluded from ranged pool even when rangePx >= 100', () => {
    const healSupporter = withBasicSkill(
      mockUnit('e3', 60, { isEnemy: true, rangePx: 110 }),
      'sp_cleric_mod_single_mend',
    );
    healSupporter.role = 'supporter';
    const rangedAttacker = withBasicSkill(
      mockUnit('e4', 50, { isEnemy: true, rangePx: 30 }),
      'at_ranger_basic_attack',
    );
    const poolEnemies = [...enemies, healSupporter, rangedAttacker];
    const spec = { kind: 'attackType', ranged: true } as const;
    const pool = getTargetPool(spec, actor, allies, poolEnemies, gameData);
    expect(pool.map((u) => u.id)).toEqual(['e4']);
  });

  it('excludeRoles still filters role when attackMethod matches', () => {
    const rangedSupporter = withBasicSkill(
      mockUnit('e3', 60, { isEnemy: true, rangePx: 30 }),
      'at_ranger_basic_attack',
    );
    rangedSupporter.role = 'supporter';
    const spec = {
      kind: 'attackType',
      ranged: true,
      excludeRoles: ['supporter'],
    } as const;
    const pool = getTargetPool(spec, actor, allies, [rangedSupporter], gameData);
    expect(pool.map((u) => u.id)).toEqual([]);
  });

  it('pickDefaultHostileSingleTarget prefers front defender by battleX not actor distance', () => {
    const enemyActor = mockUnit('e1', 180, { isEnemy: true });
    const frontDefender = mockUnit('front-def', 220);
    frontDefender.role = 'defender';
    const rearDefender = mockUnit('rear-def', 200);
    rearDefender.role = 'defender';
    const pool = [frontDefender, rearDefender];
    expect(pickDefaultHostileSingleTarget(enemyActor, pool)?.id).toBe('front-def');
  });

  it('pickDefaultHostileSingleTarget ally actor picks min battleX enemy', () => {
    const ally = mockUnit('a1', 100);
    const frontEnemy = mockUnit('front', 200, { isEnemy: true });
    const rearEnemy = mockUnit('rear', 280, { isEnemy: true });
    expect(
      pickDefaultHostileSingleTarget(ally, [rearEnemy, frontEnemy])?.id,
    ).toBe('front');
  });

  it('pickDefaultHostileSingleTarget tie-breaks equal battleX by id', () => {
    const ally = mockUnit('a1', 100);
    const eB = mockUnit('e-b', 200, { isEnemy: true });
    const eA = mockUnit('e-a', 200, { isEnemy: true });
    expect(pickDefaultHostileSingleTarget(ally, [eB, eA])?.id).toBe('e-a');
  });

  it('pickDefaultHostileSingleTarget falls back to full pool frontmost when no defender', () => {
    const enemyActor = mockUnit('e1', 300, { isEnemy: true });
    const striker = mockUnit('striker', 220);
    const backliner = mockUnit('backliner', 80);
    expect(
      pickDefaultHostileSingleTarget(enemyActor, [striker, backliner])?.id,
    ).toBe('striker');
  });

  it('enemy default nearest prefers defender role over nearer attacker', () => {
    const enemyActor = mockUnit('e1', 300, { isEnemy: true });
    const guard = mockUnit('guard', 200, { def: 50 });
    guard.role = 'defender';
    const striker = mockUnit('striker', 260, { def: 5 });
    const spec = { kind: 'distance', side: 'enemy', order: 'nearest' } as const;
    const pool = getTargetPool(spec, enemyActor, [guard, striker], [enemyActor]);
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

  it('keeps self-only ally target when no other allies exist', () => {
    const spec = {
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    } as const;
    const solo = mockUnit('solo', 200);
    const targets = applyIncludeSelfFilter(spec, solo, [{ unit: solo }]);
    expect(targets.map((entry) => entry.unit.id)).toEqual(['solo']);
  });

  it('enemy distance/enemy/farthest picks farthest player ally by battleX distance', () => {
    const enemyActor = mockUnit('e1', 400, { isEnemy: true });
    const front = mockUnit('front', 350);
    const back = mockUnit('back', 200);
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

  it('normalizes target.stat maxHp for editor and ballista passives', () => {
    expect(
      normalizeTarget({
        kind: 'stat',
        side: 'enemy',
        stat: 'maxHp',
        order: 'highest',
      }),
    ).toEqual({
      kind: 'stat',
      side: 'enemy',
      stat: 'maxHp',
      order: 'highest',
    });
  });
});

describe('editor hostile target helpers', () => {
  it('detects default hostile chase spec', () => {
    expect(
      isDefaultHostileChaseSpec({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe(true);
    expect(
      isDefaultHostileChaseSpec({
        kind: 'attackType',
        ranged: true,
      }),
    ).toBe(false);
  });

  it('sanitizeHostileTargetSpecForJson omits default only', () => {
    expect(
      sanitizeHostileTargetSpecForJson({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBeUndefined();
    expect(
      sanitizeHostileTargetSpecForJson({
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      }),
    ).toEqual({
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    });
  });

  it('shouldUseHostileTargetEditorMode excludes self and ally', () => {
    expect(shouldUseHostileTargetEditorMode({ kind: 'self' })).toBe(false);
    expect(
      shouldUseHostileTargetEditorMode({
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      }),
    ).toBe(false);
    expect(
      shouldUseHostileTargetEditorMode({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe(true);
  });

  it('resolveEditorHostileTargetMode maps default vs priority', () => {
    expect(resolveEditorHostileTargetMode(undefined)).toBe('default');
    expect(
      resolveEditorHostileTargetMode({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe('default');
    expect(
      resolveEditorHostileTargetMode({
        kind: 'attackType',
        ranged: true,
      }),
    ).toBe('priority');
  });
});

describe('editor hostile target helpers', () => {
  it('detects default hostile chase spec', () => {
    expect(
      isDefaultHostileChaseSpec({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe(true);
    expect(
      isDefaultHostileChaseSpec({
        kind: 'attackType',
        ranged: true,
      }),
    ).toBe(false);
  });

  it('sanitizeHostileTargetSpecForJson omits default only', () => {
    expect(
      sanitizeHostileTargetSpecForJson({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBeUndefined();
    expect(
      sanitizeHostileTargetSpecForJson({
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      }),
    ).toEqual({
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    });
  });

  it('shouldUseHostileTargetEditorMode excludes self and ally', () => {
    expect(shouldUseHostileTargetEditorMode({ kind: 'self' })).toBe(false);
    expect(
      shouldUseHostileTargetEditorMode({
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      }),
    ).toBe(false);
    expect(
      shouldUseHostileTargetEditorMode({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe(true);
  });

  it('resolveEditorHostileTargetMode maps default vs priority', () => {
    expect(resolveEditorHostileTargetMode(undefined)).toBe('default');
    expect(
      resolveEditorHostileTargetMode({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toBe('default');
    expect(
      resolveEditorHostileTargetMode({
        kind: 'attackType',
        ranged: true,
      }),
    ).toBe('priority');
  });
});
