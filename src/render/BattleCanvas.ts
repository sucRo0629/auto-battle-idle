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
import { BATTLE_ALLY_MARCH_VISIBLE_MIN_X, BATTLE_ENEMY_MARCH_VISIBLE_MAX_X } from "../battle/battleConstants.ts";
import {
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
import {
  computeEnemyHpBarTops,
  defaultEnemyHpBarTop,
  ENEMY_HP_BAR_H,
  ENEMY_HP_BAR_W,
} from "./enemyHpBarLayout.ts";
import { collectStatusEffectBadgeDisplays } from "../battle/statusEffectDisplay.ts";
import {
  computeStatusBadgeTops,
  type StatusBadgeLayoutInput,
} from "./statusBadgeLayout.ts";
import {
  measureStatusBadgeBlock,
  drawStatusBadgeBlock,
  orderBadgesForDraw,
} from "./statusBadgeRenderer.ts";
import type {
  AnimState,
  CombatantLayout,
  IBattleRenderer,
  type PlaySkillVfxOptions,
} from "./IBattleRenderer.ts";
import {
  readBattleHudTheme,
  resolveSpritePlaceholderColor,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from "./battleHudTheme.ts";
import { VictoryOverlay } from "./VictoryOverlay.ts";
import { WaveOverlay } from "./WaveOverlay.ts";
import { DeathPlaybackManager } from "./deathPlayback.ts";
import { drawBattleFieldBackground } from "./battleFieldBackground.ts";
import { layoutHpBarBarrier } from "./hpBarBarrierLayout.ts";
import { sortForSpriteDraw } from "./spriteDrawOrder.ts";
import {
  applyVisualDepthOffsets,
  spriteDrawY,
} from "./spriteVisualDepth.ts";

const CANVAS_W = 480;
const CANVAS_H = battleCanvasHeight(1);
const SPRITE_SIZE = SPRITE_LAYOUT_SIZE;
const SPRITE_SCALE = 1;

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
  ): void {
    this.damagePopups.spawn(targetId, amount, variant);
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
          barrierHp: enemy.barrierHp,
          atk: enemy.atk,
          def: enemy.def,
          reg: enemy.reg,
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

    for (const ally of snapshot.allies) {
      const isDead = ally.hp <= 0;
      if (isDead && ally.corpseVisible === false) {
        this.resetDeathVisuals(ally.id);
        continue;
      }
      if (!isDead) {
        this.resetDeathVisuals(ally.id);
      }
      const marchPhase =
        snapshot.partyDeployActive || snapshot.waveAnnouncementActive;
      if (
        !isDead &&
        !snapshot.engaged &&
        !marchPhase &&
        ally.battleX < BATTLE_ALLY_MARCH_VISIBLE_MIN_X
      ) {
        continue;
      }
      this.syncMovementAnim(ally.id, ally.bodyAnimMarching, ally.hp > 0);
      const animState = this.animator.getState(ally.id);
      layouts.push({
        id: ally.id,
        x: ally.battleX,
        y,
        spriteKey: ally.spriteKey,
        hp: ally.hp,
        maxHp: ally.maxHp,
        barrierHp: ally.barrierHp,
        atk: ally.atk,
        def: ally.def,
        reg: ally.reg,
        role: ally.role,
        isEnemy: false,
          rangePx: ally.rangePx,
        isAlive: ally.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
        attackSheetKey: animState.attackSheetKey,
        skillAnimKey: animState.skillAnimKey,
        skillAnimFrame: animState.skillAnimFrame,
        statusEffects: ally.statusEffects,
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

    const enemyBarTops = computeEnemyHpBarTops(
      this.layouts
        .filter((layout) => layout.isEnemy && layout.isAlive)
        .map((layout) => ({
          id: layout.id,
          x: layout.x,
          y: spriteDrawY(layout),
        })),
      SPRITE_SCALE,
      SPRITE_SIZE
    );

    const enemyLayouts = sortForSpriteDraw(
      this.layouts.filter((layout) => layout.isEnemy),
    );
    const allyLayouts = sortForSpriteDraw(
      this.layouts.filter((layout) => !layout.isEnemy),
    );

    this.vfxPlayback.draw(this.ctx, "behind", SPRITE_SCALE);
    this.particlePlayback.draw(this.ctx, "behind", SPRITE_SCALE);

    for (const layout of enemyLayouts) {
      const spriteY = spriteDrawY(layout);
      this.drawSprite(layout, layout.x, spriteY, SPRITE_SCALE);
      if (layout.isAlive) {
        this.drawHpBar(
          layout,
          layout.x,
          spriteY,
          SPRITE_SCALE,
          enemyBarTops.get(layout.id)
        );
      }
    }
    for (const layout of allyLayouts) {
      this.drawSprite(layout, layout.x, spriteDrawY(layout), SPRITE_SCALE);
    }

    this.vfxPlayback.draw(this.ctx, "front", SPRITE_SCALE);
    this.particlePlayback.draw(this.ctx, "front", SPRITE_SCALE);

    this.drawStatusBadges(SPRITE_SCALE);

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

  private fillHpBarWithBarrier(
    x: number,
    y: number,
    barW: number,
    barH: number,
    hp: number,
    maxHp: number,
    barrierHp: number,
    hpFill: string,
    barrierFill: string,
    barrierOverflowFill: string,
  ): void {
    const { ctx } = this;
    if (maxHp <= 0) return;

    const layout = layoutHpBarBarrier(x, barW, hp, maxHp, barrierHp);
    if (!layout) return;

    ctx.fillStyle = hpFill;
    ctx.fillRect(x, y, layout.hpWidth, barH);

    if (layout.tier1.length === 0) return;

    ctx.fillStyle = barrierFill;
    for (const segment of layout.tier1) {
      ctx.fillRect(segment.x, y, segment.width, barH);
    }

    const overflowRatio = Math.max(0, barrierHp - maxHp) / maxHp;
    if (overflowRatio > 0) {
      ctx.fillStyle = barrierOverflowFill;
      ctx.fillRect(x, y, barW * overflowRatio, barH);
    }
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

  private drawHpBar(
    layout: CombatantLayout,
    spriteX: number,
    spriteY: number,
    scale: number,
    barTop?: number
  ): void {
    const { ctx } = this;
    const spriteW = SPRITE_SIZE * scale;
    const barW = ENEMY_HP_BAR_W * scale;
    const barH = ENEMY_HP_BAR_H * scale;
    const x = spriteX + (spriteW - barW) / 2;
    const y = barTop ?? defaultEnemyHpBarTop(spriteY, scale, SPRITE_SIZE);

    ctx.fillStyle = this.theme.barTrack;
    ctx.fillRect(x, y, barW, barH);

    this.fillHpBarWithBarrier(
      x,
      y,
      barW,
      barH,
      layout.hp,
      layout.maxHp,
      layout.barrierHp,
      this.theme.enemyHpBarFill,
      this.theme.enemyBarrierFill,
      this.theme.enemyBarrierOverflowFill,
    );

    ctx.strokeStyle = this.theme.enemyHpBarOutline;
    ctx.lineWidth = this.theme.enemyHpBarOutlineWidth;
    ctx.strokeRect(x - 0.5, y - 0.5, barW + 1, barH + 1);
  }

  private drawStatusBadges(scale: number): void {
    const badgeInputs: StatusBadgeLayoutInput[] = [];
    const rowWidthById = new Map<string, number>();
    const rowHeightById = new Map<string, number>();

    for (const layout of this.layouts) {
      if (!layout.isEnemy || !layout.isAlive) continue;

      const badges = collectStatusEffectBadgeDisplays(layout.statusEffects, {
        atk: layout.atk,
        def: layout.def,
        reg: layout.reg,
      });
      const drawItems = orderBadgesForDraw(badges);
      if (drawItems.length === 0) continue;

      const badgeLayout = measureStatusBadgeBlock(
        drawItems,
        scale,
        this.theme.statusBadgeIconSize,
        this.theme.statusIconOutlineWidth,
        this.theme.statusBadgeOverlap,
      );
      rowWidthById.set(layout.id, badgeLayout.totalWidth);
      rowHeightById.set(layout.id, badgeLayout.totalHeight);
      badgeInputs.push({
        id: layout.id,
        x: layout.x,
        y: spriteDrawY(layout),
      });
    }

    const badgeTops = computeStatusBadgeTops(
      badgeInputs,
      rowWidthById,
      scale,
      SPRITE_SIZE,
      rowHeightById,
    );

    for (const layout of this.layouts) {
      if (!layout.isEnemy || !layout.isAlive) continue;

      const badges = collectStatusEffectBadgeDisplays(layout.statusEffects, {
        atk: layout.atk,
        def: layout.def,
        reg: layout.reg,
      });
      const drawItems = orderBadgesForDraw(badges);
      const top = badgeTops.get(layout.id);
      if (drawItems.length === 0 || top === undefined) continue;

      const spriteW = SPRITE_SIZE * scale;
      const centerX = layout.x + spriteW / 2;

      drawStatusBadgeBlock(this.ctx, centerX, top, drawItems, scale, {
        buffColor: this.theme.statusBuffColor,
        debuffColor: this.theme.statusDebuffColor,
        iconSize: this.theme.statusBadgeIconSize,
        rowOverlap: this.theme.statusBadgeOverlap,
        overlayColor: this.theme.statusBadgeOverlay,
        iconOutlineColor: this.theme.statusIconOutlineColor,
        passiveIconOutlineColor: this.theme.statusPassiveIconOutlineColor,
        iconOutlineWidth: this.theme.statusIconOutlineWidth,
        iconFallbackAlpha: this.theme.statusIconFallbackAlpha,
        resolveIconFallbackColor: (category) =>
          resolveStatusIconFallbackColor(category, this.theme),
      });
    }
  }
}

export { CANVAS_W, CANVAS_H };
