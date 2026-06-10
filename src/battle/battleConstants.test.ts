import { describe, expect, it } from 'vitest';
import { PARTY_DEPLOY_TARGET_DURATION_SEC } from '../render/announcementOverlayTiming.ts';
import {
  MOVE_PX_PER_SEC,
  moveDeltaPx,
  resolvePartyDeployTravelPx,
} from './battleConstants.ts';

describe('resolvePartyDeployTravelPx', () => {
  it('keeps deploy duration aligned with PARTY_DEPLOY_TARGET_DURATION_SEC', () => {
    for (const speed of [60, 120, 200, 300]) {
      const travel = resolvePartyDeployTravelPx(speed);
      expect(travel / speed).toBeCloseTo(PARTY_DEPLOY_TARGET_DURATION_SEC, 5);
    }
  });

  it('uses MOVE_PX_PER_SEC by default', () => {
    expect(resolvePartyDeployTravelPx()).toBe(
      MOVE_PX_PER_SEC * PARTY_DEPLOY_TARGET_DURATION_SEC,
    );
  });
});

describe('moveDeltaPx', () => {
  it('converts px/s and delta seconds to pixel delta', () => {
    expect(moveDeltaPx(120, 0.5)).toBe(60);
    expect(moveDeltaPx(200, 1)).toBe(200);
  });
});
