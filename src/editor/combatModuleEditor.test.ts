import { afterEach, describe, expect, it, vi } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import stagesJson from '@game-data/stages';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from '../battle/data/synthesizeCombatModuleSkill.ts';
import {
  parseAndValidateGameDataJson,
  sanitizePassiveSkillForJson,
} from '../battle/data/validateGameData.ts';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import type { CombatModuleDef, PassiveSkillDef } from '../battle/types.ts';
import { formatActiveDescription } from '../ui/formatSkillText.ts';
import { CombatModuleEditorStep } from './CombatModuleEditorStep.ts';
import {
  findCombatModuleDraft,
  listCombatModulesForClass,
  summarizeCombatModuleEffectRange,
  upsertCombatModuleDraft,
} from './combatModuleEditor.ts';
import {
  combatModuleFilesFromDraft,
  combatModulesDraftFromModules,
  normalizeCombatModulesDraftForSave,
  validateCombatModulesDraftForSave,
} from './editorApi.ts';
import {
  applyBuffEffectToPassive,
  passiveBuffToEffectDef,
} from '../battle/passiveBuffBridge.ts';

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadCombatModules(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

describe('combat module authoring helpers (R9g)', () => {
  it('lists two modules per R5 class from data', () => {
    const modules = loadCombatModules();
    expect(modules).toHaveLength(8);
    const guardian = listCombatModulesForClass(modules, 'df_guardian');
    expect(guardian).toHaveLength(2);
    expect(guardian.every((module) => module.classId === 'df_guardian')).toBe(
      true,
    );
  });

  it('normalize sorts by classId then id and groups by class file', () => {
    const modules = loadCombatModules();
    const shuffled = [...modules].reverse();
    const normalized = normalizeCombatModulesDraftForSave(shuffled);
    expect(validateCombatModulesDraftForSave(normalized)).toBeNull();
    const files = combatModuleFilesFromDraft(normalized);
    expect(files.map((file) => file.classId).sort()).toEqual([
      'at_sorcerer',
      'at_swordsman',
      'df_guardian',
      'sp_cleric',
    ]);
    expect(files.every((file) => file.modules.length === 2)).toBe(true);
  });

  it('rejects R5 class with wrong module count', () => {
    const modules = loadCombatModules().filter(
      (module) => module.id !== 'df_guardian_mod_guard_focus',
    );
    expect(validateCombatModulesDraftForSave(modules)).toMatch(
      /df_guardian.*ちょうど 2/,
    );
  });

  it('editing aoeRadiusPx keeps validate + synthesis preview consistent', () => {
    const modules = loadCombatModules();
    const source = findCombatModuleDraft(
      modules,
      'at_sorcerer_mod_twin_bolt',
    );
    expect(source).toBeDefined();
    const edited: CombatModuleDef = {
      ...structuredClone(source!),
      action: {
        ...structuredClone(source!.action),
        targetShape: 'aoe',
        aoeRadiusPx: 120,
        effectRange: {
          form: 'area',
          applyMode: 'instant',
          distancePx: 120,
        },
        hitCount: undefined,
        hitDurationSec: undefined,
      },
    };
    delete edited.action.hitCount;
    delete edited.action.hitDurationSec;
    const next = upsertCombatModuleDraft(modules, edited);
    expect(validateCombatModulesDraftForSave(next)).toBeNull();

    const skillsRoot = readSkillsRoot();
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: classesJson,
          enemies: enemiesJson,
          parties: partiesJson,
          stages: stagesJson,
          skills: skillsRoot,
          combatModules: next,
          operationPassiveCatalog: operationPassiveCatalogJson,
        },
        { mode: 'editor' },
      ),
    ).not.toThrow();

    const summary = summarizeCombatModuleEffectRange(edited);
    expect(summary).toContain('範囲');
    expect(summary).toContain('N=120');

    const synthesized = synthesizeCombatModuleSkill(edited);
    expect(synthesized.aoeRadiusPx).toBe(120);
    expect(synthesized.targetShape).toBe('aoe');
    const preview = formatActiveDescription(synthesized);
    expect(preview.length).toBeGreaterThan(0);
  });

  it('passive buffAoeRadiusPx survives sanitize round-trip (SkillEditor bridge)', () => {
    const gameData = loadGameData();
    const sample = Object.values(gameData.skillRegistry.passives).find(
      (passive) =>
        passive.effect === 'buff' &&
        (passive.buffAoeRadiusPx !== undefined ||
          passive.buffTargetShape === 'aoe'),
    );
    const base: PassiveSkillDef = sample
      ? structuredClone(sample)
      : {
          id: 'fixture_passive_range',
          name: 'fixture',
          effect: 'buff',
          buffSubKind: 'stat',
          buffStat: ['atk'],
          buffMultiplier: 1.1,
          buffTargetRule: { kind: 'self' },
          buffTargetShape: 'aoe',
          buffAoeRadiusPx: 70,
        };

    const asEffect = passiveBuffToEffectDef(base);
    asEffect.targetShape = 'aoe';
    asEffect.aoeRadiusPx = 95;
    const patched = structuredClone(base);
    applyBuffEffectToPassive(patched, asEffect);
    expect(patched.buffAoeRadiusPx).toBe(95);

    const sanitized = sanitizePassiveSkillForJson(patched);
    expect(sanitized.buffAoeRadiusPx).toBe(95);
    expect(sanitized.buffTargetShape).toBe('aoe');
  });
});

/**
 * @vitest-environment happy-dom
 */
describe('CombatModuleEditorStep (R9g UI)', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  it('renders picker, effect-range labels, preview, and save', () => {
    const gameData = loadGameData();
    const draft = combatModulesDraftFromModules(
      Object.values(gameData.combatModuleRegistry),
    );
    host = document.createElement('div');
    document.body.appendChild(host);

    new CombatModuleEditorStep(host, {
      getDraft: () => draft,
      classRegistry: gameData.classRegistry,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      saving: false,
    });

    expect(host.textContent).toContain('効果範囲');
    expect(host.textContent).toContain('効果範囲の形式');
    expect(host.textContent).toContain('攻撃間隔（秒）');
    expect(host.textContent).toContain('runtimeEffect');
    expect(host.textContent).toContain('合成説明');
    expect(host.querySelector('button.editor-btn-primary')?.textContent).toBe(
      '保存',
    );
  });

  it('R12g-d1: edits and keeps M2 runtimeEffect flatAmount through draft', () => {
    const gameData = loadGameData();
    let draft = combatModulesDraftFromModules(
      Object.values(gameData.combatModuleRegistry),
    );
    const onDraftChange = vi.fn((next: CombatModuleDef[]) => {
      draft = next;
    });
    host = document.createElement('div');
    document.body.appendChild(host);

    const step = new CombatModuleEditorStep(host, {
      getDraft: () => draft,
      classRegistry: gameData.classRegistry,
      onDraftChange,
      onSave: vi.fn(),
      saving: false,
    });

    const moduleSelect = host.querySelectorAll('select')[1];
    moduleSelect!.value = 'df_guardian_mod_guard_focus';
    moduleSelect!.dispatchEvent(new Event('change'));
    step.refresh();

    const flatInput = [...host.querySelectorAll('input')].find((input) =>
      input.closest('.editor-field')?.textContent?.includes('flatAmount'),
    );
    expect(flatInput).toBeTruthy();
    flatInput!.value = '25';
    flatInput!.dispatchEvent(new Event('change'));
    const m2 = findCombatModuleDraft(draft, 'df_guardian_mod_guard_focus');
    expect(m2?.runtimeEffect).toEqual({
      kind: 'healOnEnemyAttackHpHit',
      flatAmount: 25,
    });
    expect(validateCombatModulesDraftForSave(draft)).toBeNull();
  });

  it('updates draft when aoe radius changes', () => {
    const gameData = loadGameData();
    let draft = combatModulesDraftFromModules(
      Object.values(gameData.combatModuleRegistry),
    );
    const onDraftChange = vi.fn((next: CombatModuleDef[]) => {
      draft = next;
    });
    host = document.createElement('div');
    document.body.appendChild(host);

    const step = new CombatModuleEditorStep(host, {
      getDraft: () => draft,
      classRegistry: gameData.classRegistry,
      onDraftChange,
      onSave: vi.fn(),
      saving: false,
    });

    // switch to sorcerer twin bolt if available via select inputs
    const selects = [...host.querySelectorAll('select')];
    const classSelect = selects[0];
    const moduleSelect = selects[1];
    expect(classSelect).toBeTruthy();
    expect(moduleSelect).toBeTruthy();

    classSelect!.value = 'at_sorcerer';
    classSelect!.dispatchEvent(new Event('change'));
    step.refresh();

    const moduleSelectAfter = host.querySelectorAll('select')[1];
    const twinOption = [...moduleSelectAfter.querySelectorAll('option')].find(
      (option) => option.value.includes('twin') || option.value.includes('aoe'),
    );
    if (twinOption) {
      moduleSelectAfter.value = twinOption.value;
      moduleSelectAfter.dispatchEvent(new Event('change'));
    }

    // Force aoe shape + edit radius via module that supports aoe, or patch draft shape first
    const selectedId =
      host.querySelectorAll('select')[1]?.value ?? draft[0]!.id;
    const current = findCombatModuleDraft(draft, selectedId);
    expect(current).toBeDefined();
    draft = upsertCombatModuleDraft(draft, {
      ...current!,
      action: {
        ...current!.action,
        targetShape: 'aoe',
        aoeRadiusPx: 70,
      },
    });
    step.refresh();

    const radiusInput = [...host.querySelectorAll('input')].find((input) =>
      input.closest('.editor-field')?.textContent?.includes('範囲 N'),
    );
    expect(radiusInput).toBeTruthy();
    radiusInput!.value = '140';
    radiusInput!.dispatchEvent(new Event('input'));
    radiusInput!.dispatchEvent(new Event('change'));

    expect(onDraftChange).toHaveBeenCalled();
    const last = onDraftChange.mock.calls.at(-1)?.[0] as CombatModuleDef[];
    const updated = findCombatModuleDraft(last, selectedId);
    expect(updated?.action.aoeRadiusPx).toBe(140);
  });
});
