import { describe, expect, it } from 'vitest';
import { applyStunToTarget } from './ccEffects.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave1Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  resolveEnemyApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';

describe('stun movement', () => {
  it('blocks engaged auto-approach while stunned', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const enemy = internal.enemies.find((unit) => unit.isAlive);
    expect(enemy).toBeDefined();

    const approachTarget = resolveEnemyApproachBattleX(
      enemy!,
      internal.players,
      internal.enemies,
      internal.gameData,
    );
    enemy!.battleX = approachTarget + 80;
    expect(
      shouldSkipEngagedAutoApproach(
        enemy!,
        internal.players,
        internal.enemies,
        internal.gameData,
      ),
    ).toBe(false);

    const beforeStunX = enemy!.battleX;
    applyStunToTarget(enemy!, 3, { skillId: 'bash', sourceId: 'ally' });

    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
    }

    expect(enemy!.battleX).toBe(beforeStunX);
  });
});
