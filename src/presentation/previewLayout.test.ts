import { describe, expect, it } from 'vitest';
import type { SkillEffectDef } from '../battle/types.ts';
import {
  PREVIEW_ENEMY_ANCHOR_X,
  PREVIEW_PLAYER_ANCHOR_X,
  resolvePreviewBattleLayout,
  resolvePreviewBattleLayoutFallback,
  resolvePreviewTargetBattleX,
} from './previewLayout.ts';
import type { PreviewEntity } from './presentationTimeline.ts';

const allyActor: PreviewEntity = {
  entityId: 'at_ranger',
  role: 'attacker',
  rangePx: 100,
  damageType: 'physical',
  basicAttackVfx: { enabled: true },
  isEnemy: false,
};

const enemyActor: PreviewEntity = {
  entityId: 'stage1_1',
  rangePx: 0,
  damageType: 'physical',
  basicAttackVfx: { enabled: true },
  isEnemy: true,
};

const damageEffect = (
  range?: number,
): SkillEffectDef => ({
  type: 'damage',
  target: { rule: 'frontEnemy' },
  amount: { kind: 'atkScale', scale: 1 },
  ...(range !== undefined ? { range } : {}),
});

describe('resolvePreviewTargetBattleX', () => {
  it('places ally target to the right by rangePx', () => {
    expect(
      resolvePreviewTargetBattleX(PREVIEW_PLAYER_ANCHOR_X, 100, false),
    ).toBe(240);
  });

  it('places enemy target to the left by rangePx', () => {
    expect(
      resolvePreviewTargetBattleX(PREVIEW_ENEMY_ANCHOR_X, 100, true),
    ).toBe(240);
  });
});

describe('resolvePreviewBattleLayout', () => {
  it('uses effect range for ally preview', () => {
    const layout = resolvePreviewBattleLayout(allyActor, damageEffect(50));
    expect(layout).toEqual({
      actorX: PREVIEW_PLAYER_ANCHOR_X,
      targetX: PREVIEW_PLAYER_ANCHOR_X + 50,
      rangePx: 50,
    });
  });

  it('falls back to traits.rangePx when effect range omitted', () => {
    const layout = resolvePreviewBattleLayout(allyActor, damageEffect());
    expect(layout.targetX).toBe(PREVIEW_PLAYER_ANCHOR_X + 100);
    expect(layout.rangePx).toBe(100);
  });

  it('places melee ally target at contact', () => {
    const layout = resolvePreviewBattleLayout(
      { ...allyActor, rangePx: 0 },
      damageEffect(),
    );
    expect(layout).toEqual({
      actorX: PREVIEW_PLAYER_ANCHOR_X,
      targetX: PREVIEW_PLAYER_ANCHOR_X,
      rangePx: 0,
    });
  });

  it('places enemy actor on the right with target on the left', () => {
    const layout = resolvePreviewBattleLayout(
      { ...enemyActor, rangePx: 80 },
      damageEffect(),
    );
    expect(layout).toEqual({
      actorX: PREVIEW_ENEMY_ANCHOR_X,
      targetX: PREVIEW_ENEMY_ANCHOR_X - 80,
      rangePx: 80,
    });
  });

  it('overlaps actor and target for self-target effects', () => {
    const layout = resolvePreviewBattleLayout(allyActor, {
      type: 'heal',
      target: { kind: 'self' },
      amount: { kind: 'atkScale', scale: 0.5 },
    });
    expect(layout.targetX).toBe(layout.actorX);
  });
});

describe('resolvePreviewBattleLayoutFallback', () => {
  it('uses actor traits.rangePx when no effect is selected', () => {
    const layout = resolvePreviewBattleLayoutFallback(allyActor);
    expect(layout.targetX).toBe(PREVIEW_PLAYER_ANCHOR_X + 100);
  });
});
