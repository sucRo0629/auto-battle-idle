import type { ActiveSkillDef, SkillSlotKind } from '../battle/types.ts';
import { BattleCanvas } from '../render/BattleCanvas.ts';
import { battleCanvasHeight, groundY } from '../render/formationLayout.ts';
import type { CombatantLayout } from '../render/IBattleRenderer.ts';
import { resolveSkillAnimKey } from '../render/skillAnimRegistry.ts';
import {
  resolveSkillAnimHoldSec,
  resolveEffectApplyDelaySec,
  toSkillAnimPlaybackOptions,
} from '../render/skillAnimPlayback.ts';
import { resolveEffectPresentation } from '../render/skillVfx/resolveEffectPresentation.ts';
import {
  PREVIEW_ENEMY_ANCHOR_X,
  PREVIEW_PLAYER_ANCHOR_X,
  type PreviewBattleLayout,
} from './previewLayout.ts';
import {
  buildSkillVfxContext,
  computePresentationTimeline,
  type PresentationTimeline,
  type PreviewEntity,
} from './presentationTimeline.ts';

export type { PreviewEntity } from './presentationTimeline.ts';

const PREVIEW_ACTOR_ID = 'preview_actor';
const PREVIEW_TARGET_ID = 'preview_target';
const DEFAULT_PREVIEW_LAYOUT: PreviewBattleLayout = {
  actorX: PREVIEW_PLAYER_ANCHOR_X,
  targetX: PREVIEW_ENEMY_ANCHOR_X,
  rangePx: PREVIEW_ENEMY_ANCHOR_X - PREVIEW_PLAYER_ANCHOR_X,
};
const SPRITE_SCALE = 1;

function resolvePreviewSlotKind(
  skillId: string,
  entityId: string,
): SkillSlotKind {
  return skillId.trim() === `${entityId.trim()}_basic_attack` ? 'basic' : 'active';
}

export interface PreviewPlayRequest {
  skill: ActiveSkillDef;
  effectIndex: number;
  actor: PreviewEntity;
  target: PreviewEntity;
  slotKind?: SkillSlotKind;
}

export class PresentationPreviewRunner {
  private canvas: BattleCanvas;
  private rafId: number | null = null;
  private lastTs = 0;
  private applyDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly groundY: number;
  private actor: PreviewEntity | null = null;
  private target: PreviewEntity | null = null;
  private layout: PreviewBattleLayout = DEFAULT_PREVIEW_LAYOUT;

  constructor(private readonly host: HTMLElement) {
    this.groundY = groundY(battleCanvasHeight(SPRITE_SCALE), SPRITE_SCALE);
    this.canvas = this.mountCanvas();
  }

  private mountCanvas(): BattleCanvas {
    const canvas = new BattleCanvas();
    canvas.mount(this.host);
    return canvas;
  }

  setEntities(
    actor: PreviewEntity,
    target: PreviewEntity,
    layout: PreviewBattleLayout,
  ): void {
    this.actor = actor;
    this.target = target;
    this.layout = layout;
    this.applyIdleLayouts();
  }

  getTimeline(
    skill: ActiveSkillDef,
    effectIndex: number,
    slotKind: SkillSlotKind,
  ): PresentationTimeline {
    const actor = this.actor;
    if (!actor) {
      return computePresentationTimeline(
        skill,
        effectIndex,
        {
          entityId: 'unknown',
          rangePx: 0,
          damageType: 'physical',
          isEnemy: false,
        },
        slotKind,
      );
    }
    return computePresentationTimeline(skill, effectIndex, actor, slotKind);
  }

  play(request: PreviewPlayRequest): void {
    const actor = this.actor;
    const target = this.target;
    if (!actor || !target) return;

    const effect = request.skill.effect[request.effectIndex];
    if (!effect) return;

    const slotKind =
      request.slotKind ??
      resolvePreviewSlotKind(request.skill.id, actor.entityId);

    this.resetCanvas();
    this.applyIdleLayouts();

    const ctx = buildSkillVfxContext(actor, slotKind, effect);
    const presentation = resolveEffectPresentation(
      request.skill.id,
      effect,
      request.skill,
      ctx,
    );
    const skillAnimKey = resolveSkillAnimKey(
      request.skill.id,
      request.effectIndex,
    );

    if (skillAnimKey) {
      const holdSec = resolveSkillAnimHoldSec(request.skill, actor, slotKind);
      this.canvas.playSkillAnim(
        PREVIEW_ACTOR_ID,
        skillAnimKey,
        toSkillAnimPlaybackOptions(effect, holdSec),
      );
    } else if (presentation.anim && slotKind !== 'basic') {
      this.canvas.playAnim(
        PREVIEW_ACTOR_ID,
        presentation.anim,
        actor.entityId,
      );
    }

    const applyDelaySec = resolveEffectApplyDelaySec(
      request.skill.id,
      request.effectIndex,
      effect,
    );
    const spawnHitEffects = (): void => {
      if (presentation.vfx) {
        this.canvas.playAttackEffect(
          PREVIEW_ACTOR_ID,
          PREVIEW_TARGET_ID,
          presentation.vfx,
        );
      }
      if (presentation.hitVfx) {
        this.canvas.playAttackEffect(
          PREVIEW_ACTOR_ID,
          PREVIEW_TARGET_ID,
          presentation.hitVfx,
        );
      }
      if (effect.type === 'damage' || effect.type === 'dot') {
        this.canvas.showDamagePopup(PREVIEW_TARGET_ID, 99, 'damage');
      } else if (effect.type === 'heal') {
        this.canvas.showHealPopup(PREVIEW_TARGET_ID, 99);
      }
    };

    if (applyDelaySec > 0) {
      this.clearApplyDelayTimeout();
      this.applyDelayTimeoutId = setTimeout(
        spawnHitEffects,
        Math.round(applyDelaySec * 1000),
      );
    } else {
      spawnHitEffects();
    }
  }

  reset(): void {
    this.clearApplyDelayTimeout();
    this.resetCanvas();
    this.applyIdleLayouts();
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTs = performance.now();
    const loop = (now: number): void => {
      const deltaMs = Math.min(now - this.lastTs, 100);
      this.lastTs = now;
      this.canvas.tick(deltaMs);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  destroy(): void {
    this.clearApplyDelayTimeout();
    this.stop();
    this.canvas.destroy();
  }

  private clearApplyDelayTimeout(): void {
    if (this.applyDelayTimeoutId === null) return;
    clearTimeout(this.applyDelayTimeoutId);
    this.applyDelayTimeoutId = null;
  }

  private resetCanvas(): void {
    this.canvas.destroy();
    this.canvas = this.mountCanvas();
  }

  private applyIdleLayouts(): void {
    const actor = this.actor;
    const target = this.target;
    if (!actor || !target) return;
    this.canvas.setCombatants([
      this.toLayout(PREVIEW_ACTOR_ID, actor, this.layout.actorX),
      this.toLayout(PREVIEW_TARGET_ID, target, this.layout.targetX),
    ]);
  }

  private toLayout(
    id: string,
    entity: PreviewEntity,
    x: number,
  ): CombatantLayout {
    return {
      id,
      x,
      y: this.groundY,
      spriteKey: entity.entityId,
      hp: 100,
      maxHp: 100,
      barrierHp: 0,
      atk: 10,
      def: 5,
      reg: 0,
      role: entity.role,
      isEnemy: entity.isEnemy,
      isAlive: true,
      anim: 'idle',
      animFrame: 0,
      attackSheetKey: entity.entityId,
      skillAnimKey: null,
      skillAnimFrame: 0,
      statusEffects: [],
    };
  }
}
