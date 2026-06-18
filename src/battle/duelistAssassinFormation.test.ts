import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { PARTY_FORMATION_SLOT_SPACING } from './battleConstants.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
  SCREEN_MIN_X,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  resolveEnemyAttackTargetPlayer,
  resolvePlayerApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';

function createDuelistAssassinEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  save.party[0] = createMemberFromClass('df_duelist', gameData);
  save.party[1] = createMemberFromClass('at_assassin', gameData);
  save.party[2] = null;
  save.party[3] = null;
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  return new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

describe('duelist + assassin front row', () => {
  it('uses pierce 砂かけ (range 30) against enemies in front', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    let appliedSand = false;
    for (let t = 0; t < 1200; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      for (const enemy of internal.enemies) {
        if (!enemy.isAlive) continue;
        const hasAtkDebuff = enemy.statusEffects.some(
          (fx) =>
            fx.kind === 'debuff' &&
            (fx.stat === 'atk' || fx.stat === 'attackSpeed'),
        );
        const hasStun = enemy.statusEffects.some((fx) => fx.overlay === 'stun');
        if (hasAtkDebuff || hasStun) {
          appliedSand = true;
          break;
        }
      }
      if (appliedSand) break;
    }

    expect(appliedSand).toBe(true);
  });

  it('keeps deploy spacing at engage start (no overlap snap)', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const snap = engine.getSnapshot();
    expect(snap.engaged).toBe(true);

    const duelist = snap.allies.find((a) => a.name === '闘技士');
    const assassin = snap.allies.find((a) => a.name === '双刃士');
    expect(duelist).toBeDefined();
    expect(assassin).toBeDefined();
    expect(duelist!.battleX).toBeGreaterThan(assassin!.battleX);
    expect(duelist!.battleX - assassin!.battleX).toBeGreaterThanOrEqual(
      PARTY_FORMATION_SLOT_SPACING - 1,
    );
  });

  it('shorter-range melee stays forward of longer-range during natural approach', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      const duelist = snap.allies.find((a) => a.name === '闘技士');
      const assassin = snap.allies.find((a) => a.name === '双刃士');
      if (!duelist || !assassin) continue;
      expect(duelist.battleX).toBeGreaterThanOrEqual(assassin.battleX);
    }
  });

  it('duelist deals damage while both are alive', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const enemyHpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .reduce((sum, e) => sum + e.hp, 0);

    let duelistDealt = false;
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      const duelist = snap.allies.find((a) => a.name === '闘技士' && a.hp > 0);
      const assassin = snap.allies.find((a) => a.name === '双刃士' && a.hp > 0);
      if (!duelist || !assassin) break;

      const enemyHpNow = snap.enemies
        .filter((e) => e.hp > 0)
        .reduce((sum, e) => sum + e.hp, 0);
      if (enemyHpNow < enemyHpBefore) {
        duelistDealt = true;
        break;
      }
    }

    expect(duelistDealt).toBe(true);
  });

  it('enemies prefer duelist threat when both are in range', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      const duelist = internal.players.find((p) => p.name === '闘技士');
      const assassin = internal.players.find((p) => p.name === '双刃士');
      const enemy = internal.enemies.find((e) => e.isAlive);
      if (!duelist?.isAlive || !assassin?.isAlive || !enemy) continue;

      const target = resolveEnemyAttackTargetPlayer(
        enemy,
        internal.players,
        internal.enemies,
        internal.gameData,
      );
      if (target) {
        expect(target.id).toBe(duelist.id);
        return;
      }
    }
    expect.fail('enemy never found an attack target while both allies lived');
  });

  it('no off-screen slide after assassin dies', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassinUnit = internal.players.find((p) => p.name === '双刃士');
    expect(assassinUnit?.isAlive).toBe(true);

    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
    }

    const snapAtDeath = engine.getSnapshot();
    expect(snapAtDeath.engaged).toBe(true);
    const livingAtDeath = snapAtDeath.allies.filter((a) => a.hp > 0);
    const livingEnemiesAtDeath = snapAtDeath.enemies.filter((e) => e.hp > 0);
    expect(livingAtDeath.length).toBeGreaterThan(0);
    expect(livingEnemiesAtDeath.length).toBeGreaterThan(0);

    assassinUnit!.hp = 0;
    assassinUnit!.isAlive = false;

    const minXAtDeath = Math.min(
      ...livingAtDeath.map((a) => a.battleX),
      ...livingEnemiesAtDeath.map((e) => e.battleX),
    );

    for (let t = 0; t < 300; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      const living = snap.allies.filter((a) => a.hp > 0);
      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
      if (living.length === 0 || livingEnemies.length === 0) continue;

      const minNow = Math.min(
        ...living.map((a) => a.battleX),
        ...livingEnemies.map((e) => e.battleX),
      );
      expect(minNow).toBeGreaterThanOrEqual(SCREEN_MIN_X - 20);
      expect(minXAtDeath - minNow).toBeLessThan(80);
    }
  });

  it('assassin advances to forward depth after duelist dies', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (let t = 0; t < 180; t++) {
      engine.tick(TICK_DT);
    }

    const duelist = internal.players.find((p) => p.name === '闘技士')!;
    const assassin = internal.players.find((p) => p.name === '双刃士')!;
    const assassinXBefore = assassin.battleX;
    const duelistApproachBefore = resolvePlayerApproachBattleX(
      duelist,
      internal.players,
      internal.enemies,
      internal.gameData,
    );
    expect(duelistApproachBefore).toBeGreaterThan(assassinXBefore);

    duelist.hp = 0;
    duelist.isAlive = false;
    duelist.corpseVisible = true;

    const assassinApproachAfter = resolvePlayerApproachBattleX(
      assassin,
      internal.players,
      internal.enemies,
      internal.gameData,
    );
    expect(assassinApproachAfter).toBeGreaterThan(assassinXBefore);
    expect(assassinApproachAfter).toBeGreaterThanOrEqual(duelistApproachBefore);
  });

  it('fires shadow blade solo after duelist dies without stalling', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (let t = 0; t < 240; t++) {
      engine.tick(TICK_DT);
    }

    const duelist = internal.players.find((p) => p.name === '闘技士')!;
    duelist.hp = 0;
    duelist.isAlive = false;

    const assassin = internal.players.find((p) => p.name === '双刃士')!;
    const active2 = assassin.cooldowns.find(
      (cd) => cd.skillId === 'at_assassin_active_2',
    )!;
    active2.remaining = 0;

    const enemyHpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .reduce((sum, e) => sum + e.hp, 0);

    let progressed = false;
    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      if (internal.skillSequenceRunner.isActorInSkillMotion(assassin.id)) {
        progressed = true;
        break;
      }
      const hpNow = internal.enemies
        .filter((e) => e.isAlive)
        .reduce((sum, e) => sum + e.hp, 0);
      if (hpNow < enemyHpBefore) {
        progressed = true;
        break;
      }
    }

    expect(progressed).toBe(true);
  });

  it('assassin keeps attacking after duelist dies (manual)', () => {
    const engine = createDuelistAssassinEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (let t = 0; t < 180; t++) {
      engine.tick(TICK_DT);
    }

    const duelist = internal.players.find((p) => p.name === '闘技士');
    const assassin = internal.players.find((p) => p.name === '双刃士');
    expect(duelist?.isAlive).toBe(true);
    expect(assassin?.isAlive).toBe(true);

    const enemyHpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .reduce((sum, e) => sum + e.hp, 0);

    duelist!.hp = 0;
    duelist!.isAlive = false;

    let dealtDamage = false;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      const livingAssassin = snap.allies.find(
        (a) => a.name === '双刃士' && a.hp > 0,
      );
      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
      if (!livingAssassin || livingEnemies.length === 0) break;

      const enemyHpNow = livingEnemies.reduce((sum, e) => sum + e.hp, 0);
      if (enemyHpNow < enemyHpBefore) {
        dealtDamage = true;
        break;
      }

      const skipApproach = shouldSkipEngagedAutoApproach(
        assassin!,
        internal.players,
        internal.enemies,
        internal.gameData,
      );
      if (t > 60 && !skipApproach && livingAssassin.battleX < 50) {
        expect.fail(
          `assassin stuck at x=${livingAssassin.battleX} without approaching`,
        );
      }
    }

    expect(dealtDamage).toBe(true);
  });

  it('assassin keeps attacking after duelist dies naturally', () => {
    const engine = createDuelistAssassinEngine();
    const internal = asBattleEngineInternals(engine);
    for (const [id, enemy] of Object.entries(internal.gameData.enemyRegistry)) {
      enemy.atk = id === 'test_enemy' ? 800 : 15;
    }
    engine.startBattle();
    reachWave1Engage(engine);

    let duelistDeathTick = -1;
    let enemyHpAtDuelistDeath = 0;
    let assassinAttacked = false;

    for (let t = 0; t < 12_000; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const duelist = snap.allies.find((a) => a.name === '闘技士');
      const assassin = snap.allies.find((a) => a.name === '双刃士');
      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);

      if (
        duelistDeathTick < 0 &&
        duelist &&
        duelist.hp <= 0 &&
        assassin &&
        assassin.hp > 0 &&
        livingEnemies.length > 0 &&
        snap.waveIndex === 0
      ) {
        duelistDeathTick = t;
        enemyHpAtDuelistDeath = livingEnemies.reduce((sum, e) => sum + e.hp, 0);
        continue;
      }

      if (duelistDeathTick < 0 || snap.waveIndex !== 0) continue;

      const assassinUnit = internal.players.find(
        (p) => p.name === '双刃士' && p.isAlive,
      );
      if (!assassinUnit || livingEnemies.length === 0) break;

      const hpNow = livingEnemies.reduce((sum, e) => sum + e.hp, 0);
      if (hpNow < enemyHpAtDuelistDeath) {
        assassinAttacked = true;
        break;
      }

      const skipApproach = shouldSkipEngagedAutoApproach(
        assassinUnit,
        internal.players,
        internal.enemies,
        internal.gameData,
      );
      if (skipApproach && t - duelistDeathTick > 30) {
        assassinAttacked = true;
        break;
      }

      if (t - duelistDeathTick >= 600) break;
    }

    expect(duelistDeathTick).toBeGreaterThan(0);
    expect(assassinAttacked).toBe(true);
  });
});
