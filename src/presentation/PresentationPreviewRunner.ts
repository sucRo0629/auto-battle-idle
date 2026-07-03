import type { ActiveSkillDef, SkillSlotKind } from '../battle/types.ts';
import { BattleCanvas } from '../render/BattleCanvas.ts';
import { BATTLE_FIELD_SPRITE_SCALE, groundY } from '../render/formationLayout.ts';
import type { CombatantLayout } from '../render/IBattleRenderer.ts';
import { resolveEffectApplyDelaySec } from '../render/skillAnimPlayback.ts';
import {
  PREVIEW_CANVAS_H,
  PREVIEW_CANVAS_W,
  PREVIEW_ENEMY_ANCHOR_X,
  PREVIEW_PLAYER_ANCHOR_X,
  resolvePreviewCameraOriginX,
  toPreviewCanvasX,
  type PreviewBattleLayout,
} from './previewLayout.ts';
import {
  computePresentationTimeline,
  type PresentationTimeline,
  type PreviewEntity,
} from './presentationTimeline.ts';
import {
  buildSkillPresentationContext,
  playSkillBody,
  playSkillHitFeedback,
  resolveSkillPresentation,
} from '../render/skillPresentation.ts';

export type { PreviewEntity } from './presentationTimeline.ts';

const PREVIEW_ACTOR_ID = 'preview_actor';
const PREVIEW_TARGET_ID = 'preview_target';
const DEFAULT_PREVIEW_LAYOUT: PreviewBattleLayout = {
  actorX: PREVIEW_PLAYER_ANCHOR_X,
  targetX: PREVIEW_ENEMY_ANCHOR_X,
  rangePx: PREVIEW_ENEMY_ANCHOR_X - PREVIEW_PLAYER_ANCHOR_X,
};
const SPRITE_SCALE = BATTLE_FIELD_SPRITE_SCALE;

function resolvePreviewSlotKind(
  skillId: string,
  entityId: string,
): SkillSlotKind {
  return skillId.trim() === `${entityId.trim()}_basic_attack` ? 'basic' : 'active';
}

export type PreviewPlayMode = 'full' | 'body' | 'vfx';

export interface PreviewPlayRequest {
  skill: ActiveSkillDef;
  effectIndex: number;
  actor: PreviewEntity;
  target: PreviewEntity;
  slotKind?: SkillSlotKind;
  mode?: PreviewPlayMode;
}

export class PresentationPreviewRunner {
  private canvas: BattleCanvas;
  private rafId: number | null = null;
  private lastTs = 0;
  private applyDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private actor: PreviewEntity | null = null;
  private target: PreviewEntity | null = null;
  private layout: PreviewBattleLayout = DEFAULT_PREVIEW_LAYOUT;

  constructor(private readonly host: HTMLElement) {
    this.canvas = this.mountCanvas();
  }

  private get previewGroundY(): number {
    return groundY(PREVIEW_CANVAS_H, SPRITE_SCALE);
  }

  private mountCanvas(): BattleCanvas {
    const canvas = new BattleCanvas();
    canvas.mount(this.host);
    this.applyPreviewCanvasViewport(canvas);
    return canvas;
  }

  /** 演出ラボ専用: host 内 1:1 表示 + 中央フォーカスの切り詰め viewport。 */
  private applyPreviewCanvasViewport(canvas: BattleCanvas): void {
    const el = this.host.querySelector('.battle-canvas');
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error('.battle-canvas not found in presentation-lab host');
    }
    el.classList.add('presentation-lab-preview-canvas');
    el.width = PREVIEW_CANVAS_W;
    el.height = PREVIEW_CANVAS_H;
    el.style.width = `${PREVIEW_CANVAS_W}px`;
    el.style.height = `${PREVIEW_CANVAS_H}px`;
    applyPresentationLabNearestNeighborContext(el);
    canvas.setWorldOffset(resolvePreviewCameraOriginX());
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
    const mode = request.mode ?? 'full';

    this.resetCanvas();
    this.applyIdleLayouts();

    const presentation = resolveSkillPresentation(
      request.skill,
      effect,
      buildSkillPresentationContext(
        actor,
        slotKind,
        effect,
        request.skill.id,
        request.effectIndex,
      ),
    );

    if (mode !== 'vfx') {
      playSkillBody(
        this.canvas,
        PREVIEW_ACTOR_ID,
        request.skill,
        request.effectIndex,
        actor,
        slotKind,
      );
    }

    if (mode === 'body') return;

    const applyDelaySec = resolveEffectApplyDelaySec(
      request.skill.id,
      request.effectIndex,
      effect,
    );
    const spawnHitEffects = (): void => {
      playSkillHitFeedback(this.canvas, {
        sourceId: PREVIEW_ACTOR_ID,
        targetId: PREVIEW_TARGET_ID,
        presentation,
        effect,
        skillId: request.skill.id,
        effectIndex: request.effectIndex,
        amount:
          effect.type === 'damage' || effect.type === 'dot' || effect.type === 'heal'
            ? 99
            : undefined,
        kind:
          effect.type === 'damage'
            ? 'damage'
            : effect.type === 'dot'
              ? 'dot'
              : effect.type === 'heal'
                ? 'heal'
                : undefined,
      });
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
      this.toLayout(PREVIEW_ACTOR_ID, actor, toPreviewCanvasX(this.layout.actorX)),
      this.toLayout(PREVIEW_TARGET_ID, target, toPreviewCanvasX(this.layout.targetX)),
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
      y: this.previewGroundY,
      spriteKey: entity.entityId,
      hp: 100,
      maxHp: 100,
      barrierHp: 0,
      baseMaxHp: 100,
      atk: 10,
      def: 5,
      res: 0,
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

/** canvas.width/height 変更で context がリセットされるため、描画直前に再適用する。 */
function applyPresentationLabNearestNeighborContext(
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }
  ctx.imageSmoothingEnabled = false;
}
