import type {
  ActiveSkillDef,
  DamageType,
  Role,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from "../battle/types.ts";
import type { BattleCanvas } from "./BattleCanvas.ts";
import { resolveSkillAnimKey } from "./skillAnimRegistry.ts";
import { isParticleDefActive } from "./particlePlayback.ts";
import {
  isVfxDefActive,
  resolveEffectPresentation,
  type EffectPresentation,
} from "./skillVfx/resolveEffectPresentation.ts";
import { resolveVfxAnimKey } from "./vfxAnimRegistry.ts";
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
  skillId: string;
  effectIndex: number;
  hitIndex?: number;
  amount?: number;
  kind?: "damage" | "dot" | "heal";
  dotFlavor?: import("../battle/types.ts").DotFlavor;
  popupDedupeKey?: string;
  skipMainVfx?: boolean;
}

function buildVfxInstanceId(
  sourceId: string,
  targetId: string,
  skillId: string,
  effectIndex: number,
  hitIndex: number,
  kind: "main" | "hit",
): string {
  return `${sourceId}:${targetId}:${skillId}:${effectIndex}:${hitIndex}:${kind}:${performance.now()}`;
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

function resolveHitVfxForFeedback(
  presentation: EffectPresentation,
  options: {
    skillId: string;
    effectIndex: number;
    skipMainVfx: boolean;
  },
): SkillVfxDef | null {
  if (isVfxDefActive(presentation.hitVfx)) return presentation.hitVfx!;
  if (!isVfxDefActive(presentation.vfx)) return null;

  const mainPlayed =
    !options.skipMainVfx && isVfxDefActive(presentation.vfx);
  if (!mainPlayed) return presentation.vfx!;

  const mainVfxKey = resolveVfxAnimKey(
    options.skillId,
    options.effectIndex,
    "main",
  );
  if (!mainVfxKey && isParticleDefActive(presentation.vfx!.particles)) {
    return null;
  }
  return presentation.vfx!;
}

export function playSkillHitFeedback(
  canvas: Pick<
    BattleCanvas,
    "playSkillVfx" | "showDamagePopup" | "showHealPopup"
  >,
  request: SkillHitFeedbackRequest,
): void {
  const {
    sourceId,
    targetId,
    presentation,
    effect,
    skillId,
    effectIndex,
    amount,
    kind,
  } = request;
  const hitIndex = request.hitIndex ?? 0;
  const vfxOptions = { skillId, effectIndex };

  if (!request.skipMainVfx && isVfxDefActive(presentation.vfx)) {
    canvas.playSkillVfx(
      buildVfxInstanceId(
        sourceId,
        targetId,
        skillId,
        effectIndex,
        hitIndex,
        "main",
      ),
      sourceId,
      targetId,
      presentation.vfx,
      { ...vfxOptions, kind: "main" },
    );
  }

  const hitVfx = resolveHitVfxForFeedback(presentation, {
    skillId,
    effectIndex,
    skipMainVfx: request.skipMainVfx ?? false,
  });
  if (hitVfx) {
    canvas.playSkillVfx(
      buildVfxInstanceId(
        sourceId,
        targetId,
        skillId,
        effectIndex,
        hitIndex,
        "hit",
      ),
      sourceId,
      targetId,
      hitVfx,
      { ...vfxOptions, kind: "hit" },
    );
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
      kind === "dot" || effect.type === "dot"
        ? (request.dotFlavor ?? effect.dotFlavor)
        : undefined,
    );
  }
}
