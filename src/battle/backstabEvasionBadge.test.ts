import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { getPassiveDefs } from './combatMath.ts';
import { syncBuffAuras } from './passiveEffects.ts';
import { loadGameData } from './data/loadGameData.ts';
import { aggregateStatStatusEffects } from './statusEffectDisplay.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { buildSkillSequence } from './skills/skillSequence.ts';
import type { CombatantState, SkillSequenceRunner } from './types.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  asBattleEngineInternals,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'at_assassin',
    formationRow: 'front',
    traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: ['at_assassin_active_2'],
      equippedActiveSlots: ['at_assassin_active_2'],
    },
    cooldowns: [
      { skillId: 'at_assassin_active_2', remaining: 0, slotKind: 'active' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

describe('backstab evasion buff badge', () => {
  it('applies active evasion status and shows evasion badge', () => {
    const gameData = loadGameData();
    const skill = gameData.skillRegistry.actives.at_assassin_active_2;
    expect(skill?.effect[0]?.type).toBe('buff');
    expect(skill?.effect[0]?.buffSubKind).toBe('evasion');
    expect(skill?.effect[0]?.chance).toBe(1);
    expect(skill?.effect[0]?.buffDurationSec).toBe(1.5);

    const actor = mockUnit({
      id: 'assassin',
      battleX: 220,
      build: {
        learnedPassiveIds: ['passive_target_lowest_hp', 'passive_evasion'],
        learnedActiveIds: ['at_assassin_active_2'],
        equippedActiveSlots: ['at_assassin_active_2'],
      },
    });
    const ally = mockUnit({ id: 'ally', battleX: 180 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    const passives = getPassiveDefs(actor, gameData.skillRegistry.passives);
    const cd = actor.cooldowns[0]!;
    const sequence = buildSkillSequence(
      skill!,
      actor,
      [actor, ally],
      [enemy],
      gameData,
      passives,
      0,
      cd,
    );
    expect(sequence).not.toBeNull();

    const runner = {
      schedule: () => {},
      startMove: () => {},
      tickUseLocks: () => {},
      tickMoves: () => {},
      tickSequences: () => {},
      beginUse: () => {},
      getActiveMoves: () => [],
      isActorInSkillMotion: () => false,
      isActorBusy: () => false,
      clearAll: () => {},
      clearForActor: () => {},
    } satisfies SkillSequenceRunner;

    const executor = new SkillExecutor(gameData, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    executor.applyScheduledStep(sequence!.steps[0]!, [actor, ally], [enemy]);

    const evasion = actor.statusEffects.find((e) => e.overlay === 'evasion');
    expect(evasion?.evasionChance).toBe(1);
    expect(evasion?.id.startsWith('passive_')).toBe(false);

    const badges = aggregateStatStatusEffects(actor.statusEffects, {
      atk: actor.atk,
      def: actor.def,
      reg: actor.reg,
    });
    expect(badges.map((b) => b.category)).toContain('evasion');
  });

  it('shows evasion badge for active buff while hiding passive evasion aura', () => {
    const gameData = loadGameData();
    const actor = mockUnit({ id: 'assassin', battleX: 220 });
    const ally = mockUnit({ id: 'ally', battleX: 180 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    actor.build.learnedPassiveIds = ['passive_evasion'];

    syncBuffAuras([actor, ally], [enemy], gameData.skillRegistry.passives);

    const passiveEvasion = actor.statusEffects.find((e) => e.overlay === 'evasion');
    expect(passiveEvasion?.id.startsWith('passive_')).toBe(true);

    actor.statusEffects.push({
      id: 'at_assassin_active_2_evasion_1',
      kind: 'buff',
      overlay: 'evasion',
      evasionChance: 1,
      multiplier: 1,
      durationSec: 1.5,
      remainingSec: 1.5,
      sourceId: actor.id,
      skillId: 'at_assassin_active_2',
    });

    const badges = aggregateStatStatusEffects(actor.statusEffects, {
      atk: actor.atk,
      def: actor.def,
      reg: actor.reg,
    });
    expect(badges.map((b) => b.category)).toEqual(['evasion']);
  });

  it('BattleEngine applies backstab evasion buff during skill use', () => {
    const gameData = structuredClone(loadGameData());
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    save.party[0] = createMemberFromClass('at_assassin', gameData);
    for (const slot of save.party) {
      if (slot) slot.progress.level = 10;
    }
    const engine = new BattleEngine(
      gameData,
      loadLevelCurves(levelCurvesJson),
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === '双刃士')!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === 'at_assassin_active_2',
    );
    expect(activeCd).toBeDefined();
    activeCd!.remaining = 0;

    let sawActiveEvasion = false;
    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      const activeEvasion = assassin.statusEffects.find(
        (effect) =>
          effect.overlay === 'evasion' && !effect.id.startsWith('passive_'),
      );
      if (activeEvasion) {
        sawActiveEvasion = true;
        const badges = aggregateStatStatusEffects(assassin.statusEffects, {
          atk: assassin.atk,
          def: assassin.def,
          reg: assassin.reg,
        });
        expect(badges.map((badge) => badge.category)).toContain('evasion');
        break;
      }
    }

    expect(sawActiveEvasion).toBe(true);
  });
});
