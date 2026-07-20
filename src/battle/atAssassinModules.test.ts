/**
 * R12g-e2 — 双刃士 M1/M2 CombatModule。
 * target / Approach / damage / 排他 / 敵味方対称は runtime 結果で固定する。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveEffectResolution } from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import {
  createAllyFromMember,
  createAlliesFromPartyState,
  resetEntityIdCounter,
} from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import {
  resolveAllPlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolvePlayerAttackTargetEnemy,
  resolveEnemyAttackTargetPlayer,
  resolvePlayerChaseTargetEnemy,
  resolveEnemyChaseTargetPlayer,
} from './resolveApproachBattleX.ts';
import { getEnemyContactX, getPlayerContactX } from './combatPosition.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
import {
  combatModuleFilesFromDraft,
  combatModulesDraftFromModules,
  normalizeCombatModulesDraftForSave,
  validateCombatModulesDraftForSave,
} from '../editor/editorApi.ts';
import {
  findCombatModuleDraft,
  upsertCombatModuleDraft,
} from '../editor/combatModuleEditor.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { OperationState } from '../game/OperationState.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import type {
  BattleEventListener,
  CombatModuleDef,
  CombatantState,
  SkillEffectDef,
} from './types.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'at_assassin_mod_rear_intrude';
const M2_ID = 'at_assassin_mod_frontline_finish';
const HP_LOWEST_PASSIVE_ID = 'at_assassin_passive_2';

function mockMember(level = 10) {
  return {
    classId: 'at_assassin',
    build: {
      learnedPassiveIds: [HP_LOWEST_PASSIVE_ID] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level, exp: 0 },
  };
}

function makeAssassin(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_assassin!;
  const unit = createAllyFromMember(
    mockMember(),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  return {
    ...unit,
    id: partial.id ?? 'assassin',
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 100,
    formationRow: partial.formationRow ?? 'front',
    ...partial,
  };
}

function moduleSkill(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId];
  expect(module).toBeDefined();
  return synthesizeCombatModuleSkill(module!);
}

function damageEffect(moduleId: string): {
  skill: ReturnType<typeof moduleSkill>;
  effect: SkillEffectDef;
} {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find((entry) => entry.type === 'damage');
  expect(raw?.type).toBe('damage');
  return { skill, effect: mergeEffectWithSkillTargeting(skill, raw!) };
}

function resolveModuleDamage(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const { skill, effect } = damageEffect(moduleId);
  return resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    undefined,
    skill.effect,
    undefined,
    skill,
  );
}

function createSkillExecutor(
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const events: Parameters<BattleEventListener>[0][] = [];
  const runner = new SkillSequenceRunner();
  const executor = new SkillExecutor(gameData, (event) => events.push(event), {
    getSequenceRunner: () => runner,
    getBattleTimeSec: () => 0,
    getAllCombatants: () => [...allies, ...enemies],
  });
  return { executor, events, runner };
}

function loadSkillsRoot() {
  const passives = import.meta.glob('../../data/skills/passives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;
  const actives = import.meta.glob('../../data/skills/actives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;
  return {
    passives: Object.values(passives).flat(),
    actives: Object.values(actives).flat(),
  };
}

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadMergedCombatModules(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

describe('at_assassin CombatModule runtime (R12g-e2)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('class owns current-HP-lowest via passive; modules declare the same target', () => {
    const passive = gameData.skillRegistry.passives[HP_LOWEST_PASSIVE_ID]!;
    expect(passive.effect).toBe('targetRuleOverride');
    expect(passive.targetRuleOverride).toEqual({
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'lowest',
    });
    expect(passive.targetRuleOverride?.order).not.toBe('ratio');

    for (const moduleId of [M1_ID, M2_ID]) {
      const effect = damageEffect(moduleId).effect;
      expect(effect.target).toEqual({
        kind: 'stat',
        side: 'enemy',
        stat: 'hp',
        order: 'lowest',
      });
    }

    const cls = gameData.classRegistry.at_assassin!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
  });

  it('M1 selects current HP lowest enemy, not support / ranged / high DEF', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100 });
    // All in melee range so selection (not Approach) is under test
    const tank = mockUnit('tank', 120, {
      hp: 400,
      maxHp: 400,
      def: 99,
      formationRow: 'front',
    });
    const cleric = mockUnit('cleric', 125, {
      hp: 80,
      maxHp: 200,
      def: 5,
      formationRow: 'back',
      rangePx: 200,
    });
    const ranger = mockUnit('ranger', 130, {
      hp: 150,
      maxHp: 200,
      def: 10,
      formationRow: 'back',
      rangePx: 300,
    });
    const resolution = resolveModuleDamage(
      M1_ID,
      assassin,
      [assassin],
      [tank, cleric, ranger],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'cleric',
    ]);
    expect(resolution?.waves[0]?.targets).toHaveLength(1);
  });

  it('current HP lowest uses absolute HP, not HP ratio', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100 });
    // ratio lower (0.25) but absolute higher; abs_low has lowest current HP
    const ratioLow = mockUnit('ratio_low', 120, { hp: 50, maxHp: 200 });
    const absLow = mockUnit('abs_low', 125, { hp: 40, maxHp: 40 });
    const mid = mockUnit('mid', 130, { hp: 120, maxHp: 200 });
    const resolution = resolveModuleDamage(
      M1_ID,
      assassin,
      [assassin],
      [ratioLow, absLow, mid],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('abs_low');
    expect(resolution?.waves[0]?.targets[0]?.unit.id).not.toBe('ratio_low');
  });

  it('M1 chase and approach cross frontline toward backline lowest-HP', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100 });
    const front = mockUnit('front', 200, {
      hp: 300,
      maxHp: 300,
      formationRow: 'front',
    });
    const back = mockUnit('back', 350, {
      hp: 40,
      maxHp: 200,
      formationRow: 'back',
    });
    const enemies = [front, back];
    const chase = resolvePlayerChaseTargetEnemy(
      assassin,
      [assassin],
      enemies,
      gameData,
    );
    expect(chase?.id).toBe('back');

    const contact = getEnemyContactX(enemies);
    expect(contact).toBe(200);
    const approach = resolveAllPlayerApproachBattleX(
      [assassin],
      enemies,
      gameData,
    ).get(assassin.id)!;
    expect(approach).toBeGreaterThan(contact!);
    expect(approach).toBeGreaterThan(front.battleX);
    // near backline standoff, not stuck at front contact
    expect(approach).toBeGreaterThan(back.battleX - 80);
  });

  it('M1 does not fallback to frontline when backline is lowest HP', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100 });
    const front = mockUnit('front', 200, { hp: 500, maxHp: 500 });
    const back = mockUnit('back', 340, { hp: 30, maxHp: 200 });
    expect(
      resolvePlayerChaseTargetEnemy(
        assassin,
        [assassin],
        [front, back],
        gameData,
      )?.id,
    ).toBe('back');

    const approach = resolveAllPlayerApproachBattleX(
      [assassin],
      [front, back],
      gameData,
    ).get(assassin.id)!;
    assassin.battleX = approach;
    expect(
      resolvePlayerAttackTargetEnemy(
        assassin,
        [assassin],
        [front, back],
        gameData,
      )?.id,
    ).toBe('back');
    expect(
      resolveModuleDamage(M1_ID, assassin, [assassin], [front, back])?.waves[0]
        ?.targets[0]?.unit.id,
    ).toBe('back');
  });

  it('M1 retargets to next current-HP-lowest after prior target dies', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100 });
    const a = mockUnit('a', 120, { hp: 0, maxHp: 100 });
    const b = mockUnit('b', 125, { hp: 40, maxHp: 100 });
    const c = mockUnit('c', 130, { hp: 80, maxHp: 100 });
    expect(a.isAlive).toBe(false);
    expect(
      resolvePlayerChaseTargetEnemy(
        assassin,
        [assassin],
        [a, b, c],
        gameData,
      )?.id,
    ).toBe('b');
    expect(
      resolveModuleDamage(M1_ID, assassin, [assassin], [a, b, c])?.waves[0]
        ?.targets[0]?.unit.id,
    ).toBe('b');
  });

  it('M2 approach does not overtake enemy contact; cannot attack deep backline', () => {
    const assassin = makeAssassin(M2_ID, { battleX: 100 });
    const front = mockUnit('front', 200, {
      hp: 300,
      maxHp: 300,
      formationRow: 'front',
    });
    const back = mockUnit('back', 350, {
      hp: 20,
      maxHp: 200,
      formationRow: 'back',
    });
    const enemies = [front, back];
    const contact = getEnemyContactX(enemies)!;
    expect(
      resolvePlayerChaseTargetEnemy(
        assassin,
        [assassin],
        enemies,
        gameData,
      )?.id,
    ).toBe('back');

    const approach = resolveAllPlayerApproachBattleX(
      [assassin],
      enemies,
      gameData,
    ).get(assassin.id)!;
    expect(approach).toBeLessThanOrEqual(contact);
    expect(approach).toBeLessThan(back.battleX);

    // placed at approach stop: deep backline still out of attack range
    assassin.battleX = approach;
    expect(
      resolvePlayerAttackTargetEnemy(
        assassin,
        [assassin],
        enemies,
        gameData,
      )?.id,
    ).not.toBe('back');
  });

  it('M2 can attack invading enemy assassin when that unit is current-HP-lowest in range', () => {
    const assassin = makeAssassin(M2_ID, { battleX: 100 });
    const front = mockUnit('front', 220, {
      hp: 400,
      maxHp: 400,
      formationRow: 'front',
    });
    // past contact toward ally side
    const invader = mockUnit('invader', 160, {
      hp: 25,
      maxHp: 110,
      classId: 'at_assassin',
      formationRow: 'front',
    });
    const enemies = [front, invader];
    const contact = getEnemyContactX(enemies)!;
    expect(contact).toBe(160);

    const approach = resolveAllPlayerApproachBattleX(
      [assassin],
      enemies,
      gameData,
    ).get(assassin.id)!;
    expect(approach).toBeLessThanOrEqual(contact);
    assassin.battleX = approach;

    expect(
      resolvePlayerAttackTargetEnemy(
        assassin,
        [assassin],
        enemies,
        gameData,
      )?.id,
    ).toBe('invader');
    // not classId-fixed priority: higher-HP assassin loses to lower-HP non-assassin in range
    const lowCleric = mockUnit('low_cleric', 115, {
      hp: 10,
      maxHp: 200,
      rangePx: 200,
    });
    const highAssassin = mockUnit('high_assassin', 120, {
      hp: 90,
      maxHp: 110,
    });
    highAssassin.classId = 'at_assassin';
    assassin.battleX = 100;
    expect(
      resolveModuleDamage(
        M2_ID,
        assassin,
        [assassin],
        [front, highAssassin, lowCleric],
      )?.waves[0]?.targets[0]?.unit.id,
    ).toBe('low_cleric');
  });

  it('M2 does not guarantee support reach (backline support stays unattackable from front stop)', () => {
    const assassin = makeAssassin(M2_ID, { battleX: 100 });
    const front = mockUnit('front', 200, { hp: 500, maxHp: 500 });
    const support = mockUnit('support', 360, {
      hp: 15,
      maxHp: 200,
      role: 'supporter',
      formationRow: 'back',
    });
    const enemies = [front, support];
    const approach = resolveAllPlayerApproachBattleX(
      [assassin],
      enemies,
      gameData,
    ).get(assassin.id)!;
    assassin.battleX = approach;
    expect(
      resolvePlayerAttackTargetEnemy(
        assassin,
        [assassin],
        enemies,
        gameData,
      )?.id,
    ).not.toBe('support');
  });

  it('M1 selected: approach past contact; M2 selected: capped — exclusivity of approach', () => {
    const front = mockUnit('front', 200, { hp: 400, maxHp: 400 });
    const back = mockUnit('back', 340, { hp: 30, maxHp: 200 });
    const enemies = [front, back];
    const contact = getEnemyContactX(enemies)!;

    const m1 = makeAssassin(M1_ID, { id: 'm1', battleX: 100 });
    const m2 = makeAssassin(M2_ID, { id: 'm2', battleX: 100 });
    const m1Approach = resolveAllPlayerApproachBattleX(
      [m1],
      enemies,
      gameData,
    ).get('m1')!;
    const m2Approach = resolveAllPlayerApproachBattleX(
      [m2],
      enemies,
      gameData,
    ).get('m2')!;
    expect(m1Approach).toBeGreaterThan(contact);
    expect(m2Approach).toBeLessThanOrEqual(contact);
    expect(m1.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M1_ID,
    );
    expect(m2.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
  });

  it('enemy M1 mirrors lowest-HP chase and may approach past player contact', () => {
    const enemy = makeAssassin(M1_ID, {
      id: 'enemy_as',
      isEnemy: true,
      battleX: 300,
    });
    const tank = mockUnit('tank', 200, {
      hp: 400,
      maxHp: 400,
      isEnemy: false,
      formationRow: 'front',
    });
    const back = mockUnit('back', 80, {
      hp: 35,
      maxHp: 200,
      isEnemy: false,
      formationRow: 'back',
    });
    expect(
      resolveEnemyChaseTargetPlayer(enemy, [tank, back], [enemy], gameData)?.id,
    ).toBe('back');
    const approach = resolveEnemyApproachBattleX(
      enemy,
      [tank, back],
      [enemy],
      gameData,
    );
    const playerContact = getPlayerContactX([tank, back])!;
    expect(approach).toBeLessThan(playerContact);
    enemy.battleX = approach;
    expect(
      resolveEnemyAttackTargetPlayer(enemy, [tank, back], [enemy], gameData)
        ?.id,
    ).toBe('back');
    expect(
      resolveModuleDamage(M1_ID, enemy, [tank, back], [enemy])?.waves[0]
        ?.targets[0]?.unit.id,
    ).toBe('back');
  });

  it('enemy M2 does not overtake player contact', () => {
    const enemy = makeAssassin(M2_ID, {
      id: 'enemy_as',
      isEnemy: true,
      battleX: 320,
    });
    const tank = mockUnit('tank', 180, {
      hp: 400,
      maxHp: 400,
      isEnemy: false,
    });
    const back = mockUnit('back', 60, {
      hp: 20,
      maxHp: 200,
      isEnemy: false,
      formationRow: 'back',
    });
    const playerContact = getPlayerContactX([tank, back])!;
    const approach = resolveEnemyApproachBattleX(
      enemy,
      [tank, back],
      [enemy],
      gameData,
    );
    expect(approach).toBeGreaterThanOrEqual(playerContact);
    enemy.battleX = approach;
    expect(
      resolveEnemyAttackTargetPlayer(enemy, [tank, back], [enemy], gameData)
        ?.id,
    ).not.toBe('back');
  });

  it('SkillExecutor deals single physical Hit; Barrier absorbs without special multi-hit', () => {
    const assassin = makeAssassin(M1_ID, { battleX: 100, atk: 100 });
    const target = mockUnit('t', 120, {
      hp: 200,
      maxHp: 200,
      def: 0,
      barrierHp: 40,
    });
    const allies = [assassin];
    const enemies = [target];
    const { executor, events } = createSkillExecutor(allies, enemies);
    const basicCd = assassin.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    expect(executor.tryExecute(assassin, basicCd, allies, enemies)).toBe(true);

    const damageEvents = events.filter(
      (e) => e.type === 'skill' && e.effect === 'damage',
    );
    expect(damageEvents).toHaveLength(1);
    expect(damageEvents[0]).toMatchObject({ targetId: 't' });
    // Barrier first, then leftover to HP — same path as normal damage
    expect(target.barrierHp).toBe(0);
    expect(target.hp).toBeLessThan(200);
    expect(target.hp).toBeGreaterThan(0);

    const effect = damageEffect(M1_ID).effect;
    expect(effect.damageType).toBe('physical');
    expect(effect.hitCount ?? 1).toBe(1);
    expect(effect.type).toBe('damage');
    expect(effect.type).not.toBe('heal');
  });

  it('modules have no heal / lifesteal effects', () => {
    for (const moduleId of [M1_ID, M2_ID]) {
      const module = gameData.combatModuleRegistry[moduleId]!;
      for (const effect of module.action.effect) {
        expect(effect.type).toBe('damage');
        expect(effect.type).not.toBe('heal');
        expect(
          'lifesteal' in effect ||
            (effect as { healSubKind?: string }).healSubKind,
        ).toBeFalsy();
      }
      expect(module.description).not.toMatch(/吸収|自己回復|Barrier|バリア破壊/);
      expect(module.description).not.toMatch(/瞬間移動|2Hit|出血|回避/);
    }
  });

  it('M1/M2 descriptions state intrusion vs frontline finish difference', () => {
    const m1 = gameData.combatModuleRegistry[M1_ID]!;
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m1.description).toMatch(/現在.*HP.*低/);
    expect(m1.description).toMatch(/前線を越え/);
    expect(m2.description).toMatch(/前線を越えず/);
    expect(m2.description).toMatch(/現在HP/);
    expect(m1.action.attackMethod).toBe('melee');
    expect(m2.action.attackMethod).toBe('ranged');
    expect(m2.action.effect[0]?.range).toBe(90);
  });

  it('Operation Wave prep switches module and changes approach runtime', () => {
    const party = [mockMember()];
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, M1_ID);
    const op = OperationState.begin({
      source: { kind: 'fixedStage', stageId: 'assassin_module_switch' },
      party,
      moduleSelection: selection,
    });
    expect(op).not.toBeNull();

    const wave1 = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => op!.getCombatModuleSelection().getSelectedCombatModuleId(slot),
    );
    expect(wave1[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M1_ID,
    );

    const front = mockUnit('front', 200, { hp: 400, maxHp: 400 });
    const back = mockUnit('back', 340, { hp: 25, maxHp: 200 });
    const contact = getEnemyContactX([front, back])!;
    wave1[0]!.battleX = 100;
    const m1Approach = resolveAllPlayerApproachBattleX(
      [wave1[0]!],
      [front, back],
      gameData,
    ).get(wave1[0]!.id)!;
    expect(m1Approach).toBeGreaterThan(contact);

    op!.beginWavePrepEditing();
    expect(op!.trySetCombatModuleForSlot(0, M2_ID, gameData)).toBe(true);
    op!.endWavePrepEditing();

    const wave2 = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => op!.getCombatModuleSelection().getSelectedCombatModuleId(slot),
    );
    expect(wave2[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
    wave2[0]!.battleX = 100;
    const m2Approach = resolveAllPlayerApproachBattleX(
      [wave2[0]!],
      [front, back],
      gameData,
    ).get(wave2[0]!.id)!;
    expect(m2Approach).toBeLessThanOrEqual(contact);
  });

  it('Survival / swordsman modules still load and keep prior shapes', () => {
    expect(gameData.combatModuleRegistry.df_guardian_mod_nearest_strike).toBeDefined();
    expect(gameData.combatModuleRegistry.at_swordsman_mod_single_slash).toBeDefined();
    expect(
      gameData.combatModuleRegistry.at_swordsman_mod_pierce_slash?.action
        .targetShape,
    ).toBe('multiLock');
  });
});

describe('at_assassin CombatModule validation (R12g-e2)', () => {
  function bundleWithModules(combatModules: CombatModuleDef[]) {
    return {
      classes: classesJson,
      enemies: enemiesJson,
      parties: partiesJson,
      stages: stagesJson,
      skills: loadSkillsRoot(),
      combatModules,
      operationPassiveCatalog: operationPassiveCatalogJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    };
  }

  it('production GameData validates with assassin modules', () => {
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(loadMergedCombatModules())),
    ).not.toThrow();
  });

  it('rejects non-hp-lowest target', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect[0] = {
      ...m1.action.effect[0]!,
      type: 'damage',
      target: { kind: 'stat', side: 'enemy', stat: 'def', order: 'highest' },
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/enemy hp lowest/);
  });

  it('rejects heal / magic / multiLock on assassin modules', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect.push({
      type: 'heal',
      healSubKind: 'instant',
      target: { kind: 'stat', side: 'enemy', stat: 'hp', order: 'lowest' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/damage effects only/);

    const combatModules2 = structuredClone(loadMergedCombatModules());
    const m2 = combatModules2.find((m) => m.id === M2_ID)!;
    m2.action.effect[0] = {
      ...m2.action.effect[0]!,
      type: 'damage',
      damageType: 'magic',
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules2)),
    ).toThrow(/physical damage/);

    const combatModules3 = structuredClone(loadMergedCombatModules());
    const m1b = combatModules3.find((m) => m.id === M1_ID)!;
    m1b.action.targetShape = 'multiLock';
    m1b.action.hitCount = 2;
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules3)),
    ).toThrow(/single-target single Hit/);
  });

  it('rejects M2 long range that would reach deep backline from contact', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m2 = combatModules.find((m) => m.id === M2_ID)!;
    m2.action.effect[0] = {
      ...m2.action.effect[0]!,
      type: 'damage',
      range: 400,
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/mid-range/);
  });

  it('rejects M1 as ranged mid-range shape', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.attackMethod = 'ranged';
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/M1 rear intrude must be melee/);
  });

  it('editor round-trip preserves M1/M2 approach-critical fields', () => {
    let draft = combatModulesDraftFromModules(loadMergedCombatModules());
    expect(validateCombatModulesDraftForSave(draft)).toBeNull();

    const m1 = findCombatModuleDraft(draft, M1_ID)!;
    const m2 = findCombatModuleDraft(draft, M2_ID)!;
    draft = upsertCombatModuleDraft(draft, {
      ...m1,
      description: `${m1.description}（編集）`,
    });
    draft = upsertCombatModuleDraft(draft, {
      ...m2,
      attackIntervalSec: m2.attackIntervalSec + 0.1,
    });

    const normalized = normalizeCombatModulesDraftForSave(draft);
    const files = combatModuleFilesFromDraft(normalized);
    const assassinFile = files.find((f) => f.classId === 'at_assassin');
    expect(assassinFile?.modules).toHaveLength(2);

    const round = parseAndValidateGameDataJson(
      bundleWithModules(normalized),
    ).combatModules;
    const roundM1 = round.find((m) => m.id === M1_ID)!;
    const roundM2 = round.find((m) => m.id === M2_ID)!;
    expect(roundM1.action.attackMethod).toBe('melee');
    expect(roundM1.action.effect[0]?.target).toEqual({
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'lowest',
    });
    expect(roundM2.action.attackMethod).toBe('ranged');
    expect(roundM2.action.effect[0]?.range).toBe(90);
    expect(roundM2.action.effect[0]?.damageType).toBe('physical');
  });
});
