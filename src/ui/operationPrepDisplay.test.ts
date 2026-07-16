import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import {
  buildCombatModuleDiffSummary,
  buildCombatModulePrepViews,
} from './combatModulePrepDisplay.ts';
import {
  buildOperationPassiveCandidateView,
  buildOperationPassivePrepViews,
  resolveOperationPassiveAcquireState,
  statusLabelForAcquireState,
} from './operationPassivePrepDisplay.ts';

describe('combatModulePrepDisplay (R9.6-A)', () => {
  it('lists only class combatModuleIds with interval and effect summary', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const preset = loaded.data.classRegistry.df_guardian;
    const views = buildCombatModulePrepViews(
      preset,
      loaded.data.combatModuleRegistry,
      undefined,
      { passives: loaded.data.skillRegistry.passives },
    );

    expect(views.candidates.map((c) => c.moduleId)).toEqual(
      preset.combatModuleIds,
    );
    for (const candidate of views.candidates) {
      expect(candidate.displayName).not.toBe(candidate.moduleId);
      expect(candidate.attackIntervalText).toMatch(/^攻撃間隔 /);
      expect(candidate.effectSummary.length).toBeGreaterThan(0);
      expect(candidate.effectSummary.startsWith('効果')).toBe(false);
      expect(candidate.effectSummary).not.toContain('再使用');
      expect(candidate.effectSummary).not.toContain('攻撃手段');
      expect(candidate.effectSummary).not.toContain('効果範囲');
      expect(candidate.effectSummary).not.toContain('プレースホルダー');
      expect(candidate.effectSummary).not.toContain('最近傍');
      expect(candidate.effectSummary).not.toContain('単体物理攻撃');
    }
    expect(views.candidates.filter((c) => c.selected)).toHaveLength(1);
    expect(views.candidates.find((c) => c.selected)?.statusLabel).toBe(
      '選択中',
    );
  });

  it('omits default hostile target and keeps mechanical effect text', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const module =
      loaded.data.combatModuleRegistry.df_guardian_mod_nearest_strike;
    const summary = buildCombatModuleDiffSummary(module);
    expect(summary.attackIntervalText).toContain(
      String(module.attackIntervalSec),
    );
    expect(summary.effectSummary).toContain('近接');
    expect(summary.effectSummary).toContain('単体');
    expect(summary.effectSummary).toContain('攻撃力の100%のダメージ');
    expect(summary.effectSummary).not.toContain('最近傍');
    expect(summary.effectSummary).not.toContain('再使用');
  });

  it('weaves class priority target into the atk-based damage sentence', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const preset = loaded.data.classRegistry.at_swordsman;
    const views = buildCombatModulePrepViews(
      preset,
      loaded.data.combatModuleRegistry,
      undefined,
      { passives: loaded.data.skillRegistry.passives },
    );
    const single = views.candidates.find(
      (c) => c.moduleId === 'at_swordsman_mod_single_slash',
    );
    expect(single?.effectSummary).toContain(
      '最も防御力が高い敵に攻撃力の100%の物理ダメージ',
    );
    expect(single?.effectSummary).not.toContain('最近傍');

    const frontlineSplit = views.candidates.find(
      (c) => c.moduleId === 'at_swordsman_mod_pierce_slash',
    );
    expect(frontlineSplit?.effectSummary).toContain(
      '最も防御力が高い敵に攻撃力の55%の物理ダメージ',
    );
    expect(frontlineSplit?.effectSummary).toContain('マルチロック');
    expect(frontlineSplit?.effectSummary).not.toContain('貫通');
  });

  it('merges range and attack method without duplicating shape already in effect text', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const twin = loaded.data.combatModuleRegistry.at_sorcerer_mod_twin_bolt;
    const twinSummary = buildCombatModuleDiffSummary(twin);
    expect(twinSummary.effectSummary).toContain('遠隔');
    expect(twinSummary.effectSummary).toContain('マルチロック 2');
    expect(twinSummary.effectSummary).not.toContain(
      'マルチロック（複数対象・同一可）',
    );
    expect(twinSummary.effectSummary).not.toMatch(/Hit 2/);
  });
});

describe('operationPassivePrepDisplay (R9.6-B)', () => {
  it('exposes cost, target, amount, duration, and text status labels', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const def = loaded.data.skillRegistry.passives.df_guardian_op_wall_aura;
    expect(def).toBeTruthy();

    const view = buildOperationPassiveCandidateView(def!, {
      acquireCost: 1,
      currentResource: 1,
      acquired: false,
      isCandidate: true,
    });

    expect(view.displayName).toBe(def!.name);
    expect(view.acquireCost).toBe(1);
    expect(view.effectDescription.length).toBeGreaterThan(0);
    expect(view.effectTarget).toBe('自身');
    expect(view.effectAmount).toContain('DEF');
    expect(view.durationScope).toBe('作戦終了まで維持');
    expect(view.statusLabel).toBe('未取得・取得可能');
    expect(view.canAcquire).toBe(true);
  });

  it('labels insufficient resource with reason text (not color-only)', () => {
    expect(
      statusLabelForAcquireState(
        resolveOperationPassiveAcquireState({
          acquired: false,
          isCandidate: true,
          currentResource: 0,
          acquireCost: 1,
        }),
      ),
    ).toBe('未取得・リソース不足');

    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const views = buildOperationPassivePrepViews({
      candidateIds: ['df_guardian_op_wall_aura'],
      acquiredIds: [],
      getAcquireCost: () => 1,
      currentResource: 0,
      getPassiveDef: (id) => loaded.data.skillRegistry.passives[id],
    });
    expect(views.candidates[0]?.unavailableReason).toContain('リソース不足');
    expect(views.candidates[0]?.canAcquire).toBe(false);
  });

  it('shows empty candidate state', () => {
    const views = buildOperationPassivePrepViews({
      candidateIds: [],
      acquiredIds: [],
      getAcquireCost: () => 1,
      currentResource: 0,
      getPassiveDef: () => undefined,
    });
    expect(views.emptyStateLabel).toBe('候補なし');
  });
});
