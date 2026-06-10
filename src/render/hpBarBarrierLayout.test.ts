import { describe, expect, it } from 'vitest';
import { layoutHpBarBarrier } from './hpBarBarrierLayout.ts';

describe('layoutHpBarBarrier', () => {
  const x = 34;
  const barW = 80;

  it('places tier1 to the right of HP when HP is reduced', () => {
    const layout = layoutHpBarBarrier(x, barW, 50, 100, 30)!;
    expect(layout.hpWidth).toBe(40);
    expect(layout.tier1).toEqual([{ x: 74, width: 24 }]);
  });

  it('overlays tier1 from the left when HP is full', () => {
    const layout = layoutHpBarBarrier(x, barW, 100, 100, 30)!;
    expect(layout.hpWidth).toBe(80);
    expect(layout.tier1).toEqual([{ x: 34, width: 24 }]);
  });

  it('wraps tier1 overflow from bar left when HP is near full', () => {
    const layout = layoutHpBarBarrier(x, barW, 234, 235, 11)!;
    expect(layout.hpWidth).toBe(79);
    expect(layout.tier1).toEqual([
      { x: 113, width: 1 },
      { x: 34, width: 3 },
    ]);
  });

  it('wraps tier1 overflow from bar left when HP is reduced', () => {
    const layout = layoutHpBarBarrier(x, barW, 50, 100, 150)!;
    expect(layout.tier1).toEqual([
      { x: 74, width: 40 },
      { x: 34, width: 40 },
    ]);
  });
});
