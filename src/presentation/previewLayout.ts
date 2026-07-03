import { CANVAS_W } from '../battle/battleConstants.ts';
import { getEffectTarget, targetSpecFaction } from '../battle/skills/targetSpec.ts';
import { resolveSkillRangePx } from '../battle/skills/rangeUtils.ts';
import type { CombatantState, SkillEffectDef } from '../battle/types.ts';
import type { PreviewEntity } from './presentationTimeline.ts';

/** BattleCanvas と同幅の中央。プレビュー 2 体配置の基準。 */
export const PREVIEW_BATTLE_CENTER_X = CANVAS_W / 2;

/**
 * 演出ラボ host の content box に収まる 1:1 表示サイズ（padding 12px ×2 を除いた 928×452 想定）。
 * BattleCanvas 本体は触らず、マウント後に buffer をこのサイズへ切り詰める。
 */
export const PREVIEW_CANVAS_W = 904;
export const PREVIEW_CANVAS_H = 428;

/** 既定の actor–target 間隔（旧 140 / 340 の差分） */
export const PREVIEW_DEFAULT_RANGE_PX = 200;

export const PREVIEW_PLAYER_ANCHOR_X =
  PREVIEW_BATTLE_CENTER_X - PREVIEW_DEFAULT_RANGE_PX / 2;
export const PREVIEW_ENEMY_ANCHOR_X =
  PREVIEW_BATTLE_CENTER_X + PREVIEW_DEFAULT_RANGE_PX / 2;

export interface PreviewBattleLayout {
  actorX: number;
  targetX: number;
  rangePx: number;
}

export function resolvePreviewActorBattleX(actorIsEnemy: boolean): number {
  return actorIsEnemy ? PREVIEW_ENEMY_ANCHOR_X : PREVIEW_PLAYER_ANCHOR_X;
}

/** プレビュー canvas 左端の battle 世界 X（中央フォーカス）。 */
export function resolvePreviewCameraOriginX(): number {
  return PREVIEW_BATTLE_CENTER_X - PREVIEW_CANVAS_W / 2;
}

/** battle 世界 X → プレビュー canvas 座標（1 canvas px = 1 CSS px）。 */
export function toPreviewCanvasX(worldX: number): number {
  return worldX - resolvePreviewCameraOriginX();
}

export function resolvePreviewTargetBattleX(
  actorX: number,
  rangePx: number,
  actorIsEnemy: boolean,
): number {
  return actorIsEnemy ? actorX - rangePx : actorX + rangePx;
}

function previewEntityToActorStub(entity: PreviewEntity): CombatantState {
  return {
    id: 'preview_actor',
    name: 'preview',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    isEnemy: entity.isEnemy,
    role: entity.role ?? 'attacker',
    classId: entity.entityId,
    formationRow: 'front',
    traits: {
      rangePx: entity.rangePx,
      damageType: entity.damageType,
      basicAttackVfx: entity.basicAttackVfx,
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: entity.entityId,
    iconKey: entity.entityId,
    battleX: resolvePreviewActorBattleX(entity.isEnemy),
    partySlotIndex: 0,
  };
}

export function resolvePreviewSkillRangePx(
  actor: PreviewEntity,
  effect: SkillEffectDef,
): number {
  return resolveSkillRangePx(previewEntityToActorStub(actor), effect);
}

export function isPreviewSelfTarget(
  actor: PreviewEntity,
  effect: SkillEffectDef,
): boolean {
  const spec = getEffectTarget(effect);
  return targetSpecFaction(spec, previewEntityToActorStub(actor)) === 'self';
}

export function resolvePreviewBattleLayout(
  actor: PreviewEntity,
  effect: SkillEffectDef,
): PreviewBattleLayout {
  const actorX = resolvePreviewActorBattleX(actor.isEnemy);
  const rangePx = resolvePreviewSkillRangePx(actor, effect);
  if (isPreviewSelfTarget(actor, effect)) {
    return {
      actorX: PREVIEW_BATTLE_CENTER_X,
      targetX: PREVIEW_BATTLE_CENTER_X,
      rangePx,
    };
  }
  return {
    actorX,
    targetX: resolvePreviewTargetBattleX(actorX, rangePx, actor.isEnemy),
    rangePx,
  };
}

export function resolvePreviewBattleLayoutFallback(
  actor: PreviewEntity,
): PreviewBattleLayout {
  const actorX = resolvePreviewActorBattleX(actor.isEnemy);
  const rangePx = actor.rangePx;
  return {
    actorX,
    targetX: resolvePreviewTargetBattleX(actorX, rangePx, actor.isEnemy),
    rangePx,
  };
}
