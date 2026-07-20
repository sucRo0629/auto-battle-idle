/**
 * R12g-e5 — Kill 4 兵科 CombatModule 共通統合確認。
 *
 * Party / OperationState / enemyGroups の production 経路で選択を作り、
 * shared targeting 上で M1/M2 の対象形状が相互干渉しないことを固定する。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { OperationState } from '../game/OperationState.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import {
  createAlliesFromPartyState,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { getPassiveDefs } from './combatMath.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import type { CombatantState, PartySlotState, SkillEffectDef, StageDef } from './types.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const CLASSES = ['at_swordsman', 'at_assassin', 'at_ranger', 'at_sorcerer'] as const;
const M1 = [
  'at_swordsman_mod_single_slash',
  'at_assassin_mod_rear_intrude',
  'at_ranger_mod_core_focus',
  'at_sorcerer_mod_focus',
] as const;
const M2 = [
  'at_swordsman_mod_pierce_slash',
  'at_assassin_mod_frontline_finish',
  'at_ranger_mod_core_split',
  'at_sorcerer_mod_chain',
] as const;

function member(classId: (typeof CLASSES)[number]): PartySlotState {
  return {
    classId,
    build: {
      learnedPassiveIds:
        classId === 'at_ranger'
          ? ['at_ranger_passive_1']
          : classId === 'at_swordsman'
            ? ['at_swordsman_passive_1']
            : classId === 'at_assassin'
              ? ['at_assassin_passive_2']
              : [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    progress: { level: 10, exp: 0 },
  };
}

const party = CLASSES.map(member);

function setModules(selection: PartyCombatModuleSelection, ids: readonly string[]): void {
  ids.forEach((id, slot) => selection.setSelectedCombatModuleId(slot, id));
}

function createParty(selection: PartyCombatModuleSelection): CombatantState[] {
  return createAlliesFromPartyState(
    gameData,
    party,
    levelCurves,
    (slot) => selection.getSelectedCombatModuleId(slot),
  );
}

function basicSkillId(unit: CombatantState): string | undefined {
  return unit.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

function resolveDamageTargets(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const module = gameData.combatModuleRegistry[moduleId]!;
  const skill = synthesizeCombatModuleSkill(module);
  const raw = skill.effect.find((effect) => effect.type === 'damage');
  expect(raw).toBeDefined();
  const effect = mergeEffectWithSkillTargeting(skill, raw!) as SkillEffectDef;
  const resolution = resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    getPassiveDefs(actor, gameData.skillRegistry.passives),
    skill.effect,
    undefined,
    skill,
  );
  return resolution?.waves.flatMap((wave) =>
    wave.targets.map((target) => target.unit.id),
  ) ?? [];
}

describe('Kill CombatModule integration (R12g-e5)', () => {
  beforeEach(() => resetEntityIdCounter());

  it('all four classes expose the formal M1/M2 pools and party selection is exclusive', () => {
    CLASSES.forEach((classId, index) => {
      expect(gameData.classRegistry[classId]?.combatModuleIds).toEqual([M1[index], M2[index]]);
    });

    const selection = new PartyCombatModuleSelection();
    setModules(selection, M1);
    expect(createParty(selection).map(basicSkillId)).toEqual(M1);
    setModules(selection, M2);
    const wave2 = createParty(selection);
    expect(wave2.map(basicSkillId)).toEqual(M2);
    wave2.forEach((unit, slot) => expect(basicSkillId(unit)).not.toBe(M1[slot]));
  });

  it('Wave prep recreates all four attackers with M2 and does not carry combat state', () => {
    const selection = new PartyCombatModuleSelection();
    setModules(selection, M1);
    const operation = OperationState.begin({ source: { kind: 'fixedStage', stageId: 'kill_integration' }, party, moduleSelection: selection })!;
    const wave1 = createParty(operation.getCombatModuleSelection());
    wave1[0]!.hp = 1;
    wave1[1]!.barrierHp = 50;

    operation.beginWavePrepEditing();
    M2.forEach((id, slot) => {
      expect(operation.trySetCombatModuleForSlot(slot, id, gameData)).toBe(true);
    });
    operation.endWavePrepEditing();

    const wave2 = createParty(operation.getCombatModuleSelection());
    expect(wave2.map(basicSkillId)).toEqual(M2);
    expect(wave2[0]!.hp).toBe(wave2[0]!.maxHp);
    expect(wave2[1]!.barrierHp).toBe(0);
  });

  it('shared targeting keeps each M1/M2 hit shape independent in one encounter', () => {
    const selection = new PartyCombatModuleSelection();
    setModules(selection, M1);
    const m1Actors = createParty(selection);
    m1Actors.forEach((actor) => { actor.battleX = 100; });
    const enemies = [
      mockUnit('front_high_def', 110, { isEnemy: true, def: 100, hp: 500, maxHp: 500 }),
      mockUnit('low_hp', 115, { isEnemy: true, def: 10, hp: 20, maxHp: 200 }),
      mockUnit('ranged_core', 120, { isEnemy: true, def: 30, hp: 300, maxHp: 300, formationRow: 'back', rangePx: 200 }),
      mockUnit('other', 125, { isEnemy: true, def: 20, hp: 300, maxHp: 300 }),
    ];
    expect(resolveDamageTargets(M1[0], m1Actors[0]!, m1Actors, enemies)).toEqual(['front_high_def']);
    expect(resolveDamageTargets(M1[1], m1Actors[1]!, m1Actors, enemies)).toEqual(['low_hp']);
    // Ranger's ranged-attacker priority belongs to the attack-target layer;
    // the shared module effect deliberately keeps nearest fallback.
    expect(resolveDamageTargets(M1[2], m1Actors[2]!, m1Actors, enemies)).toEqual(['front_high_def']);
    expect(resolveDamageTargets(M1[3], m1Actors[3]!, m1Actors, enemies)).toEqual(['front_high_def']);

    setModules(selection, M2);
    const m2Actors = createParty(selection);
    m2Actors.forEach((actor) => { actor.battleX = 100; });
    expect(resolveDamageTargets(M2[0], m2Actors[0]!, m2Actors, enemies)).toHaveLength(3);
    expect(resolveDamageTargets(M2[1], m2Actors[1]!, m2Actors, enemies)).toEqual(['low_hp']);
    expect(resolveDamageTargets(M2[2], m2Actors[2]!, m2Actors, enemies)).toEqual([
      'front_high_def',
      'low_hp',
      'ranged_core',
    ]);
    const chainEnemies = [
      mockUnit('chain_anchor', 150, { isEnemy: true, res: 0 }),
      mockUnit('chain_hop', 220, { isEnemy: true, res: 0 }),
    ];
    expect(resolveDamageTargets(M2[3], m2Actors[3]!, m2Actors, chainEnemies)).toEqual([
      'chain_anchor',
      'chain_hop',
    ]);
  });

  it('enemyGroups select the same four M2 modules on enemy combatants', () => {
    const stage: StageDef = {
      id: 'kill_enemy_symmetry',
      displayName: 'Kill enemy symmetry',
      recommendedLevel: 10,
      enemyGroups: CLASSES.map((classId, index) => ({
        classId,
        count: 1,
        selectedCombatModuleId: M2[index],
      })),
      waves: [{ enemies: [] }],
    };
    const enemies = expandEnemyGroups(stage).map((spec) =>
      createEnemyFromClassGroup(spec, gameData.classRegistry[spec.classId]!, gameData, levelCurves),
    );
    expect(enemies.map(basicSkillId)).toEqual(M2);
    expect(enemies.every((enemy) => enemy.isEnemy)).toBe(true);
  });
});
