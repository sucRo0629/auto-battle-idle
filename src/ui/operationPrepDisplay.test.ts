import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import {
  buildCombatModuleBehaviorLines,
  buildCombatModulePrepViews,
} from './combatModulePrepDisplay.ts';
import {
  buildOperationPassiveCandidateView,
  buildOperationPassivePrepViews,
  resolveOperationPassiveAcquireState,
  statusLabelForAcquireState,
} from './operationPassivePrepDisplay.ts';

describe('combatModulePrepDisplay (R9.6-A)', () => {
  it('lists only class combatModuleIds with display name and behavior lines', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const preset = loaded.data.classRegistry.df_guardian;
    const views = buildCombatModulePrepViews(
      preset,
      loaded.data.combatModuleRegistry,
      undefined,
    );

    expect(views.candidates.map((c) => c.moduleId)).toEqual(
      preset.combatModuleIds,
    );
    for (const candidate of views.candidates) {
      expect(candidate.displayName).not.toBe(candidate.moduleId);
      expect(candidate.description.length).toBeGreaterThan(0);
      expect(candidate.behaviorLines.some((line) => line.startsWith('攻撃間隔')))
        .toBe(true);
      expect(candidate.behaviorLines.some((line) => line.startsWith('挙動')))
        .toBe(true);
    }
    expect(views.candidates.filter((c) => c.selected)).toHaveLength(1);
    expect(views.candidates.find((c) => c.selected)?.statusLabel).toBe(
      '選択中',
    );
  });

  it('builds behavior lines from module data without inventing fields', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const module =
      loaded.data.combatModuleRegistry.df_guardian_mod_nearest_strike;
    const lines = buildCombatModuleBehaviorLines(module);
    expect(lines[0]).toContain(String(module.attackIntervalSec));
    expect(lines.join('\n')).toContain('効果範囲');
  });
});

describe('operationPassivePrepDisplay (R9.6-B)', () => {
  it('exposes cost, target, amount, duration, and text status labels', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const def = loaded.data.skillRegistry.passives.df_guardian_passive_2;
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
      candidateIds: ['df_guardian_passive_2'],
      acquiredIds: [],
      acquireCost: 1,
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
      acquireCost: 1,
      currentResource: 0,
      getPassiveDef: () => undefined,
    });
    expect(views.emptyStateLabel).toBe('候補なし');
  });
});
