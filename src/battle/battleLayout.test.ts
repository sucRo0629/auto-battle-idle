import { describe, expect, it } from 'vitest';
import {
  engagedMinBodyGap,
  enemyRangedRearGap,
} from './battleConstants.ts';
import {
  getBattleContactPlayerVisual,
  syncAllFieldX,
} from './combatPosition.ts';
import { hideFallenAllyCorpses } from './entities.ts';
import type { CombatantState, GameData } from './types.ts';
import {
  getLeadingPlayerFront,
  resolveEngagedFormationOverlaps,
  resolveEngagedLayout,
} from './battleLayout.ts';

import { mockCombatant as mockCombatantBase } from './testFixtures.ts';

function mockCombatant(overrides: Partial<CombatantState> & { id: string }): CombatantState {
  return mockCombatantBase(overrides, 'meleeFront');
}

const gameData = {
  skillRegistry: {
    passives: {},
    actives: {
      basic: {
        id: 'basic',
        name: 'basic',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
          },
        ],
      },
    },
  },
} as unknown as GameData;

describe('battleLayout snapshots', () => {
  it('resolveEngagedLayout returns stable player and enemy visual targets', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: () => null,
    });

    expect(layout).not.toBeNull();
    const guardX = layout!.playerBattleX.get('guard')!;
    const meleeX = layout!.enemyBattleX.get('melee')!;
    expect(meleeX).toBeGreaterThanOrEqual(guardX);
  });

  it('resolveEngagedLayout keeps ranged enemy at formation depth behind melee', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
        {
          id: 'archer',
          role: 'attacker',
          formationRow: 'back',
          rangePx: 100,
          isAlive: true,
          battleX: 60,
          engagedBattleLaneX: -120,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
        {
          id: 'ranged',
          isAlive: true,
          rangePx: 100,
          battleX: 320,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: (enemyId) =>
        enemyId === 'ranged' ? 200 : null,
    });

    expect(layout).not.toBeNull();
    const meleeX = layout!.enemyBattleX.get('melee')!;
    const rangedX = layout!.enemyBattleX.get('ranged')!;
    expect(rangedX).toBeGreaterThan(meleeX);
    expect(rangedX - meleeX).toBeGreaterThanOrEqual(enemyRangedRearGap() - 1);
  });

  it('L10: same effectiveRangePx enemies share contact stop line', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'contact-a',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
        {
          id: 'contact-b',
          isAlive: true,
          rangePx: 0,
          battleX: 260,
          engagedMeleeDepthSlot: 1,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: () => null,
    });

    expect(layout).not.toBeNull();
    expect(layout!.enemyBattleX.get('contact-a')).toBe(
      layout!.enemyBattleX.get('contact-b'),
    );
  });

  it('L10: different effectiveRangePx enemies separate by px depth', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'short',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
        {
          id: 'mid',
          isAlive: true,
          rangePx: 30,
          battleX: 260,
          engagedMeleeDepthSlot: 0,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: () => null,
    });

    expect(layout).not.toBeNull();
    const shortX = layout!.enemyBattleX.get('short')!;
    const midX = layout!.enemyBattleX.get('mid')!;
    expect(midX - shortX).toBe(30);
  });

  it('resolveEngagedLayout keeps ranged behind rearmost melee slot', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'melee-a',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
        {
          id: 'melee-b',
          isAlive: true,
          rangePx: 0,
          battleX: 260,
          engagedMeleeDepthSlot: 1,
        },
        {
          id: 'ranged',
          isAlive: true,
          rangePx: 100,
          battleX: 320,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: (enemyId) =>
        enemyId === 'ranged' ? 200 : null,
    });

    expect(layout).not.toBeNull();
    const meleeAX = layout!.enemyBattleX.get('melee-a')!;
    const meleeBX = layout!.enemyBattleX.get('melee-b')!;
    expect(meleeBX).toBe(meleeAX);
    const rangedX = layout!.enemyBattleX.get('ranged')!;
    expect(rangedX - meleeBX).toBeGreaterThanOrEqual(enemyRangedRearGap() - 1);
  });

  it('keeps back row separated when only one front-row player remains', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'sword',
          role: 'attacker',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          battleX: 180,
          engagedBattleLaneX: 0,
        },
        {
          id: 'cleric',
          role: 'supporter',
          formationRow: 'back',
          rangePx: 0,
          isAlive: true,
          battleX: 120,
        },
        {
          id: 'ranger',
          role: 'attacker',
          formationRow: 'back',
          rangePx: 100,
          isAlive: true,
          battleX: 88,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeDepthSlot: 0,
        },
      ],
      playerContactBattleX: 180,
      battleOffset: 20,
      frontEnemyBattleAnchor: 270,
      resolveRangedTargetBattleX: () => null,
    });
    const swordX = layout!.playerBattleX.get('sword')!;
    const clericX = layout!.playerBattleX.get('cleric')!;
    const rangerX = layout!.playerBattleX.get('ranger')!;
    expect(swordX).toBeGreaterThan(rangerX);
    expect(clericX - rangerX).toBeGreaterThanOrEqual(engagedMinBodyGap() - 1);
  });

  it('hideFallenAllyCorpses clears corpseVisible for dead players only', () => {
    const living = mockCombatant({ id: 'living' });
    const fallen = mockCombatant({ id: 'fallen', hp: 0, isAlive: false, corpseVisible: true });
    hideFallenAllyCorpses([living, fallen]);
    expect(living.corpseVisible).toBe(true);
    expect(fallen.corpseVisible).toBe(false);
  });

  it('getLeadingPlayerFront picks max battleX on leading row', () => {
    const front = getLeadingPlayerFront([
      { id: 'g', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true, battleX: 200 },
      { id: 's', role: 'attacker', formationRow: 'front', rangePx: 0, isAlive: true, battleX: 180 },
    ]);
    expect(front?.battleX).toBe(200);
  });
});

describe('battle contact (R1-fix: battleX single)', () => {
  it('getBattleContactPlayerVisual picks rightmost battleX contact', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 180,
      visualX: 200,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 220,
      visualX: 120,
    });
    const contact = getBattleContactPlayerVisual([guard, archer], gameData);
    expect(contact?.battleX).toBe(220);
  });

  it('syncAllFieldX mirrors battleX into visualX', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 180,
      visualX: 200,
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 250,
      visualX: 0,
    });
    syncAllFieldX([guard, enemy]);
    expect(guard.visualX).toBe(180);
    expect(enemy.visualX).toBe(250);
  });
});

describe('resolveEngagedFormationOverlaps', () => {
  function meleeUnit(
    overrides: Partial<CombatantState> & { id: string; rangePx: number },
  ): CombatantState {
    const { rangePx, ...rest } = overrides;
    return mockCombatant({
      formationRow: 'front',
      traits: {
        rangePx,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
      ...rest,
    });
  }

  it('excludes skill-motion units so allies are not pulled by temporary battleX', () => {
    const assassin = meleeUnit({
      id: 'as',
      role: 'attacker',
      rangePx: 15,
      battleX: 250,
    });
    const guardian = meleeUnit({
      id: 'guard',
      role: 'defender',
      rangePx: 10,
      battleX: 120,
    });
    const guardianX = guardian.battleX;

    resolveEngagedFormationOverlaps(
      [assassin, guardian],
      'front',
      () => true,
      (id) => id === 'as',
    );
    expect(guardian.battleX).toBe(guardianX);
  });

  it('still resolves overlap among non-motion allies when one unit is in skill motion', () => {
    const warrior = meleeUnit({
      id: 'war',
      role: 'attacker',
      rangePx: 30,
      battleX: 80,
    });
    const guardian = meleeUnit({
      id: 'guard',
      role: 'defender',
      rangePx: 10,
      battleX: 82,
    });
    const assassin = meleeUnit({
      id: 'as',
      role: 'attacker',
      rangePx: 5,
      battleX: 250,
    });

    resolveEngagedFormationOverlaps(
      [warrior, guardian, assassin],
      'front',
      () => true,
      (id) => id === 'as',
    );
    expect(guardian.battleX).toBeGreaterThanOrEqual(warrior.battleX + 3);
  });
});
