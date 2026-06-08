import { describe, expect, it } from 'vitest';
import { VictoryOverlay } from './VictoryOverlay.ts';

describe('VictoryOverlay syncPhase', () => {
  it('clean victory: stays idle until allies leave screen', () => {
    const overlay = new VictoryOverlay();
    overlay.syncPhase('victory', false, true, true);
    expect(overlay['phase']).toBe('idle');

    overlay.syncPhase('victory', true, true, true);
    expect(overlay['phase']).toBe('visible');
  });

  it('victory with fallen allies: shows immediately', () => {
    const overlay = new VictoryOverlay();
    overlay.syncPhase('victory', false, true, false);
    expect(overlay['phase']).toBe('visible');
  });

  it('defeat: shows immediately', () => {
    const overlay = new VictoryOverlay();
    overlay.syncPhase('defeat', false, false, false);
    expect(overlay['phase']).toBe('visible');
  });
});
