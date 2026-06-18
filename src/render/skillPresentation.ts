import type {
  ActiveSkillDef,
  DamageType,
  Role,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from "../battle/types.ts";
import type { AttackEffectSpawnOptions } from "./AttackEffect.ts";
import type { BattleCanvas } from "./BattleCanvas.ts";
import { resolveSkillAnimKey } from "./skillAnimRegistry.ts";
import {
  resolveEffectPresentation,
  type EffectPresentation,
} from "./skillVfx/resolveEffectPresentation.ts";
import type { SkillVfxContext } from "./skillVfx/types.ts";
import {
  resolveSkillAnimHoldSec,
  resolveSkillBodyAnimFields,
  toSkillAnimPlaybackOptions,
} from "./skillAnimPlayback.ts";

export interface SkillPresentationActor {
  role?: Role;
  rangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
  spriteKey?: string;
}

export interface SkillBodyPlaybackOptions {
  restartIfPlaying?: boolean;
}

export interface SkillHitFeedbackRequest {
  sourceId: string;
  targetId: string;
  presentation: EffectPresentation;
  effect: SkillEffectDef;
  amount?: number;
  kind?: "damage" | "dot" | "heal";
  popupDedupeKey?: string;
  skipMainVfx?: boolean;
  vfxOptions?: AttackEffectSpawnOptions;
}

const DAMAGE_POPUP_DEDUPE_WINDOW_MS = 50;
const recentDamagePopupTimes = new Map<string, number>();

function effectKindForPresentation(effect: SkillEffectDef): SkillVfxContext["effectKind"] {
  return effect.type === "move" ? "move" : effect.type;
}

export function buildSkillPresentationContext(
  actor: SkillPresentationActor | undefined,
  slotKind: SkillSlotKind,
  effect: SkillEffectDef,
  skillId: string,
  effectIndex: number,
): SkillVfxContext {
  return {
    role: actor?.role,
    rangePx: actor?.rangePx ?? 0,
    damageType: actor?.damageType ?? "physical",
    basicAttackVfx: actor?.basicAttackVfx,
    slotKind,
    effectKind: effectKindForPresentation(effect),
    targetShape: effect.targetShape,
    effectVfxOnly: true,
    skillId,
    effectIndex,
  };
}

export function resolveSkillPresentation(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  ctx: SkillVfxContext,
): EffectPresentation {
  return resolveEffectPresentation(effect, skill, {
    ...ctx,
    effectVfxOnly: ctx.effectVfxOnly ?? true,
  });
}

export function playSkillBody(
  canvas: Pick<
    BattleCanvas,
    "isSkillAnimActive" | "playSkillAnim" | "playAnim"
  >,
  actorId: string,
  skill: ActiveSkillDef,
  effectIndex: number,
  actor: SkillPresentationActor | undefined,
  slotKind: SkillSlotKind,
  options?: SkillBodyPlaybackOptions,
): EffectPresentation | null {
  const effect = skill.effect[effectIndex];
  if (!effect) return null;

  const presentation = resolveSkillPresentation(
    skill,
    effect,
    buildSkillPresentationContext(actor, slotKind, effect, skill.id, effectIndex),
  );
  const skillAnimKey = resolveSkillAnimKey(skill.id, effectIndex);
  if (skillAnimKey) {
    if (
      options?.restartIfPlaying !== true &&
      canvas.isSkillAnimActive(actorId, skillAnimKey)
    ) {
      return presentation;
    }
    const holdSec = actor ? resolveSkillAnimHoldSec(skill, actor, slotKind) : 0;
    canvas.playSkillAnim(
      actorId,
      skillAnimKey,
      toSkillAnimPlaybackOptions(
        resolveSkillBodyAnimFields(skill, effectIndex),
        holdSec,
      ),
    );
    return presentation;
  }

  if (presentation.anim && slotKind !== "basic") {
    canvas.playAnim(actorId, presentation.anim, actor?.spriteKey);
  }

  return presentation;
}

export function playSkillHitFeedback(
  canvas: Pick<
    BattleCanvas,
    "playAttackEffect" | "showDamagePopup" | "showHealPopup"
  >,
  request: SkillHitFeedbackRequest,
): void {
  const { sourceId, targetId, presentation, effect, amount, kind, vfxOptions } =
    request;

  if (!request.skipMainVfx && presentation.vfx) {
    canvas.playAttackEffect(sourceId, targetId, presentation.vfx, vfxOptions);
  }
  if (presentation.hitVfx) {
    canvas.playAttackEffect(sourceId, targetId, presentation.hitVfx, vfxOptions);
  }

  if (amount === undefined) return;

  if (kind === "heal" || effect.type === "heal") {
    canvas.showHealPopup(targetId, amount);
    return;
  }

  if (effect.type === "damage" || effect.type === "dot") {
    if (request.popupDedupeKey) {
      const now = performance.now();
      for (const [key, lastShownAt] of recentDamagePopupTimes) {
        if (now - lastShownAt > DAMAGE_POPUP_DEDUPE_WINDOW_MS) {
          recentDamagePopupTimes.delete(key);
        }
      }
      const lastShownAt = recentDamagePopupTimes.get(request.popupDedupeKey);
      if (
        lastShownAt !== undefined &&
        now - lastShownAt <= DAMAGE_POPUP_DEDUPE_WINDOW_MS
      ) {
        return;
      }
      recentDamagePopupTimes.set(request.popupDedupeKey, now);
    }
    canvas.showDamagePopup(
      targetId,
      amount,
      kind === "dot" || effect.type === "dot" ? "dot" : "damage",
    );
  }
}
