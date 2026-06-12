import { describe, expect, it } from 'vitest';
import {
  compareSpriteDrawOrder,
  factionBackDepth,
  sortForSpriteDraw,
} from './spriteDrawOrder.ts';

describe('spriteDrawOrder', () => {
  it('draws enemies before allies so player sprites appear on top', () => {
    const enemy = { id: 'e1', x: 300, isEnemy: true };
    const ally = { id: 'a1', x: 80, isEnemy: false };
    expect(compareSpriteDrawOrder(enemy, ally)).toBeLessThan(0);
    expect(sortForSpriteDraw([ally, enemy]).map((l) => l.id)).toEqual([
      'e1',
      'a1',
    ]);
  });

  it('draws ally back row before front row within the same faction', () => {
    const back = { id: 'back', x: 20, isEnemy: false };
    const front = { id: 'front', x: 84, isEnemy: false };
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
