import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_FADE_IN_MS,
  ANNOUNCEMENT_HOLD_MS,
  ANNOUNCEMENT_TOTAL_MS,
} from './announcementOverlayTiming.ts';
import { isWaveAnnouncementShowing } from './WaveOverlay.ts';

describe('WaveOverlay timing', () => {
  it('is showing during fade-in, hold, and fade-out', () => {
    expect(isWaveAnnouncementShowing(1)).toBe(true);
    expect(
      isWaveAnnouncementShowing(ANNOUNCEMENT_FADE_IN_MS + ANNOUNCEMENT_HOLD_MS),
    ).toBe(true);
    expect(isWaveAnnouncementShowing(ANNOUNCEMENT_TOTAL_MS - 1)).toBe(true);
  });

  it('is hidden before start and after completion', () => {
    expect(isWaveAnnouncementShowing(0)).toBe(false);
    expect(isWaveAnnouncementShowing(ANNOUNCEMENT_TOTAL_MS)).toBe(false);
  });
});
