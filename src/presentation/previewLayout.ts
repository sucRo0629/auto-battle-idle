import { getEffectTarget, targetSpecFaction } from '../battle/skills/targetSpec.ts';
import { resolveSkillRangePx } from '../battle/skills/rangeUtils.ts';
import type { CombatantState, SkillEffectDef } from '../battle/types.ts';
import type { PreviewEntity } from './presentationTimeline.ts';

export const PREVIEW_PLAYER_ANCHOR_X = 140;
export const PREVIEW_ENEMY_ANCHOR_X = 340;

export interface PreviewBattleLayout {
  actorX: number;
  targetX: number;
  rangePx: number;
}

export function resolvePreviewActorBattleX(actorIsEnemy: boolean): number {
  return actorIsEnemy ? PREVIEW_ENEMY_ANCHOR_X : PREVIEW_PLAYER_ANCHOR_X;
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
    reg: 0,
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
    return { actorX, targetX: actorX, rangePx };
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
