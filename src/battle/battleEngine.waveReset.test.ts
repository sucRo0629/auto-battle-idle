/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { resolvePartyDeployTargets } from './combatPosition.ts';
import { resolveSkillTrigger } from './skillTrigger.ts';
import type {
  PendingSkillHit,
  PlacedFieldInstance,
  StatusEffect,
} from './types.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  asBattleEngineInternals,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

type WaveResetInternals = ReturnType<typeof asBattleEngineInternals> & {
  pendingHitQueue: PendingSkillHit[];
  placedFields: PlacedFieldInstance[];
  pendingNextWaveIndex: number | null;
};

function createWaveResetEngine() {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((item) => item.id === '1');
  if (stage?.waves[0]) {
    stage.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 120 }];
  }
  const wave1Enemy = gameData.enemyRegistry.stage1_1;
  if (wave1Enemy) wave1Enemy.maxHp = 1;

  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  if (save.party[3]) {
    save.party[3]!.classId = 'df_paladin';
  }

  const selectedModuleId = 'df_guardian_mod_guard_focus';
  const onHealRecorded = vi.fn();
  const engine = new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      getSelectedCombatModuleId: (slotIndex) =>
        slotIndex === 0 ? selectedModuleId : undefined,
      onHealRecorded,
    },
  );
  engine.startBattle();
  return { engine, gameData, save, selectedModuleId, onHealRecorded };
}

function temporaryStatuses(oldEnemyId: string): StatusEffect[] {
  const values = [
    { id: 'buff', kind: 'buff', stat: 'atk', multiplier: 2 },
    { id: 'debuff', kind: 'debuff', stat: 'def', multiplier: 0.5 },
    { id: 'dot', kind: 'debuff', overlay: 'dot', amount: 10 },
    { id: 'hot', kind: 'buff', overlay: 'hot', amount: 10 },
    { id: 'stun', kind: 'debuff', overlay: 'stun' },
    { id: 'hold', kind: 'debuff', overlay: 'hold' },
    {
      id: 'attack-speed',
      kind: 'buff',
      stat: 'attackSpeed',
      multiplier: 2,
    },
    {
      id: 'ward',
      kind: 'buff',
      overlay: 'wardBarrier',
      stacks: 3,
      ratio: 0.1,
    },
  ];
  return values.map(
    (value) =>
      ({
        ...value,
        remainingSec: 30,
        sourceId: oldEnemyId,
        tickSec: 0.25,
      }) as unknown as StatusEffect,
  );
}

describe('BattleEngine Wave reset (R6d)', () => {
  it('keeps the frozen Wave 1 state until startNextWave succeeds', () => {
    const { engine } = createWaveResetEngine();
    reachAwaitingNextWave(engine);
    const internals = asBattleEngineInternals(engine);
    const ally = internals.players[0]!;
    ally.hp = 1;
    ally.barrierHp = 99;
    ally.statusEffects = temporaryStatuses(internals.enemies[0]!.id);
    ally.cooldowns.forEach((cooldown) => {
      cooldown.remaining = 0.125;
    });
    const timeBefore = engine.getBattleTimeSec();

    for (let index = 0; index < 120; index += 1) {
      engine.tick(TICK_DT);
    }

    expect(internals.players[0]).toBe(ally);
    expect(ally.hp).toBe(1);
    expect(ally.barrierHp).toBe(99);
    expect(ally.statusEffects).toHaveLength(8);
    expect(ally.cooldowns.every((cooldown) => cooldown.remaining === 0.125)).toBe(
      true,
    );
    expect(engine.getBattleTimeSec()).toBe(timeBefore);
  });

  it('regenerates all allies and clears HP, barrier, status, cooldown, target, and queues', () => {
    const { engine, gameData, selectedModuleId, onHealRecorded } =
      createWaveResetEngine();
    reachAwaitingNextWave(engine);
    const internals = asBattleEngineInternals(engine) as WaveResetInternals;
    const oldPlayers = [...internals.players];
    const oldIds = oldPlayers.map((ally) => ally.id);
    const oldEnemyId = internals.enemies[0]!.id;
    const battleTimeBefore = engine.getBattleTimeSec();

    for (const ally of internals.players) {
      ally.hp = 0;
      ally.isAlive = false;
      ally.corpseVisible = false;
      ally.barrierHp = 999;
      ally.statusEffects = temporaryStatuses(oldEnemyId);
      ally.delayedDamagePool = 50;
      ally.damageDelayTickSec = 0.1;
      ally.accessState = 'rearAssault';
      ally.rearAssaultHoldOffsetPx = 42;
      ally.engagedBattleLaneX = 123;
      ally.engagedDisplayAnchorPlayerId = oldIds[0];
      ally.battleX = 777;
      ally.cooldowns.forEach((cooldown) => {
        cooldown.remaining = 0.125;
        cooldown.storedCharges = 2;
        cooldown.fireHoldSinceSec = battleTimeBefore;
      });
    }
    internals.players[0]!.activeStageRemainingTriggers = {
      stage_limited_skill: 0,
    };
    internals.pendingHitQueue = [
      { actorId: oldIds[0], targets: [{ targetId: oldEnemyId }] },
    ] as PendingSkillHit[];
    internals.placedFields = [{} as PlacedFieldInstance];
    internals.skillSequenceRunner.beginUse(oldIds[0]!, 30, {
      pauseApproach: true,
    });
    internals.skillSequenceRunner.beginActiveEffectGauge(oldIds[0]!, 0, 30);

    expect(engine.startNextWave()).toBe(true);
    const next = asBattleEngineInternals(engine) as WaveResetInternals;

    expect(next.players).toHaveLength(4);
    expect(next.players.every((ally) => !oldPlayers.includes(ally))).toBe(true);
    expect(next.players.every((ally) => ally.hp === ally.maxHp)).toBe(true);
    expect(next.players.every((ally) => ally.isAlive && ally.corpseVisible)).toBe(
      true,
    );
    expect(next.players.every((ally) => ally.barrierHp === 0)).toBe(true);
    expect(next.players.every((ally) => ally.statusEffects.length === 0)).toBe(
      true,
    );
    expect(
      next.players.every(
        (ally) =>
          ally.delayedDamagePool === undefined &&
          ally.damageDelayTickSec === undefined &&
          ally.accessState === undefined &&
          ally.rearAssaultHoldOffsetPx === undefined &&
          ally.engagedBattleLaneX === undefined &&
          ally.engagedDisplayAnchorPlayerId === undefined,
      ),
    ).toBe(true);
    expect(next.pendingHitQueue).toEqual([]);
    expect(next.placedFields).toEqual([]);
    expect(
      oldIds.every(
        (id) =>
          !next.skillSequenceRunner.isActorBusy(id) &&
          next.skillSequenceRunner.getActiveEffectRemaining(id, 0) === 0,
      ),
    ).toBe(true);
    expect(next.players[0]!.activeStageRemainingTriggers).toEqual({
      stage_limited_skill: 0,
    });
    expect(engine.getBattleTimeSec()).toBe(battleTimeBefore);
    expect(onHealRecorded).not.toHaveBeenCalled();

    const moduleUser = next.players.find((ally) => ally.partySlotIndex === 0)!;
    const moduleBasic = moduleUser.cooldowns.find(
      (cooldown) => cooldown.slotKind === 'basic',
    )!;
    expect(moduleBasic.skillId).toBe(selectedModuleId);
    expect(moduleBasic.remaining).toBe(
      resolveSkillTrigger(gameData.skillRegistry.actives[selectedModuleId]!)
        .value,
    );

    const legacy = next.players.find((ally) => ally.classId === 'df_paladin')!;
    const legacyBasic = legacy.cooldowns.find(
      (cooldown) => cooldown.slotKind === 'basic',
    )!;
    expect(legacyBasic.skillId).toBe(
      gameData.classRegistry.df_paladin!.basicAttackSkillId,
    );
    expect(legacyBasic.remaining).toBe(
      resolveSkillTrigger(gameData.skillRegistry.actives[legacyBasic.skillId]!)
        .value,
    );
    for (const ally of next.players) {
      for (const cooldown of ally.cooldowns) {
        const skill = gameData.skillRegistry.actives[cooldown.skillId];
        expect(cooldown.remaining).toBe(
          skill ? resolveSkillTrigger(skill).value : 0,
        );
        expect(cooldown.storedCharges ?? 0).toBe(0);
        expect(cooldown.fireHoldSinceSec).toBeUndefined();
      }
    }

    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(engine.getSnapshot().waveAnnouncementActive).toBe(true);
    expect(engine.getSnapshot().enemies.some((enemy) => enemy.hp > 0)).toBe(
      true,
    );
  });

  it('returns allies to deploy formation with fresh facing and no old enemy references', () => {
    const { engine } = createWaveResetEngine();
    reachAwaitingNextWave(engine);
    const oldEnemyIds = asBattleEngineInternals(engine).enemies.map(
      (enemy) => enemy.id,
    );
    expect(engine.startNextWave()).toBe(true);
    waitForEngaged(engine);

    const internals = asBattleEngineInternals(engine);
    const targets = resolvePartyDeployTargets(internals.players);
    for (const ally of internals.players) {
      expect(ally.battleX).toBe(targets.get(ally.id));
      expect(ally.engagedDisplayAnchorPlayerId).toBeUndefined();
      expect(ally.accessState).toBeUndefined();
    }
    expect(engine.getSnapshot().allies.every((ally) => ally.facingSign === 1)).toBe(
      true,
    );
    const serializedPlayers = JSON.stringify(internals.players);
    expect(oldEnemyIds.every((id) => !serializedPlayers.includes(id))).toBe(true);
  });

  it('does not reset on rejected, invalid, double, or final-Wave starts', () => {
    const { engine } = createWaveResetEngine();
    waitForEngaged(engine);
    const combatPlayers = asBattleEngineInternals(engine).players;
    combatPlayers[0]!.hp = 1;
    expect(engine.startNextWave()).toBe(false);
    expect(asBattleEngineInternals(engine).players).toBe(combatPlayers);
    expect(combatPlayers[0]!.hp).toBe(1);

    reachAwaitingNextWave(engine);
    const awaitingPlayers = asBattleEngineInternals(engine).players;
    const internals = asBattleEngineInternals(engine) as WaveResetInternals;
    internals.pendingNextWaveIndex = 99;
    expect(engine.startNextWave()).toBe(false);
    expect(asBattleEngineInternals(engine).players).toBe(awaitingPlayers);

    internals.pendingNextWaveIndex = 1;
    expect(engine.startNextWave()).toBe(true);
    const wave2Players = asBattleEngineInternals(engine).players;
    expect(engine.startNextWave()).toBe(false);
    expect(asBattleEngineInternals(engine).players).toBe(wave2Players);

    waitForEngaged(engine);
    killAllEnemies(engine);
    for (let index = 0; index < 90_000; index += 1) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    expect(engine.getSnapshot().phase).toBe('victory');
    const victoryPlayers = asBattleEngineInternals(engine).players;
    expect(engine.startNextWave()).toBe(false);
    expect(asBattleEngineInternals(engine).players).toBe(victoryPlayers);
  });
});
