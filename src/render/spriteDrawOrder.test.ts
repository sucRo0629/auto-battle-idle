import { describe, expect, it } from 'vitest';
import { RANGED_ATTACK_MIN_PX } from '../battle/types.ts';
import {
  allyRoleBackDepth,
  compareSpriteDrawOrder,
  factionBackDepth,
  sortForSpriteDraw,
  sortForSpriteDrawPass,
} from './spriteDrawOrder.ts';

describe('spriteDrawOrder', () => {
  it('breaks ties at same depthOffsetY with enemy before ally', () => {
    const enemy = { id: 'e1', x: 300, isEnemy: true, depthOffsetY: 0 };
    const ally = { id: 'a1', x: 80, isEnemy: false, depthOffsetY: 0 };
    expect(compareSpriteDrawOrder(enemy, ally)).toBeLessThan(0);
    expect(sortForSpriteDrawPass([ally, enemy]).map((l) => l.id)).toEqual([
      'e1',
      'a1',
    ]);
  });

  it('draws shallower depthOffsetY in front across factions', () => {
    const ironGuard = {
      id: 'guard',
      x: 450,
      isEnemy: false,
      role: 'defender' as const,
      depthOffsetY: 20,
    };
    const enemy = {
      id: 'enemy',
      x: 420,
      isEnemy: true,
      rangePx: 40,
      depthOffsetY: 0,
    };
    expect(sortForSpriteDrawPass([ironGuard, enemy]).map((l) => l.id)).toEqual([
      'guard',
      'enemy',
    ]);
  });

  it('draws ally back row before front row within the same role band', () => {
    const back = {
      id: 'back',
      x: 20,
      isEnemy: false,
      role: 'defender' as const,
    };
    const front = {
      id: 'front',
      x: 84,
      isEnemy: false,
      role: 'defender' as const,
    };
    expect(compareSpriteDrawOrder(back, front)).toBeLessThan(0);
    expect(sortForSpriteDraw([front, back]).map((l) => l.id)).toEqual([
      'back',
      'front',
    ]);
  });

  it('draws enemy rear line before front line within the same faction', () => {
    const front = { id: 'front', x: 280, isEnemy: true };
    const rear = { id: 'rear', x: 340, isEnemy: true };
    expect(compareSpriteDrawOrder(rear, front)).toBeLessThan(0);
    expect(sortForSpriteDraw([front, rear]).map((l) => l.id)).toEqual([
      'rear',
      'front',
    ]);
  });

  it('draws longer-range enemies before shorter-range enemies', () => {
    const longRange = {
      id: 'long',
      x: 300,
      isEnemy: true,
      rangePx: 120,
    };
    const shortRange = {
      id: 'short',
      x: 280,
      isEnemy: true,
      rangePx: 20,
    };
    expect(compareSpriteDrawOrder(longRange, shortRange)).toBeLessThan(0);
    expect(sortForSpriteDraw([shortRange, longRange]).map((l) => l.id)).toEqual([
      'long',
      'short',
    ]);
  });

  it('draws ally sprites by role band: melee attacker on top, supporter at back', () => {
    const supporter = {
      id: 'supporter',
      x: 50,
      isEnemy: false,
      role: 'supporter' as const,
    };
    const defender = {
      id: 'defender',
      x: 50,
      isEnemy: false,
      role: 'defender' as const,
    };
    const ranged = {
      id: 'ranged',
      x: 50,
      isEnemy: false,
      role: 'attacker' as const,
      rangePx: RANGED_ATTACK_MIN_PX,
    };
    const melee = {
      id: 'melee',
      x: 50,
      isEnemy: false,
      role: 'attacker' as const,
      rangePx: 0,
    };
    expect(compareSpriteDrawOrder(supporter, defender)).toBeLessThan(0);
    expect(compareSpriteDrawOrder(defender, ranged)).toBeLessThan(0);
    expect(compareSpriteDrawOrder(ranged, melee)).toBeLessThan(0);
    expect(
      sortForSpriteDraw([melee, ranged, defender, supporter]).map((l) => l.id),
    ).toEqual(['supporter', 'defender', 'ranged', 'melee']);
  });

  it('maps ally role back depth from role and attack range', () => {
    expect(
      allyRoleBackDepth({
        id: 'supporter',
        x: 0,
        isEnemy: false,
        role: 'supporter',
      }),
    ).toBe(0);
    expect(
      allyRoleBackDepth({
        id: 'defender',
        x: 0,
        isEnemy: false,
        role: 'defender',
      }),
    ).toBe(1);
    expect(
      allyRoleBackDepth({
        id: 'ranged',
        x: 0,
        isEnemy: false,
        role: 'attacker',
        rangePx: RANGED_ATTACK_MIN_PX,
      }),
    ).toBe(2);
    expect(
      allyRoleBackDepth({
        id: 'melee',
        x: 0,
        isEnemy: false,
        role: 'attacker',
        rangePx: 0,
      }),
    ).toBe(3);
  });

  it('uses id as a stable tiebreaker when depth matches', () => {
    const a = { id: 'a', x: 100, isEnemy: false };
    const b = { id: 'b', x: 100, isEnemy: false };
    expect(compareSpriteDrawOrder(a, b)).toBeLessThan(0);
  });

  it('maps faction back depth from battleX orientation', () => {
    expect(factionBackDepth({ id: 'ally-back', x: 20, isEnemy: false })).toBe(
      20,
    );
    expect(
      factionBackDepth({ id: 'ally-front', x: 84, isEnemy: false }),
    ).toBe(84);
    expect(factionBackDepth({ id: 'enemy-front', x: 280, isEnemy: true })).toBe(
      -280,
    );
    expect(factionBackDepth({ id: 'enemy-rear', x: 340, isEnemy: true })).toBe(
      -340,
    );
    expect(
      factionBackDepth({ id: 'enemy-rear', x: 340, isEnemy: true }),
    ).toBeLessThan(
      factionBackDepth({ id: 'enemy-front', x: 280, isEnemy: true }),
    );
  });
});
