import { describe, expect, it } from 'vitest';
import {
  BODY_ANIM_APPROACH_SETTLED_PX,
  resolveCombatantBodyAnimMarching,
  type BodyAnimMarchingContext,
} from './bodyAnimMarching.ts';
import type { CombatantState } from './types.ts';
import { createStage1Engine, TICK_DT, asBattleEngineInternals } from './test/battleFieldSpec.harness.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  resolveMaxEffectiveRangePx,
  resolvePartyDeployTargets,
} from './combatPosition.ts';
import { MOVE_PX_PER_SEC } from './battleConstants.ts';
import { resolvePartyDeployMarchDistancePx } from './partyFormation.ts';

function makeUnit(
  overrides: Partial<CombatantState> & Pick<CombatantState, 'id'>,
): CombatantState {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    hp: overrides.hp ?? 100,
    maxHp: overrides.maxHp ?? 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    role: overrides.role ?? 'guardian',
    traits: overrides.traits ?? { rangePx: 50, damageType: 'physical' },
    formationRow: overrides.formationRow ?? 'front',
    isEnemy: overrides.isEnemy ?? false,
    isAlive: overrides.isAlive ?? true,
    battleX: overrides.battleX ?? 100,
    spriteKey: overrides.spriteKey ?? 'df_guardian',
    iconKey: overrides.iconKey ?? 'df_guardian',
    cooldowns: [],
    statusEffects: overrides.statusEffects ?? [],
    build: overrides.build ?? { learnedActiveIds: [] },
    basicAttackSkillId: overrides.basicAttackSkillId ?? 'df_guardian_basic_attack',
    ...overrides,
  };
}

function baseCtx(
  overrides: Partial<BodyAnimMarchingContext> = {},
): BodyAnimMarchingContext {
  return {
    phase: 'running',
    engaged: false,
    partyDeployActive: false,
    partyDeploySettled: false,
    waveExitMarchActive: false,
    victoryExitMarchActive: false,
    partyDeployTargets: new Map(),
    enemyDeployTargets: new Map(),
    players: [],
    enemies: [],
    gameData: overrides.gameData!,
    isActorInSkillMotion: () => false,
    isActorUseLockPauseApproach: () => false,
    ...overrides,
  };
}

describe('resolveCombatantBodyAnimMarching', () => {
  it('returns false when PartyDeploy settled and not engaged', () => {
    const unit = makeUnit({ id: 'a0', battleX: 40 });
    const ctx = baseCtx({
      partyDeploySettled: true,
      engaged: false,
      partyDeployTargets: new Map([['a0', 40]]),
      players: [unit],
      gameData: {} as BodyAnimMarchingContext['gameData'],
    });
    expect(resolveCombatantBodyAnimMarching(unit, ctx)).toBe(false);
  });

  it('returns true during PartyDeploy while away from target', () => {
    const unit = makeUnit({ id: 'a0', battleX: 0 });
    const target = 120;
    const ctx = baseCtx({
      partyDeployActive: true,
      partyDeployTargets: new Map([['a0', target]]),
      players: [unit],
      gameData: {} as BodyAnimMarchingContext['gameData'],
    });
    expect(
      Math.abs(unit.battleX - target),
    ).toBeGreaterThan(BODY_ANIM_APPROACH_SETTLED_PX);
    expect(resolveCombatantBodyAnimMarching(unit, ctx)).toBe(true);
  });

  it('returns false during PartyDeploy when at target', () => {
    const unit = makeUnit({ id: 'a0', battleX: 80 });
    const ctx = baseCtx({
      partyDeployActive: true,
      partyDeployTargets: new Map([['a0', 80]]),
      players: [unit],
      gameData: {} as BodyAnimMarchingContext['gameData'],
    });
    expect(resolveCombatantBodyAnimMarching(unit, ctx)).toBe(false);
  });

  it('returns true for wave exit march allies', () => {
    const unit = makeUnit({ id: 'a0', battleX: 200 });
    const ctx = baseCtx({
      waveExitMarchActive: true,
      players: [unit],
      gameData: {} as BodyAnimMarchingContext['gameData'],
    });
    expect(resolveCombatantBodyAnimMarching(unit, ctx)).toBe(true);
  });

  it('returns true when actor is in skill motion', () => {
    const unit = makeUnit({ id: 'a0', battleX: 100 });
    const ctx = baseCtx({
      engaged: true,
      players: [unit],
      enemies: [makeUnit({ id: 'e0', isEnemy: true, battleX: 300 })],
      gameData: {} as BodyAnimMarchingContext['gameData'],
      isActorInSkillMotion: (id) => id === 'a0',
    });
    expect(resolveCombatantBodyAnimMarching(unit, ctx)).toBe(true);
  });
});

function estimatePartyDeployFinishTicks(
  engine: ReturnType<typeof createStage1Engine>,
): number {
  const { players } = asBattleEngineInternals(engine);
  const targets = resolvePartyDeployTargets(players);
  const distancePx = resolvePartyDeployMarchDistancePx(targets);
  const finishMs = (distancePx / MOVE_PX_PER_SEC) * 1000;
  return Math.ceil(finishMs / (TICK_DT * 1000)) + 5;
}

describe('BattleEngine bodyAnimMarching snapshot', () => {
  it('marks allies not marching after PartyDeploy settles', () => {
    const engine = createStage1Engine();
    const deployFinishTicks = estimatePartyDeployFinishTicks(engine);

    for (let i = 0; i < deployFinishTicks; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.partyDeploySettled && !snap.engaged) {
        for (const ally of snap.allies.filter((a) => a.hp > 0)) {
          expect(ally.bodyAnimMarching).toBe(false);
        }
        return;
      }
    }
    expect.fail('party deploy did not settle');
  });

  it('marks front allies not marching once engaged and in attack range', () => {
    const engine = createStage1Engine();
    const deployFinishTicks = estimatePartyDeployFinishTicks(engine);
    const engageTicks = deployFinishTicks + Math.ceil(2000 / (TICK_DT * 1000)) + 30;

    for (let i = 0; i < engageTicks; i++) {
      engine.tick(TICK_DT);
    }

    const snap = engine.getSnapshot();
    expect(snap.engaged).toBe(true);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      const frame = engine.getSnapshot();
      const internal = asBattleEngineInternals(engine);
      const livingAllies = frame.allies.filter((a) => a.hp > 0);
      const livingEnemies = frame.enemies.filter((e) => e.hp > 0);
      if (livingEnemies.length === 0) break;

      for (const ally of livingAllies) {
        if (ally.formationRow !== 'front') continue;
        const allyUnit = internal.players.find((p) => p.id === ally.id);
        if (!allyUnit) continue;
        const inRange = livingEnemies.some((enemySnap) => {
          const enemy = internal.enemies.find((e) => e.id === enemySnap.id);
          if (!enemy) return false;
          const range = resolveMaxEffectiveRangePx(allyUnit, internal.gameData);
          return isWithinSkillRange(allyUnit, enemy, range);
        });
        if (!inRange) continue;
        expect(ally.bodyAnimMarching).toBe(false);
      }
      for (const enemySnap of livingEnemies) {
        const enemy = internal.enemies.find((e) => e.id === enemySnap.id);
        if (!enemy) continue;
        if (
          shouldSkipEngagedAutoApproach(
            enemy,
            internal.players,
            internal.enemies,
            internal.gameData,
          )
        ) {
          expect(enemySnap.bodyAnimMarching).toBe(false);
        }
      }
    }
  });
});
