import { afterEach, describe, expect, it, vi } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
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
  listCombatModuleAuthoringClassIds,
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
  it('lists two modules per authoring class from data', () => {
    const modules = loadCombatModules();
    expect(modules).toHaveLength(16);
    const classIds = listCombatModuleAuthoringClassIds(modules);
    expect(classIds).toHaveLength(8);
    for (const classId of classIds) {
      const classModules = listCombatModulesForClass(modules, classId);
      expect(classModules).toHaveLength(2);
      expect(classModules.every((module) => module.classId === classId)).toBe(
        true,
      );
    }
  });

  it('normalize sorts by classId then id and groups by class file', () => {
    const modules = loadCombatModules();
    const shuffled = [...modules].reverse();
    const normalized = normalizeCombatModulesDraftForSave(shuffled);
    expect(validateCombatModulesDraftForSave(normalized)).toBeNull();
    const files = combatModuleFilesFromDraft(normalized);
    expect(files.map((file) => file.classId).sort()).toEqual(
      listCombatModuleAuthoringClassIds(modules).sort(),
    );
    expect(files).toHaveLength(8);
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
      'df_guardian_mod_nearest_strike',
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
      problemSeriesCatalog: problemSeriesCatalogJson,
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

  it('R12g-d3: cleric M2 heal amount and refill flag editable in draft', () => {
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

    const classSelect = host.querySelectorAll('select')[0];
    classSelect!.value = 'sp_cleric';
    classSelect!.dispatchEvent(new Event('change'));
    step.refresh();

    const moduleSelect = host.querySelectorAll('select')[1];
    moduleSelect!.value = 'sp_cleric_mod_party_mend';
    moduleSelect!.dispatchEvent(new Event('change'));
    step.refresh();

    expect(host.textContent).toContain('主効果（effect[0] heal）');
    expect(host.textContent).toContain('不足時の再命中');
    const atkInput = [...host.querySelectorAll('input')].find((input) =>
      input
        .closest('.editor-field')
        ?.textContent?.includes('atkScale（回復量倍率・仮）'),
    );
    expect(atkInput).toBeTruthy();
    atkInput!.value = '0.6';
    atkInput!.dispatchEvent(new Event('change'));

    const m2 = findCombatModuleDraft(draft, 'sp_cleric_mod_party_mend');
    expect(m2?.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(m2?.action.effect[0]?.type).toBe('heal');
    if (m2?.action.effect[0]?.type === 'heal') {
      expect(m2.action.effect[0].amount).toEqual({
        kind: 'atkBased',
        atkScale: 0.6,
      });
    }
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

  function mountEditor() {
    const gameData = loadGameData();
    let draft = combatModulesDraftFromModules(
      Object.values(gameData.combatModuleRegistry),
    );
    const onDraftChange = vi.fn((next: CombatModuleDef[]) => {
      draft = next;
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const step = new CombatModuleEditorStep(host, {
      getDraft: () => draft,
      classRegistry: gameData.classRegistry,
      onDraftChange,
      onSave: vi.fn(),
      saving: false,
    });
    return { gameData, draft: () => draft, onDraftChange, host, step };
  }

  function selectClassAndModule(
    step: CombatModuleEditorStep,
    host: HTMLElement,
    classId: string,
    moduleId: string,
  ) {
    const classSelect = host.querySelectorAll('select')[0] as HTMLSelectElement;
    classSelect.value = classId;
    classSelect.dispatchEvent(new Event('change'));
    step.refresh();
    const moduleSelect = host.querySelectorAll('select')[1] as HTMLSelectElement;
    moduleSelect.value = moduleId;
    moduleSelect.dispatchEvent(new Event('change'));
    step.refresh();
  }

  function moduleIdWithRuntimeKind(
    registry: Record<string, CombatModuleDef>,
    kind: NonNullable<CombatModuleDef['runtimeEffect']>['kind'],
  ): string {
    const module = Object.values(registry).find(
      (entry) => entry.runtimeEffect?.kind === kind,
    );
    if (!module) throw new Error(`missing runtimeEffect kind ${kind}`);
    return module.id;
  }

  function moduleIdWithDangerTarget(
    registry: Record<string, CombatModuleDef>,
  ): string {
    const module = Object.values(registry).find((entry) =>
      entry.action.effect.some(
        (effect) => 'target' in effect && effect.target?.kind === 'danger',
      ),
    );
    if (!module) throw new Error('missing danger target module');
    return module.id;
  }

  function moduleIdWithRequireBelow(
    registry: Record<string, CombatModuleDef>,
  ): string {
    const module = Object.values(registry).find((entry) => {
      const effect = entry.action.effect[0];
      const target = effect && 'target' in effect ? effect.target : undefined;
      return (
        target &&
        'requireBelow' in target &&
        target.requireBelow !== undefined
      );
    });
    if (!module) throw new Error('missing requireBelow target module');
    return module.id;
  }

  function primaryEffectTarget(module: CombatModuleDef | undefined) {
    const effect = module?.action.effect[0];
    return effect && 'target' in effect ? effect.target : undefined;
  }

  function moduleIdWithChainShape(
    registry: Record<string, CombatModuleDef>,
  ): string {
    const module = Object.values(registry).find(
      (entry) => entry.action.targetShape === 'chain',
    );
    if (!module) throw new Error('missing chain targetShape module');
    return module.id;
  }

  it('R12g-g: paladin protectFrontlineAllies maxTargets edits draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = moduleIdWithRuntimeKind(
      gameData.combatModuleRegistry,
      'protectFrontlineAllies',
    );
    selectClassAndModule(step, host, 'df_paladin', moduleId);

    const maxInput = host.querySelector(
      '[data-field="combat-module-runtime-m1-max"]',
    ) as HTMLInputElement;
    expect(maxInput).toBeTruthy();
    maxInput.value = '3';
    maxInput.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(updated?.runtimeEffect).toMatchObject({
      kind: 'protectFrontlineAllies',
      maxTargets: 3,
    });
    expect(validateCombatModulesDraftForSave(draft())).toBeNull();
    host.remove();
  });

  it('R12g-g: paladin protectDangerTarget windowSec edits draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = moduleIdWithRuntimeKind(
      gameData.combatModuleRegistry,
      'protectDangerTarget',
    );
    selectClassAndModule(step, host, 'df_paladin', moduleId);

    const windowInput = host.querySelector(
      '[data-field="combat-module-runtime-m2-window"]',
    ) as HTMLInputElement;
    expect(windowInput).toBeTruthy();
    windowInput.value = '2.5';
    windowInput.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(updated?.runtimeEffect).toMatchObject({
      kind: 'protectDangerTarget',
      windowSec: 2.5,
    });
    host.remove();
  });

  it('R12g-g: wardweaver danger maxTargets edits draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = moduleIdWithDangerTarget(gameData.combatModuleRegistry);
    selectClassAndModule(step, host, 'sp_wardweaver', moduleId);

    const dangerMax = host.querySelector(
      '[data-field="target-spec-danger-max-targets"]',
    ) as HTMLInputElement;
    expect(dangerMax).toBeTruthy();
    dangerMax.value = '2';
    dangerMax.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(primaryEffectTarget(updated)).toMatchObject({
      kind: 'danger',
      maxTargets: 2,
    });
    host.remove();
  });

  it('R12g-g: wardweaver requireBelow flatAmount edits draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = moduleIdWithRequireBelow(gameData.combatModuleRegistry);
    selectClassAndModule(step, host, 'sp_wardweaver', moduleId);

    const flatInput = host.querySelector(
      '[data-field="target-spec-require-below-flat"]',
    ) as HTMLInputElement;
    expect(flatInput).toBeTruthy();
    flatInput.value = '40';
    flatInput.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(primaryEffectTarget(updated)).toMatchObject({
      requireBelow: { kind: 'flat', flatAmount: 40 },
    });
    host.remove();
  });

  it('R12g-g: ranger excludeRoles toggles in priority attackType draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = gameData.classRegistry.at_ranger!.combatModuleIds![0]!;
    selectClassAndModule(step, host, 'at_ranger', moduleId);

    const hostileModeSelect = Array.from(host.querySelectorAll('select')).find(
      (select) =>
        select
          .closest('.editor-field')
          ?.textContent?.includes('狙い方'),
    ) as HTMLSelectElement;
    expect(hostileModeSelect).toBeTruthy();
    hostileModeSelect.value = 'priority';
    hostileModeSelect.dispatchEvent(new Event('change'));
    step.refresh();

    const kindSelect = host.querySelector(
      '[data-field="target-spec-kind"]',
    ) as HTMLSelectElement;
    expect(kindSelect).toBeTruthy();
    kindSelect.value = 'attackType';
    kindSelect.dispatchEvent(new Event('change'));
    step.refresh();

    const supporterExclude = host.querySelector(
      '[data-field="target-spec-exclude-role-supporter"]',
    ) as HTMLInputElement;
    expect(supporterExclude).toBeTruthy();
    supporterExclude.checked = true;
    supporterExclude.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(primaryEffectTarget(updated)).toMatchObject({
      kind: 'attackType',
      excludeRoles: ['supporter'],
    });
    host.remove();
  });

  it('R12g-g: sorcerer chainCount edits draft', () => {
    const { gameData, draft, host, step } = mountEditor();
    const moduleId = moduleIdWithChainShape(gameData.combatModuleRegistry);
    selectClassAndModule(step, host, 'at_sorcerer', moduleId);

    const chainInput = host.querySelector(
      '[data-field="effect-target-chain-count"]',
    ) as HTMLInputElement;
    expect(chainInput).toBeTruthy();
    chainInput.value = '3';
    chainInput.dispatchEvent(new Event('change'));

    const updated = findCombatModuleDraft(draft(), moduleId);
    expect(updated?.action.targetShape).toBe('chain');
    expect(updated?.action.chainCount).toBe(3);
    host.remove();
  });
});
