import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { getPassiveDefs } from './combatMath.ts';
import { resolveResourceAmount } from './combatMath.ts';
import { createAlliesFromPartyState, createEnemiesForStage } from './entities.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
describe('barrier application', () => {
  it('equips guardian barrier skill in default save', () => {
    const gameData = loadGameData();
    const save = createDefaultSave(gameData, 'demo');
    const guardian = save.party[0];
    expect(guardian?.classId).toBe('df_guardian');
    expect(guardian?.build.equippedActiveSlots).toContain('df_guardian_active_1');
  });

  it('resolves guardian barrier grant from percentMaxHp', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const allies = createAlliesFromPartyState(
      gameData,
      save.party,
      levelCurves,
    );
    const guardian = allies[0];
    const skill = gameData.skillRegistry.actives['df_guardian_active_1'];
    const effect = skill.effect[0];
    expect(effect.type).toBe('barrier');
    const grant = resolveResourceAmount(
      guardian,
      guardian,
      effect.amount,
      gameData.skillRegistry.passives,
    );
    expect(grant).toBeGreaterThan(0);
  });

  it('guardian barrier targets self despite targetRuleOverride passives', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const allies = createAlliesFromPartyState(
      gameData,
      save.party,
      levelCurves,
    );
    const guardian = allies[0];
    const enemies = createEnemiesForStage(gameData, '1', 0);
    const skill = gameData.skillRegistry.actives['df_guardian_active_1'];
    const effect = skill.effect[0];
    const passives = getPassiveDefs(guardian, gameData.skillRegistry.passives);
    expect(passives.some((p) => p.targetRuleOverride)).toBe(true);

    const resolution = resolveEffectResolution(
      effect,
      guardian,
      allies,
      enemies,
      gameData,
      Math.random,
      passives,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe(guardian.id);
  });

  it('guardian can gain barrier during battle', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => '1',
    );
    engine.startBattle();

    const skill = gameData.skillRegistry.actives['df_guardian_active_1'];
    expect(skill).toBeDefined();

    let barrierEvents = 0;
    let barrierOnGuardian = 0;
    engine.onEvent((event) => {
      if (event.type === 'skill' && event.effect === 'barrier') {
        barrierEvents += 1;
        const snap = engine.getSnapshot();
        const guardian = snap.allies[0];
        if (guardian && event.targetId === guardian.id) {
          barrierOnGuardian += 1;
        }
        const target = [...snap.allies, ...snap.enemies].find(
          (unit) => unit.id === event.targetId,
        );
        if (target) {
          maxBarrier = Math.max(maxBarrier, target.barrierHp);
        }
      }
    });

    let maxBarrier = 0;
    let engagedAt = -1;
    let minBarrierCd = Infinity;
    for (let i = 0; i < 3000; i++) {
      engine.tick(0.01);
      const snap = engine.getSnapshot();
      if (engagedAt < 0 && snap.engaged) engagedAt = i;
      const guardian = snap.allies[0];
      const barrierCd = guardian?.activeCooldowns.find(
        (cd) => cd.skillId === 'df_guardian_active_1',
      );
      if (barrierCd) minBarrierCd = Math.min(minBarrierCd, barrierCd.remaining);
      for (const ally of snap.allies) {
        maxBarrier = Math.max(maxBarrier, ally.barrierHp);
      }
    }

    expect(engagedAt).toBeGreaterThanOrEqual(0);
    expect(minBarrierCd).toBe(0);
    expect(barrierEvents).toBeGreaterThan(0);
    expect(barrierOnGuardian).toBeGreaterThan(0);
    expect(maxBarrier).toBeGreaterThan(0);
  });
});
