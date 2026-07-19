/**
 * R12l 作業単位3B — 対象4兵科の旧仕様隔離。
 * 対象0件で成功しないよう、削除対象 ID 一覧と検査件数を固定する。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';
import { getOperationPassiveCandidatesForClass } from '../game/operationPassiveCatalogCore.ts';
import { STATUS_BADGE_SLOT_ORDER } from './statusEffectDisplay.ts';
import {
  getStatusIconUrl,
  hasStatusIcon,
} from '../render/StatusIconRegistry.ts';
import {
  GAME_TERM_ENTRIES,
  getGameTermEntry,
} from '../ui/gameTermGlossary.ts';
import { segmentTextByGameTerms } from '../ui/annotateGameTerms.ts';

const R12L_CLASSES = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
] as const;

const DELETED_ACTIVES = [
  'df_guardian_active_1',
  'df_guardian_active_2',
  'df_guardian_active_3',
  'df_guardian_active_4',
  'at_swordsman_active_1',
  'at_swordsman_active_2',
  'at_swordsman_active_3',
  'at_swordsman_active_4',
  'at_sorcerer_active_1',
  'at_sorcerer_active_2',
  'at_sorcerer_active_3',
  'at_sorcerer_active_4',
  'sp_cleric_active_1',
  'sp_cleric_active_2',
  'sp_cleric_active_3',
  'sp_cleric_active_4',
] as const;

const KEPT_BASIC_ATTACKS = [
  'df_guardian_basic_attack',
  'at_swordsman_basic_attack',
  'at_sorcerer_basic_attack',
  'sp_cleric_basic_attack',
] as const;

const DELETED_PASSIVES_AND_OPS = [
  'df_guardian_passive_3',
  'df_guardian_op_brace',
  'df_guardian_op_wall_aura',
  'df_guardian_op_last_stand',
  'at_swordsman_op_armor_break',
  'at_swordsman_op_high_def_focus',
  'at_swordsman_op_finish_cut',
  'at_sorcerer_passive_2',
  'at_sorcerer_passive_3',
  'at_sorcerer_passive_4',
  'at_sorcerer_op_arc_bolt',
  'at_sorcerer_op_ember_dot',
  'at_sorcerer_op_resonant_hit',
  'sp_cleric_op_triage',
  'sp_cleric_op_excess_ward',
  'sp_cleric_op_heal_reserve',
] as const;

const KEPT_BODY_PASSIVES: Record<(typeof R12L_CLASSES)[number], string> = {
  df_guardian: 'df_guardian_passive_1',
  at_swordsman: 'at_swordsman_passive_2',
  at_sorcerer: 'at_sorcerer_passive_1',
  sp_cleric: 'sp_cleric_passive_1',
};

const OLD_EFFECT_STRINGS = [
  'blockResonance',
  'blockResonanceConsume',
  'blockResonanceStacks',
  'blockResonanceStance',
  'seedFlameOnActiveHit',
  'bonusActiveOnHit',
  'blazingFlameDetonate',
  'seedFlame',
  'blazingFlame',
] as const;

const DELETED_STATUS_CATEGORIES = [
  'seedFlame',
  'blazingFlame',
  'blockResonance',
  'blockResonanceStance',
] as const;

describe('R12l legacy isolation (unit 3B)', () => {
  const gameData = loadGameData();
  const { passives, actives } = gameData.skillRegistry;

  it('asserts deletion target list sizes (fail-closed)', () => {
    expect(R12L_CLASSES).toHaveLength(4);
    expect(DELETED_ACTIVES).toHaveLength(16);
    expect(KEPT_BASIC_ATTACKS).toHaveLength(4);
    expect(DELETED_PASSIVES_AND_OPS).toHaveLength(16);
    expect(OLD_EFFECT_STRINGS).toHaveLength(9);
    expect(DELETED_STATUS_CATEGORIES).toHaveLength(4);
  });

  it('R12l classes have empty skills[] and zero learned actives', () => {
    expect(R12L_CLASSES.length).toBeGreaterThan(0);
    for (const classId of R12L_CLASSES) {
      const preset = gameData.classRegistry[classId];
      expect(preset.skills, classId).toEqual([]);
      expect(preset.passiveIds, classId).toEqual([KEPT_BODY_PASSIVES[classId]]);
      const learned = resolveLearnedSkills(preset, 99, gameData.skillRegistry);
      expect(learned.learnedActiveIds, classId).toEqual([]);
      expect(learned.learnedPassiveIds, classId).toEqual([
        KEPT_BODY_PASSIVES[classId],
      ]);
    }
  });

  it('deleted actives are absent; basic attacks remain', () => {
    expect(DELETED_ACTIVES.length).toBeGreaterThan(0);
    for (const id of DELETED_ACTIVES) {
      expect(actives[id], id).toBeUndefined();
    }
    expect(KEPT_BASIC_ATTACKS.length).toBeGreaterThan(0);
    for (const id of KEPT_BASIC_ATTACKS) {
      expect(actives[id], id).toBeDefined();
    }
  });

  it('deleted passives and catalog-外 ops are absent from registry', () => {
    expect(DELETED_PASSIVES_AND_OPS.length).toBeGreaterThan(0);
    for (const id of DELETED_PASSIVES_AND_OPS) {
      expect(passives[id], id).toBeUndefined();
    }
  });

  it('each R12l class has exactly 5 operation passive candidates from current catalog', () => {
    expect(R12L_CLASSES.length).toBeGreaterThan(0);
    for (const classId of R12L_CLASSES) {
      const candidates = getOperationPassiveCandidatesForClass(
        gameData.operationPassiveCatalog,
        classId,
      );
      expect(candidates, classId).toHaveLength(5);
      for (const id of candidates) {
        expect(passives[id], `${classId}:${id}`).toBeDefined();
        expect(DELETED_PASSIVES_AND_OPS.includes(id as never), id).toBe(false);
      }
    }
  });

  it('non-R12l class still has Lv actives in skills[] (shared unlock path kept)', () => {
    const other = Object.values(gameData.classRegistry).find(
      (preset) =>
        !R12L_CLASSES.includes(preset.id as (typeof R12L_CLASSES)[number]) &&
        preset.skills.length > 0,
    );
    expect(other).toBeDefined();
    const learned = resolveLearnedSkills(other!, 99, gameData.skillRegistry);
    expect(learned.learnedActiveIds.length).toBeGreaterThan(0);
  });

  it('production skill JSON does not contain old dedicated effect strings', () => {
    expect(OLD_EFFECT_STRINGS.length).toBeGreaterThan(0);
    const blob = JSON.stringify({
      passives: Object.values(passives),
      actives: Object.values(actives),
      classes: Object.values(gameData.classRegistry),
      catalog: gameData.operationPassiveCatalog,
    });
    for (const token of OLD_EFFECT_STRINGS) {
      expect(blob.includes(`"${token}"`), token).toBe(false);
    }
  });

  it('sorcerer body passive is emberIgnition (new seed flame path)', () => {
    expect(passives['at_sorcerer_passive_1']?.effect).toBe('emberIgnition');
  });

  it('emberIgnition owns status icon registry key and emberIgnition.png asset', () => {
    expect(hasStatusIcon('emberIgnition')).toBe(true);
    const url = getStatusIconUrl('emberIgnition');
    expect(url).toBeTruthy();
    expect(String(url)).toMatch(/emberIgnition\.png/);
    expect(String(url)).not.toMatch(/seedFlame\.png/);
  });

  it('deleted status categories are absent from badge slot order', () => {
    expect(DELETED_STATUS_CATEGORIES.length).toBeGreaterThan(0);
    expect(STATUS_BADGE_SLOT_ORDER).toContain('emberIgnition');
    for (const category of DELETED_STATUS_CATEGORIES) {
      expect(
        STATUS_BADGE_SLOT_ORDER.includes(category as never),
        category,
      ).toBe(false);
    }
  });

  it('種火 alias is owned only by emberIgnition', () => {
    const owners = GAME_TERM_ENTRIES.filter((entry) =>
      (entry.aliases?.ja ?? []).includes('種火'),
    ).map((entry) => entry.id);
    expect(owners).toEqual(['emberIgnition']);
    expect(getGameTermEntry('emberIgnition')?.aliases?.ja).toContain('種火');
    const termSeg = segmentTextByGameTerms('種火', 'ja').find(
      (seg) => seg.kind === 'term',
    );
    expect(termSeg).toEqual({
      kind: 'term',
      termId: 'emberIgnition',
      matchedText: '種火',
    });
  });

  it('party-formation UI spec does not reinstate deleted flame / blockResonanceConsume', () => {
    const path = resolve(process.cwd(), 'docs/spec/party-formation-ui.md');
    const text = readFileSync(path, 'utf8');
    expect(text.length).toBeGreaterThan(0);
    const banned = [
      'blockResonanceConsume',
      '焼き尽くす熾火',
      '種火 / 熾火',
      'blazingFlame',
    ] as const;
    expect(banned.length).toBeGreaterThan(0);
    for (const token of banned) {
      expect(text.includes(token), token).toBe(false);
    }
    expect(text).toContain('emberIgnition');
  });
});
