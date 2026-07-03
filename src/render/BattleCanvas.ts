import type { BattleSnapshot, SkillVfxDef } from "../battle/types.ts";
import { BuffGlowManager, drawSpriteWithBuffGlow } from "./buffGlowEffect.ts";
import {
  getPlaceholderSpriteYOffset,
  beginDeathPlaceholder,
  clearDeathPlaceholder,
  getDeathPlaceholderTransform,
} from "./placeholderSpriteAnim.ts";
import { hasEntityAnimSheet } from "./spriteFrameDraw.ts";
import {
  drawSkillAnimAtFootAnchor,
  drawSpriteFrameAtFootAnchor,
} from "./spriteFrameDraw.ts";
import {
  getSheetCellSize,
  SPRITE_LAYOUT_SIZE,
} from "./spriteLayout.ts";
import { SpriteAnimator } from "./SpriteAnimator.ts";
import type { SkillAnimPlaybackOptions } from "./skillAnimPlayback.ts";
import {
  BATTLE_ALLY_MARCH_VISIBLE_MIN_X,
  BATTLE_ENEMY_MARCH_VISIBLE_MAX_X,
  CANVAS_W,
} from "../battle/battleConstants.ts";
import {
  BATTLE_FIELD_SPRITE_SCALE,
  groundY,
  groundLineY,
  battleCanvasHeight,
} from "./formationLayout.ts";
import { VfxPlaybackManager } from "./VfxPlaybackManager.ts";
import { ParticlePlaybackManager } from "./ParticlePlaybackManager.ts";
import { resolveVfxAnimKey } from "./vfxAnimRegistry.ts";
import {
  resolveVfxLayer,
  resolveVfxPlacement,
  toVfxPlaybackOptions,
} from "./vfxAnimPlayback.ts";
import { isParticleDefActive } from "./particlePlayback.ts";
import { getParticlePresetDef } from "./particlePresets.ts";
import { resolveVfxWorldPosition } from "./vfxPlacement.ts";
import { CombatReactionPopupManager } from "./CombatReactionPopup.ts";
import { DamagePopupManager } from "./DamagePopup.ts";
import type {
  AnimState,
  CombatantLayout,
  IBattleRenderer,
  type PlaySkillVfxOptions,
} from "./IBattleRenderer.ts";
import {
  readBattleHudTheme,
  resolveSpritePlaceholderColor,
  type BattleHudTheme,
} from "./battleHudTheme.ts";
import { VictoryOverlay } from "./VictoryOverlay.ts";
import { WaveOverlay } from "./WaveOverlay.ts";
import { DeathPlaybackManager } from "./deathPlayback.ts";
import { drawBattleFieldBackground } from "./battleFieldBackground.ts";
import { pickCombatantAtCanvasPoint } from "./battleCanvasHitTest.ts";
import {
  drawHoverHighlightForLayout,
  drawTargetIndicatorForLayout,
} from "./battleFieldIndicatorDraw.ts";
import { sortForSpriteDrawPass } from "./spriteDrawOrder.ts";
import {
  applyVisualDepthOffsets,
  spriteDrawY,
} from "./spriteVisualDepth.ts";

const CANVAS_H = battleCanvasHeight(BATTLE_FIELD_SPRITE_SCALE);
const SPRITE_SIZE = SPRITE_LAYOUT_SIZE;
const SPRITE_SCALE = BATTLE_FIELD_SPRITE_SCALE;

export class BattleCanvas implements IBattleRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animator = new SpriteAnimator();
  private vfxPlayback = new VfxPlaybackManager();
  private particlePlayback = new ParticlePlaybackManager();
  private damagePopups = new DamagePopupManager();
  private combatReactionPopups = new CombatReactionPopupManager();
  private buffGlows = new BuffGlowManager();
  private deathPlayback = new DeathPlaybackManager();
  private victoryOverlay = new VictoryOverlay();
  private waveOverlay = new WaveOverlay();
  private waveAnnouncementWaveIndex = 0;
  private waveAnnouncementElapsedMs = 0;
  private layouts: CombatantLayout[] = [];
  private theme!: BattleHudTheme;
  private worldOffsetX = 0;
  private isMarching = new Map<string, boolean>();
  private marchIdleHoldFrames = new Map<string, number>();
  private static readonly MARCH_IDLE_HOLD_FRAMES = 4;
  private hoverHighlightUnitIds: ReadonlySet<string> = new Set();
  private targetIndicatorUnitIds = new Set<string>();
  private onFieldHoverChange: ((unitId: string | null) => void) | null = null;

  private readonly handleCanvasPointerMove = (event: MouseEvent): void => {
    if (!this.onFieldHoverChange) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const canvasX =
      ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const canvasY =
      ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    const hit = pickCombatantAtCanvasPoint(
      this.layouts,
      canvasX,
      canvasY,
      SPRITE_SCALE,
    );
    this.onFieldHoverChange(hit?.id ?? null);
  };

  private readonly handleCanvasPointerLeave = (): void => {
    this.onFieldHoverChange?.(null);
  };

  mount(container: HTMLElement): void {
    this.theme = readBattleHudTheme(container);
    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.className = "battle-canvas";
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.canvas.addEventListener("mousemove", this.handleCanvasPointerMove);
    this.canvas.addEventListener("mouseleave", this.handleCanvasPointerLeave);
  }

  setFieldHoverListener(
    listener: ((unitId: string | null) => void) | null,
  ): void {
    this.onFieldHoverChange = listener;
  }

  setHoverHighlightUnitId(unitId: string | null): void {
    this.setHoverHighlightUnitIds(unitId ? [unitId] : null);
  }

  setHoverHighlightUnitIds(unitIds: readonly string[] | null): void {
    const next = new Set(unitIds ?? []);
    if (
      next.size === this.hoverHighlightUnitIds.size &&
      [...next].every((id) => this.hoverHighlightUnitIds.has(id))
    ) {
      return;
    }
    this.hoverHighlightUnitIds = next;
    this.draw();
  }

  setTargetIndicatorUnitIds(unitIds: readonly string[]): void {
    this.targetIndicatorUnitIds = new Set(unitIds);
  }

  setCombatants(layout: CombatantLayout[]): void {
    this.layouts = layout;
    applyVisualDepthOffsets(this.layouts, SPRITE_SCALE);
  }

  setWorldOffset(offsetX: number): void {
    this.worldOffsetX = offsetX;
  }

  playAnim(combatantId: string, state: AnimState, spriteKey?: string): void {
    this.animator.setAnim(combatantId, state, spriteKey);
    if (state === "death") {
      const layout = this.layouts.find((l) => l.id === combatantId);
      this.deathPlayback.trigger(combatantId, {
        persist: layout ? !layout.isEnemy : false,
      });
      beginDeathPlaceholder(combatantId);
    }
  }

  playSkillAnim(
    combatantId: string,
    skillAnimKey: string,
    playback?: SkillAnimPlaybackOptions,
  ): void {
    this.animator.setSkillAnim(combatantId, skillAnimKey, playback);
  }

  isSkillAnimActive(combatantId: string, skillAnimKey?: string): boolean {
    return this.animator.isSkillAnimActive(combatantId, skillAnimKey);
  }

  playSkillVfx(
    instanceId: string,
    actorId: string,
    targetId: string,
    vfx: SkillVfxDef,
    options: PlaySkillVfxOptions,
  ): void {
    if (vfx.enabled === false) return;

    const kind = options.kind ?? "main";
    const vfxKey = resolveVfxAnimKey(
      options.skillId,
      options.effectIndex,
      kind,
    );
    const hasParticles = isParticleDefActive(vfx.particles);
    if (!vfxKey && !hasParticles) return;

    const source = this.layouts.find((layout) => layout.id === actorId);
    const target = this.layouts.find((layout) => layout.id === targetId);
    if (!source || !target) return;

    const placement = resolveVfxPlacement(vfx, kind);
    const worldPos = resolveVfxWorldPosition(
      placement,
      source,
      target,
      SPRITE_SIZE * SPRITE_SCALE,
    );
    const layer = resolveVfxLayer(placement);

    if (vfxKey) {
      this.vfxPlayback.spawn(
        instanceId,
        vfxKey,
        worldPos,
        toVfxPlaybackOptions(vfx, options),
        layer,
      );
    }

    if (hasParticles) {
      const particlePlacement = vfx.particles.placement ?? placement;
      const particleWorldPos = resolveVfxWorldPosition(
        particlePlacement,
        source,
        target,
        SPRITE_SIZE * SPRITE_SCALE,
      );
      const particleLayer = resolveVfxLayer(particlePlacement);
      const presetDef = getParticlePresetDef(vfx.particles.preset);
      this.particlePlayback.spawn(
        `${instanceId}:particles`,
        particleWorldPos,
        particleLayer,
        vfx.particles,
        presetDef,
      );
    }
  }

  showDamagePopup(
    targetId: string,
    amount: number,
    variant: "damage" | "dot" = "damage",
    dotFlavor?: import("../battle/types.ts").DotFlavor,
  ): void {
    this.damagePopups.spawn(targetId, amount, variant, dotFlavor);
  }

  showHealPopup(targetId: string, amount: number): void {
    this.damagePopups.spawn(targetId, amount, "heal");
  }

  showEvadePopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "evade");
  }

  showBlockPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "block");
  }

  showCounterPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "counter");
  }

  showInvulnerablePopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "invulnerable");
  }

  showLastStandRecoveryPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "lastStandRecovery");
  }

  showLastStandGutsPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "lastStandGuts");
  }

  showEnemyReelInPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "enemyReelIn");
  }

  showKnockbackPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "knockback");
  }

  showLowHpCoverPopup(targetId: string): void {
    this.combatReactionPopups.spawn(targetId, "lowHpCover");
  }

  showBuffGlow(targetId: string): void {
    this.buffGlows.trigger(targetId);
  }

  tick(deltaMs: number): void {
    for (const layout of this.layouts) {
      this.animator.tick(layout.id, deltaMs);
    }
    this.syncLayoutAnimStates();
    this.vfxPlayback.tick(deltaMs);
    this.particlePlayback.tick(deltaMs);
    this.damagePopups.tick(deltaMs);
    this.combatReactionPopups.tick(deltaMs);
    this.buffGlows.tick(deltaMs);
    this.deathPlayback.tick(deltaMs);
    this.victoryOverlay.tick(deltaMs);
    this.draw();
  }

  destroy(): void {
    this.canvas.removeEventListener("mousemove", this.handleCanvasPointerMove);
    this.canvas.removeEventListener("mouseleave", this.handleCanvasPointerLeave);
    this.canvas.remove();
  }

  /** setCombatants 経路では syncFromSnapshot が無いため、描画前に animator を layouts へ反映 */
  private syncLayoutAnimStates(): void {
    this.layouts = this.layouts.map((layout) => {
      const animState = this.animator.getState(layout.id);
      return {
        ...layout,
        anim: animState.anim,
        animFrame: animState.frame,
        attackSheetKey: animState.attackSheetKey,
        skillAnimKey: animState.skillAnimKey,
        skillAnimFrame: animState.skillAnimFrame,
      };
    });
  }

  syncFromSnapshot(snapshot: BattleSnapshot): void {
    const layouts: CombatantLayout[] = [];
    const y = groundY(this.canvas.height, SPRITE_SCALE);
    // 進軍中は画面内に入ってから表示。Victory 等の非戦闘時は非表示
    const canShowEnemies = snapshot.phase === "running";
    if (canShowEnemies) {
      for (const enemy of snapshot.enemies) {
        const isDead = enemy.hp <= 0;
        if (!isDead) {
          this.resetDeathVisuals(enemy.id);
        }
        if (isDead && !this.deathPlayback.shouldShow(enemy.id)) continue;
        const marchPhase =
          snapshot.partyDeployActive || snapshot.waveAnnouncementActive;
        if (
          !isDead &&
          !snapshot.engaged &&
          !marchPhase &&
          enemy.battleX > BATTLE_ENEMY_MARCH_VISIBLE_MAX_X
        ) {
          continue;
        }
        this.syncMovementAnim(enemy.id, enemy.bodyAnimMarching, !isDead);
        const animState = this.animator.getState(enemy.id);
        layouts.push({
          id: enemy.id,
          x: enemy.battleX,
          y,
          spriteKey: enemy.spriteKey,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          baseMaxHp: enemy.baseMaxHp,
          barrierHp: enemy.barrierHp,
          atk: enemy.atk,
          def: enemy.def,
          res: enemy.res,
          isEnemy: true,
          rangePx: enemy.rangePx,
          isAlive: !isDead,
          anim: animState.anim,
          animFrame: animState.frame,
          attackSheetKey: animState.attackSheetKey,
          skillAnimKey: animState.skillAnimKey,
          skillAnimFrame: animState.skillAnimFrame,
          statusEffects: enemy.statusEffects,
        });
      }
    }

    for (const player of snapshot.allies) {
      const isDead = player.hp <= 0;
      if (isDead && player.corpseVisible === false) {
        this.resetDeathVisuals(player.id);
        continue;
      }
      if (!isDead) {
        this.resetDeathVisuals(player.id);
      }
      const marchPhase =
        snapshot.partyDeployActive || snapshot.waveAnnouncementActive;
      if (
        !isDead &&
        !snapshot.engaged &&
        !marchPhase &&
        player.battleX < BATTLE_ALLY_MARCH_VISIBLE_MIN_X
      ) {
        continue;
      }
      this.syncMovementAnim(player.id, player.bodyAnimMarching, player.hp > 0);
      const animState = this.animator.getState(player.id);
      layouts.push({
        id: player.id,
        x: player.battleX,
        y,
        spriteKey: player.spriteKey,
        hp: player.hp,
        maxHp: player.maxHp,
        baseMaxHp: player.baseMaxHp,
        barrierHp: player.barrierHp,
        atk: player.atk,
        def: player.def,
        res: player.res,
        role: player.role,
        isEnemy: false,
          rangePx: player.rangePx,
        isAlive: player.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
        attackSheetKey: animState.attackSheetKey,
        skillAnimKey: animState.skillAnimKey,
        skillAnimFrame: animState.skillAnimFrame,
        statusEffects: player.statusEffects,
      });
    }

    this.layouts = layouts;
    const enemyDepthReference = canShowEnemies
      ? snapshot.enemies.map((enemy) => ({
          id: enemy.id,
          x: enemy.battleX,
          isEnemy: true as const,
          rangePx: enemy.rangePx,
        }))
      : undefined;
    applyVisualDepthOffsets(layouts, SPRITE_SCALE, { enemyDepthReference });
    this.worldOffsetX = snapshot.worldOffsetX;
    this.victoryOverlay.syncPhase(
      snapshot.phase,
      snapshot.alliesOffScreen,
      snapshot.victoryUseTimerFade,
      snapshot.victoryAwaitExitMarch,
    );
    this.waveAnnouncementWaveIndex = snapshot.waveIndex;
    this.waveAnnouncementElapsedMs = snapshot.waveAnnouncementActive
      ? snapshot.waveAnnouncementElapsedMs
      : 0;
  }

  private syncMovementAnim(
    combatantId: string,
    bodyAnimMarching: boolean,
    isAlive: boolean,
  ): void {
    const wasMarching = this.isMarching.get(combatantId) ?? false;

    if (!isAlive) {
      this.isMarching.set(combatantId, false);
      this.marchIdleHoldFrames.delete(combatantId);
      return;
    }

    if (this.animator.blocksAutoMove(combatantId)) {
      this.isMarching.set(combatantId, bodyAnimMarching);
      return;
    }

    const animState = this.animator.getState(combatantId);
    if (bodyAnimMarching) {
      this.marchIdleHoldFrames.set(
        combatantId,
        BattleCanvas.MARCH_IDLE_HOLD_FRAMES,
      );
      if (!wasMarching || animState.anim === "idle") {
        this.animator.setAnim(combatantId, "move");
      }
    } else if (animState.anim === "move") {
      const hold = this.marchIdleHoldFrames.get(combatantId) ?? 0;
      if (hold > 0) {
        this.marchIdleHoldFrames.set(combatantId, hold - 1);
      } else {
        this.animator.setAnim(combatantId, "idle");
        this.marchIdleHoldFrames.delete(combatantId);
      }
    }

    this.isMarching.set(
      combatantId,
      bodyAnimMarching ||
        (this.marchIdleHoldFrames.get(combatantId) ?? 0) > 0,
    );
  }

  /** リスポーン等で HP が回復したユニットの死亡演出を解除 */
  private resetDeathVisuals(combatantId: string): void {
    this.deathPlayback.clear(combatantId);
    clearDeathPlaceholder(combatantId);
    const animState = this.animator.getState(combatantId);
    if (animState.anim === "death") {
      this.animator.setAnim(combatantId, "idle");
    }
  }

  private drawBackground(): void {
    const { canvas } = this;
    drawBattleFieldBackground(this.ctx, {
      canvasW: canvas.width,
      canvasH: canvas.height,
      groundLineY: groundLineY(canvas.height),
      worldOffsetX: this.worldOffsetX,
      theme: this.theme,
    });
  }

  private draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackground();

    const drawOrderLayouts = sortForSpriteDrawPass(this.layouts);

    this.vfxPlayback.draw(this.ctx, "behind", SPRITE_SCALE);
    this.particlePlayback.draw(this.ctx, "behind", SPRITE_SCALE);

    // battle-field.md §2.7 — depthOffsetY で陣営横断の前後を決め、同深度のみ §2.7 キーでタイブレーク
    for (const layout of drawOrderLayouts) {
      this.drawSprite(layout, layout.x, spriteDrawY(layout), SPRITE_SCALE);
    }

    for (const layout of this.layouts) {
      if (this.targetIndicatorUnitIds.has(layout.id)) {
        drawTargetIndicatorForLayout(
          this.ctx,
          layout,
          SPRITE_SCALE,
          this.theme,
        );
      }
    }

    if (this.hoverHighlightUnitIds.size > 0) {
      for (const layout of this.layouts) {
        if (!this.hoverHighlightUnitIds.has(layout.id)) continue;
        drawHoverHighlightForLayout(
          this.ctx,
          layout,
          SPRITE_SCALE,
          this.theme,
        );
      }
    }

    this.vfxPlayback.draw(this.ctx, "front", SPRITE_SCALE);
    this.particlePlayback.draw(this.ctx, "front", SPRITE_SCALE);

    this.damagePopups.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE,
      this.theme,
    );
    this.combatReactionPopups.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE,
      this.theme,
    );

    this.waveOverlay.draw(
      this.ctx,
      canvas.width,
      canvas.height,
      this.theme,
      this.waveAnnouncementWaveIndex,
      this.waveAnnouncementElapsedMs,
    );
    this.victoryOverlay.draw(
      this.ctx,
      canvas.width,
      canvas.height,
      this.theme,
    );
  }

  private drawSprite(
    layout: CombatantLayout,
    x: number,
    y: number,
    scale: number,
  ): void {
    const { ctx } = this;
    const size = SPRITE_SIZE * scale;
    const showingSkillAnim = layout.skillAnimKey !== null;
    const offsetY =
      showingSkillAnim ||
      hasEntityAnimSheet(
        layout.spriteKey,
        layout.anim,
        layout.attackSheetKey,
      )
        ? 0
        : getPlaceholderSpriteYOffset(layout, scale);

    const deathTransform =
      layout.anim === "death" &&
      !hasEntityAnimSheet(layout.spriteKey, "death")
        ? getDeathPlaceholderTransform(layout.id, layout)
        : null;
    const deathAlpha = this.deathPlayback.isActive(layout.id)
      ? this.deathPlayback.getAlpha(layout.id)
      : null;

    ctx.save();

    if (deathTransform) {
      const pivotX = x + size / 2;
      const pivotY = y + offsetY + size;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(deathTransform.rotationRad);
      ctx.translate(-size / 2, -size);
      if (layout.isEnemy) {
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
      }
      if (deathAlpha !== null) {
        ctx.globalAlpha = deathAlpha;
      }
    } else if (layout.isEnemy) {
      ctx.translate(x + size, y + offsetY);
      ctx.scale(-1, 1);
      if (!layout.isAlive) {
        ctx.globalAlpha = this.theme.deadAlpha;
      }
    } else {
      ctx.translate(x, y + offsetY);
      if (!layout.isAlive) {
        ctx.globalAlpha = this.theme.deadAlpha;
      }
    }

    const placeholderColor = resolveSpritePlaceholderColor(
      layout.spriteKey,
      this.theme,
    );
    const footX = size / 2;
    const footY = size;

    const drawAtFoot = (
      targetCtx: CanvasRenderingContext2D,
      anchorFootX: number,
      anchorFootY: number,
    ) => {
      if (layout.skillAnimKey) {
        drawSkillAnimAtFootAnchor(
          targetCtx,
          layout.skillAnimKey,
          layout.skillAnimFrame,
          anchorFootX,
          anchorFootY,
          scale,
        );
        return;
      }

      drawSpriteFrameAtFootAnchor(
        targetCtx,
        layout.spriteKey,
        layout.anim,
        layout.animFrame,
        anchorFootX,
        anchorFootY,
        size,
        size,
        scale,
        placeholderColor,
        layout.attackSheetKey,
      );
    };

    const drawLocalSprite = (localCtx: CanvasRenderingContext2D) => {
      drawAtFoot(localCtx, footX, footY);
    };

    const tintBufferSize = Math.ceil(
      Math.max(size, getSheetCellSize(layout.spriteKey, layout.anim) * scale),
    );

    const buffGlow = this.buffGlows.getIntensity(
      layout.id,
      this.theme.buffGlowPeak,
    );

    if (layout.anim === "death") {
      drawLocalSprite(ctx);
    } else if (buffGlow > 0) {
      drawSpriteWithBuffGlow(
        ctx,
        tintBufferSize,
        size,
        buffGlow,
        (bufferCtx) => {
          drawAtFoot(bufferCtx, tintBufferSize / 2, tintBufferSize);
        },
        this.theme.buffGlowR,
        this.theme.buffGlowG,
        this.theme.buffGlowB,
      );
    } else {
      drawLocalSprite(ctx);
    }

    ctx.restore();
  }

}

export { CANVAS_W, CANVAS_H };
