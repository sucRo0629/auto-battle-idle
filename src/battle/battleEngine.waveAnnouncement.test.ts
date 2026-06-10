import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_FADE_OUT_START_MS,
  ANNOUNCEMENT_TOTAL_MS,
  POST_ANNOUNCEMENT_ENGAGE_START_MS,
  POST_DEPLOY_SETTLE_DELAY_SEC,
} from '../render/announcementOverlayTiming.ts';
import { CANVAS_W, MOVE_SPEED } from './battleConstants.ts';
import { createStage1Engine, TICK_DT } from './test/battleFieldSpec.harness.ts';

function msToTicks(ms: number): number {
  return Math.ceil(ms / (TICK_DT * 1000));
}

describe('BattleEngine wave announcement', () => {
  it('starts PartyDeploy concurrently with wave announcement', () => {
    const engine = createStage1Engine();
    const snap = engine.getSnapshot();
    expect(snap.waveAnnouncementActive).toBe(true);
    expect(snap.partyDeployActive).toBe(true);
    expect(snap.engaged).toBe(false);
    expect(snap.enemies.length).toBeGreaterThan(0);
    expect(snap.runtimePhase).toBe('WaveAnnouncement');

    const livingAllies = snap.allies.filter((a) => a.hp > 0);
    expect(livingAllies.length).toBeGreaterThan(0);
    for (const ally of livingAllies) {
      expect(ally.battleX).toBeLessThan(0);
      expect(ally.battleX).toBeLessThan(CANVAS_W);
    }
  });

  it('does not engage before fade-out start + 250ms', () => {
    const engine = createStage1Engine();
    const beforeEngageTicks = msToTicks(POST_ANNOUNCEMENT_ENGAGE_START_MS - 1);
    for (let i = 0; i < beforeEngageTicks; i++) {
      engine.tick(TICK_DT);
      expect(engine.getSnapshot().engaged).toBe(false);
    }
  });

  it('engages after deploy settle + post-deploy delay when announcement gate passed', () => {
    const engine = createStage1Engine();
    const deployFinishMs = (CANVAS_W / MOVE_SPEED) * 1000;
    const engageStartMs =
      deployFinishMs +
      POST_DEPLOY_SETTLE_DELAY_SEC * 1000;
    expect(engageStartMs).toBeGreaterThan(POST_ANNOUNCEMENT_ENGAGE_START_MS);
    const engageTicks = msToTicks(engageStartMs) + 5;
    for (let i = 0; i < engageTicks; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().engaged) return;
    }
    expect(engine.getSnapshot().engaged).toBe(true);
  });

  it('waits after deploy settles before engaging', () => {
    const engine = createStage1Engine();
    const deployFinishMs = (CANVAS_W / MOVE_SPEED) * 1000;
    const deployFinishTicks = msToTicks(deployFinishMs);
    let sawSettled = false;
    for (let i = 0; i < deployFinishTicks + 30; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.partyDeploySettled) {
        sawSettled = true;
        expect(snap.engaged).toBe(false);
      }
    }
    expect(sawSettled).toBe(true);
  });

  it('clears announcement after total duration even if engaged earlier', () => {
    const engine = createStage1Engine();
    const totalTicks = msToTicks(ANNOUNCEMENT_TOTAL_MS) + 5;
    for (let i = 0; i < totalTicks; i++) {
      engine.tick(TICK_DT);
    }
    expect(engine.getSnapshot().waveAnnouncementActive).toBe(false);
  });
});
