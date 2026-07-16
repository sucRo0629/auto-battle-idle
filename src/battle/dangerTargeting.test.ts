import { describe, expect, it } from 'vitest';
import type { CombatantState, PendingSkillHit, SkillEffectDef } from './types.ts';
import {
  collectDangerTargetSnapshots,
  compareDangerTargetSnapshots,
  isDerivedPendingSkillHit,
  isPendingHitInDangerWindow,
  sortDangerTargetSnapshots,
} from './dangerTargeting.ts';
import { mockCombatant } from './testFixtures.ts';

const damageEffect = {
  type: 'damage',
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'physical',
  amount: { kind: 'atkBased', atkScale: 1 },
} as SkillEffectDef;

function makePendingHit(
  partial: Partial<PendingSkillHit> & Pick<PendingSkillHit, 'actorId' | 'targets'>,
): PendingSkillHit {
  return {
    applyAtBattleSec: 1,
    skillId: 'test_skill',
    skillName: 'test',
    effectDef: damageEffect,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex: 0,
    ...partial,
  };
}

function resolveTargets(
  units: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return (attacker: CombatantState): CombatantState | null => {
    const targetId = mapping[attacker.id];
    return targetId ? byId.get(targetId) ?? null : null;
  };
}

describe('isPendingHitInDangerWindow', () => {
  it('includes both boundaries: battleSec and battleSec + windowSec', () => {
    expect(isPendingHitInDangerWindow(5, 5, 2)).toBe(true);
    expect(isPendingHitInDangerWindow(7, 5, 2)).toBe(true);
  });

  it('excludes hits before battleSec and after the window', () => {
    expect(isPendingHitInDangerWindow(4.99, 5, 2)).toBe(false);
    expect(isPendingHitInDangerWindow(7.01, 5, 2)).toBe(false);
  });
});

describe('collectDangerTargetSnapshots', () => {
  it('counts one current attacker', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false, formationRow: 'front' });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: [],
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: resolveTargets([ally, enemy], { enemy1: 'ally' }),
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.currentAttackerCount).toBe(1);
    expect(snapshots[0]?.pendingAttackerCount).toBe(0);
  });

  it('counts distinct enemies focusing the same target', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemyA, enemyB],
      pendingHits: [],
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: resolveTargets([ally, enemyA, enemyB], {
        enemyA: 'ally',
        enemyB: 'ally',
      }),
    });

    expect(snapshots[0]?.currentAttackerCount).toBe(2);
  });

  it('counts one pending attacker but multiple hits for same enemy MultiHit', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 1, hitIndex: 0, targets: [{ targetId: 'ally' }] }),
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 1.2, hitIndex: 1, targets: [{ targetId: 'ally' }] }),
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 1.4, hitIndex: 2, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingAttackerCount).toBe(1);
    expect(snapshots[0]?.pendingHitCount).toBe(3);
  });

  it('counts distinct pending attackers', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const pending = [
      makePendingHit({ actorId: 'enemyA', applyAtBattleSec: 1, targets: [{ targetId: 'ally' }] }),
      makePendingHit({ actorId: 'enemyB', applyAtBattleSec: 1.5, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemyA, enemyB],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingAttackerCount).toBe(2);
    expect(snapshots[0]?.pendingHitCount).toBe(2);
  });

  it('ignores pending hits outside the danger window', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 8, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 5,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingAttackerCount).toBe(0);
    expect(snapshots[0]?.pendingHitCount).toBe(0);
    expect(snapshots[0]?.earliestPendingAtBattleSec).toBeNull();
  });

  it('includes pending hits on both window boundaries', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 5, targets: [{ targetId: 'ally' }] }),
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 7, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 5,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingHitCount).toBe(2);
    expect(snapshots[0]?.earliestPendingAtBattleSec).toBe(5);
  });

  it('aggregates each target in multi-target pending hits separately', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({
        actorId: 'enemy1',
        applyAtBattleSec: 1,
        targets: [{ targetId: 'allyA' }, { targetId: 'allyB' }],
      }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [allyA, allyB],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    const byId = Object.fromEntries(snapshots.map((snap) => [snap.targetId, snap]));
    expect(byId.allyA?.pendingHitCount).toBe(1);
    expect(byId.allyB?.pendingHitCount).toBe(1);
  });

  it('excludes dead actors from pending aggregation', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true, isAlive: false, hp: 0 });
    const pending = [
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 1, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingHitCount).toBe(0);
  });

  it('excludes dead targets from pending aggregation', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false, isAlive: false, hp: 0 });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({ actorId: 'enemy1', applyAtBattleSec: 1, targets: [{ targetId: 'ally' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots).toHaveLength(0);
  });

  it('excludes same-faction pending hits', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const pending = [
      makePendingHit({ actorId: 'allyA', applyAtBattleSec: 1, targets: [{ targetId: 'allyB' }] }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [allyB],
      opponents: [allyA],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingHitCount).toBe(0);
  });

  it('includes back-row candidates regardless of battleX distance', () => {
    const front = mockCombatant({
      id: 'front',
      isEnemy: false,
      formationRow: 'front',
      battleX: 200,
    });
    const back = mockCombatant({
      id: 'back',
      isEnemy: false,
      formationRow: 'back',
      battleX: 40,
    });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });

    const snapshots = collectDangerTargetSnapshots({
      candidates: [front, back],
      opponents: [enemyA, enemyB],
      pendingHits: [],
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: resolveTargets([front, back, enemyA, enemyB], {
        enemyA: 'front',
        enemyB: 'back',
      }),
    });

    const byId = Object.fromEntries(snapshots.map((snap) => [snap.targetId, snap]));
    expect(byId.back?.currentAttackerCount).toBe(1);
    expect(byId.front?.currentAttackerCount).toBe(1);
  });

  it('excludes derived pending hits flagged by suppress metadata', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({
        actorId: 'enemy1',
        applyAtBattleSec: 1,
        targets: [{ targetId: 'ally' }],
        suppressAllyAttackFollowUp: true,
      }),
    ];

    expect(isDerivedPendingSkillHit(pending[0]!)).toBe(true);

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingHitCount).toBe(0);
  });

  it('excludes non-damage pending effects', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy1', isEnemy: true });
    const pending = [
      makePendingHit({
        actorId: 'enemy1',
        applyAtBattleSec: 1,
        targets: [{ targetId: 'ally' }],
        effectDef: {
          type: 'heal',
          target: { kind: 'self' },
          amount: { kind: 'flat', value: 10 },
        } as SkillEffectDef,
      }),
    ];

    const snapshots = collectDangerTargetSnapshots({
      candidates: [ally],
      opponents: [enemy],
      pendingHits: pending,
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: () => null,
    });

    expect(snapshots[0]?.pendingHitCount).toBe(0);
  });

  it('works symmetrically when sides are flipped for enemy paladin usage', () => {
    const enemyTank = mockCombatant({ id: 'enemyTank', isEnemy: true, formationRow: 'front' });
    const enemyBack = mockCombatant({ id: 'enemyBack', isEnemy: true, formationRow: 'back' });
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });

    const snapshots = collectDangerTargetSnapshots({
      candidates: [enemyTank, enemyBack],
      opponents: [allyA, allyB],
      pendingHits: [
        makePendingHit({ actorId: 'allyA', applyAtBattleSec: 1, targets: [{ targetId: 'enemyTank' }] }),
        makePendingHit({ actorId: 'allyB', applyAtBattleSec: 1.2, targets: [{ targetId: 'enemyTank' }] }),
      ],
      battleSec: 0,
      windowSec: 2,
      resolveCurrentAttackTarget: resolveTargets(
        [enemyTank, enemyBack, allyA, allyB],
        {
          allyA: 'enemyTank',
          allyB: 'enemyBack',
        },
      ),
    });

    const byId = Object.fromEntries(snapshots.map((snap) => [snap.targetId, snap]));
    expect(byId.enemyTank?.currentAttackerCount).toBe(1);
    expect(byId.enemyTank?.pendingAttackerCount).toBe(2);
    expect(byId.enemyBack?.currentAttackerCount).toBe(1);
  });
});

describe('compareDangerTargetSnapshots', () => {
  it('prefers higher concentration over lower HP', () => {
    const focused = {
      targetId: 'focused',
      currentAttackerCount: 2,
      pendingAttackerCount: 0,
      pendingHitCount: 0,
      earliestPendingAtBattleSec: null,
      hpRatio: 0.9,
    };
    const lowHp = {
      targetId: 'lowHp',
      currentAttackerCount: 1,
      pendingAttackerCount: 0,
      pendingHitCount: 0,
      earliestPendingAtBattleSec: null,
      hpRatio: 0.1,
    };

    expect(compareDangerTargetSnapshots(focused, lowHp)).toBeLessThan(0);
    expect(sortDangerTargetSnapshots([lowHp, focused])[0]?.targetId).toBe('focused');
  });

  it('uses hpRatio only when concentration metrics tie', () => {
    const lowerHp = {
      targetId: 'b',
      currentAttackerCount: 1,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: 1,
      hpRatio: 0.2,
    };
    const higherHp = {
      targetId: 'a',
      currentAttackerCount: 1,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: 1,
      hpRatio: 0.8,
    };

    expect(compareDangerTargetSnapshots(lowerHp, higherHp)).toBeLessThan(0);
  });

  it('prefers earlier pending apply time on ties', () => {
    const earlier = {
      targetId: 'earlier',
      currentAttackerCount: 0,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: 1,
      hpRatio: 0.5,
    };
    const later = {
      targetId: 'later',
      currentAttackerCount: 0,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: 2,
      hpRatio: 0.5,
    };

    expect(compareDangerTargetSnapshots(earlier, later)).toBeLessThan(0);
  });

  it('prefers targets with pending over those without when earlier metrics tie', () => {
    const withPending = {
      targetId: 'with',
      currentAttackerCount: 0,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: 3,
      hpRatio: 0.5,
    };
    const withoutPending = {
      targetId: 'without',
      currentAttackerCount: 0,
      pendingAttackerCount: 1,
      pendingHitCount: 1,
      earliestPendingAtBattleSec: null,
      hpRatio: 0.5,
    };

    expect(compareDangerTargetSnapshots(withPending, withoutPending)).toBeLessThan(0);
  });

  it('uses targetId for fully tied snapshots', () => {
    const snapA = {
      targetId: 'alpha',
      currentAttackerCount: 1,
      pendingAttackerCount: 0,
      pendingHitCount: 0,
      earliestPendingAtBattleSec: null,
      hpRatio: 0.5,
    };
    const snapB = {
      targetId: 'beta',
      currentAttackerCount: 1,
      pendingAttackerCount: 0,
      pendingHitCount: 0,
      earliestPendingAtBattleSec: null,
      hpRatio: 0.5,
    };

    expect(compareDangerTargetSnapshots(snapA, snapB)).toBeLessThan(0);
    expect(sortDangerTargetSnapshots([snapB, snapA]).map((snap) => snap.targetId)).toEqual([
      'alpha',
      'beta',
    ]);
  });
});
