import type { BattleSnapshot, StatusEffect, SkillVfxDef } from "../battle/types.ts";
import { BuffGlowManager, drawSpriteWithBuffGlow } from "./buffGlowEffect.ts";
import { drawSpriteWithDamageEffect } from "./damageEffect.ts";
import {
  getPlaceholderSpriteYOffset,
  beginDeathPlaceholder,
  clearDeathPlaceholder,
  getDeathPlaceholderTransform,
} from "./placeholderSpriteAnim.ts";
import { hasSpriteSheetAnimation } from "./spriteSheetRegistry.ts";
import { drawSpriteFrameAtFootAnchor } from "./spriteFrameDraw.ts";
import {
  getSheetCellSize,
  SPRITE_LAYOUT_SIZE,
} from "./spriteLayout.ts";
import { getClassIconImage } from "./IconRegistry.ts";
import { SpriteAnimator } from "./SpriteAnimator.ts";
import { BATTLE_ENEMY_VISIBLE_MIN_X } from "../battle/types.ts";
import {
  groundY,
  BATTLE_GROUND_MARGIN,
  battleCanvasHeight,
} from "./formationLayout.ts";
import { AttackEffectManager } from "./AttackEffect.ts";
import { DamagePopupManager } from "./DamagePopup.ts";
import {
  computeEnemyHpBarTops,
  defaultEnemyHpBarTop,
  ENEMY_HP_BAR_H,
  ENEMY_HP_BAR_W,
} from "./enemyHpBarLayout.ts";
import { aggregateStatStatusEffects } from "../battle/statusEffectDisplay.ts";
import {
  computeStatusBadgeTops,
  type StatusBadgeLayoutInput,
} from "./statusBadgeLayout.ts";
import {
  drawStatusBadgeRow,
  orderBadgesForDraw,
  statusBadgeRowWidth,
} from "./statusBadgeRenderer.ts";
import type {
  AnimState,
  CombatantLayout,
  IBattleRenderer,
} from "./IBattleRenderer.ts";
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
  resolveSpritePlaceholderColor,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from "./battleHudTheme.ts";
import { VictoryOverlay } from "./VictoryOverlay.ts";
import { DeathPlaybackManager } from "./deathPlayback.ts";

const CANVAS_W = 480;
const CANVAS_H = battleCanvasHeight(1);
const SPRITE_SIZE = SPRITE_LAYOUT_SIZE;
const SPRITE_SCALE = 1;

interface AllyHudEntry {
  displayName: string;
  level: number;
  exp: number;
  expRequired: number;
  iconKey: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  activeCooldowns: {
    skillId: string;
    remaining: number;
    triggerKind: import("../battle/types.ts").SkillTriggerKind;
    triggerValue: number;
    slotIndex: number;
  }[];
}

export interface PartyHudMeta {
  displayName: string;
  level: number;
  exp: number;
  expRequired: number;
}

const MIN_ACTIVE_SKILL_SLOTS = 1;

export class BattleCanvas implements IBattleRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animator = new SpriteAnimator();
  private attackEffects = new AttackEffectManager();
  private damagePopups = new DamagePopupManager();
  private buffGlows = new BuffGlowManager();
  private deathPlayback = new DeathPlaybackManager();
  private victoryOverlay = new VictoryOverlay();
  private layouts: CombatantLayout[] = [];
  private allyHud: AllyHudEntry[] = [];
  private theme!: BattleHudTheme;
  private worldOffsetX = 0;

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
  }

  setWorldOffset(offsetX: number): void {
    this.worldOffsetX = offsetX;
  }

  playAnim(combatantId: string, state: AnimState): void {
    this.animator.setAnim(combatantId, state);
    if (state === "death") {
      const layout = this.layouts.find((l) => l.id === combatantId);
      this.deathPlayback.trigger(combatantId, {
        persist: layout ? !layout.isEnemy : false,
      });
      beginDeathPlaceholder(combatantId);
    }
  }

  playAttackEffect(
    actorId: string,
    targetId: string,
    vfx: SkillVfxDef,
  ): void {
    this.attackEffects.spawn(actorId, targetId, vfx);
  }

  showDamagePopup(targetId: string, amount: number): void {
    this.damagePopups.spawn(targetId, amount, "damage");
  }

  showHealPopup(targetId: string, amount: number): void {
    this.damagePopups.spawn(targetId, amount, "heal");
  }

  showBuffGlow(targetId: string): void {
    this.buffGlows.trigger(targetId);
  }

  tick(deltaMs: number): void {
    for (const layout of this.layouts) {
      this.animator.tick(layout.id, deltaMs);
    }
    this.attackEffects.tick(deltaMs);
    this.damagePopups.tick(deltaMs);
    this.buffGlows.tick(deltaMs);
    this.deathPlayback.tick(deltaMs);
    this.victoryOverlay.tick(deltaMs);
    this.draw();
  }

  destroy(): void {
    this.canvas.remove();
  }

  syncFromSnapshot(
    snapshot: BattleSnapshot,
    partyMeta: PartyHudMeta[] = []
  ): void {
    const layouts: CombatantLayout[] = [];
    const y = groundY(this.canvas.height, SPRITE_SCALE);
    const cameraX = snapshot.combatCameraX;

    // 進軍中は画面内に入ってから表示。Victory 等の非戦闘時は非表示
    const canShowEnemies = snapshot.phase === "running";
    if (canShowEnemies) {
      for (const enemy of snapshot.enemies) {
        const isDead = enemy.hp <= 0;
        if (!isDead) {
          this.resetDeathVisuals(enemy.id);
        }
        if (isDead && !this.deathPlayback.shouldShow(enemy.id)) continue;
        if (
          !isDead &&
          !snapshot.engaged &&
          enemy.battleX < BATTLE_ENEMY_VISIBLE_MIN_X
        ) {
          continue;
        }
        const animState = this.animator.getState(enemy.id);
        layouts.push({
          id: enemy.id,
          x: enemy.visualX + cameraX,
          y,
          spriteKey: enemy.spriteKey,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          barrierHp: enemy.barrierHp,
          atk: enemy.atk,
          def: enemy.def,
          reg: enemy.reg,
          isEnemy: true,
          isAlive: !isDead,
          anim: animState.anim,
          animFrame: animState.frame,
          statusEffects: enemy.statusEffects,
        });
      }
    }

    for (const ally of snapshot.allies) {
      if (ally.hp > 0) {
        this.resetDeathVisuals(ally.id);
      }
      const animState = this.animator.getState(ally.id);
      layouts.push({
        id: ally.id,
        x: ally.visualX + cameraX,
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
        isAlive: ally.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
        statusEffects: ally.statusEffects,
      });
    }

    this.layouts = layouts;
    this.allyHud = snapshot.allies.map((ally, index) => {
      const meta = partyMeta[index];
      return {
        displayName: meta?.displayName ?? ally.name,
        level: meta?.level ?? 1,
        exp: meta?.exp ?? 0,
        expRequired: meta?.expRequired ?? 1,
        iconKey: ally.iconKey,
        hp: ally.hp,
        maxHp: ally.maxHp,
        barrierHp: ally.barrierHp,
        atk: ally.atk,
        def: ally.def,
        reg: ally.reg,
        isAlive: ally.hp > 0,
        statusEffects: ally.statusEffects,
        activeCooldowns: ally.activeCooldowns,
      };
    });
    this.worldOffsetX = snapshot.worldOffsetX;
    this.victoryOverlay.syncPhase(snapshot.phase, snapshot.alliesOffScreen);
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
    const { ctx, canvas } = this;
    const theme = this.theme;
    ctx.fillStyle = theme.sceneSkyFill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const groundLineY = canvas.height - BATTLE_GROUND_MARGIN;
    const tileW = 32;
    const scrollX = ((this.worldOffsetX % tileW) + tileW) % tileW;

    ctx.fillStyle = theme.sceneGroundFill;
    for (let x = -tileW + scrollX; x < canvas.width + tileW; x += tileW) {
      ctx.fillRect(x, groundLineY + 4, tileW / 2, 8);
    }

    ctx.strokeStyle = theme.sceneGroundStroke;
    ctx.lineWidth = theme.sceneGroundStrokeWidth;
    ctx.beginPath();
    ctx.moveTo(0, groundLineY);
    ctx.lineTo(canvas.width, groundLineY);
    ctx.stroke();
  }

  private draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackground();

    const enemyBarTops = computeEnemyHpBarTops(
      this.layouts
        .filter((layout) => layout.isEnemy && layout.isAlive)
        .map((layout) => ({ id: layout.id, x: layout.x, y: layout.y })),
      SPRITE_SCALE,
      SPRITE_SIZE
    );

    for (const layout of this.layouts) {
      this.drawSprite(layout, layout.x, layout.y, SPRITE_SCALE);
      if (layout.isEnemy && layout.isAlive) {
        this.drawHpBar(
          layout,
          layout.x,
          layout.y,
          SPRITE_SCALE,
          enemyBarTops.get(layout.id)
        );
      }
    }

    this.drawStatusBadges(enemyBarTops, SPRITE_SCALE);

    this.attackEffects.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE,
      this.theme,
    );
    this.damagePopups.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE,
      this.theme,
    );

    this.drawPartyHud();
    this.victoryOverlay.draw(
      this.ctx,
      canvas.width,
      canvas.height,
      this.theme,
    );
  }

  private measurePartyHudHeader(hudScale: number): {
    headerH: number;
    labelH: number;
  } {
    const theme = this.theme;
    const labelH = Math.max(
      8,
      Math.round(theme.headerFontSize * hudScale),
    );
    const blockGap = theme.headerBlockGap * hudScale;
    return { headerH: labelH + blockGap, labelH };
  }

  private maxActiveSkillSlots(): number {
    if (this.allyHud.length === 0) return MIN_ACTIVE_SKILL_SLOTS;
    return Math.max(
      MIN_ACTIVE_SKILL_SLOTS,
      ...this.allyHud.map((ally) => ally.activeCooldowns.length),
    );
  }

  private measurePartyHudBarStack(
    iconSize: number,
    hudScale: number,
  ): {
    expBarH: number;
    expHpGap: number;
    hpBarH: number;
    barSkillGap: number;
    recastBarH: number;
    recastGap: number;
  } {
    const theme = this.theme;
    const expBarH = Math.max(2, Math.round(theme.expBarH * hudScale));
    const expHpGap = theme.expHpGap * hudScale;
    const barSkillGap = theme.barSkillGap * hudScale;
    const recastBarH = Math.max(2, Math.round(theme.recastBarH * hudScale));
    const recastGap = theme.recastGap * hudScale;
    const activeSkillSlotCount = this.maxActiveSkillSlots();
    const recastTotalH =
      recastBarH * activeSkillSlotCount +
      recastGap * (activeSkillSlotCount - 1);
    const hpBarH = Math.max(
      2,
      iconSize - expBarH - expHpGap - barSkillGap - recastTotalH,
    );
    return { expBarH, expHpGap, hpBarH, barSkillGap, recastBarH, recastGap };
  }

  private drawPartyHud(): void {
    if (this.allyHud.length === 0) return;

    const { canvas } = this;
    const theme = this.theme;
    const iconSize = theme.iconSize;
    const barW = theme.barW;
    const { expBarH, expHpGap, hpBarH, barSkillGap, recastBarH, recastGap } =
      this.measurePartyHudBarStack(iconSize, 1);
    const iconBarGap = theme.iconBarGap;
    const entryW = iconSize + iconBarGap + barW;
    const { headerH } = this.measurePartyHudHeader(1);
    const blockBottom = canvas.height - theme.bottomMargin;
    const blockTop = blockBottom - iconSize;
    const headerTop = blockTop - headerH;
    const slotW = canvas.width / this.allyHud.length;
    const labelFontSize = Math.max(8, Math.round(theme.headerFontSize));

    this.allyHud.forEach((ally, index) => {
      const slotCenterX = slotW * index + slotW / 2;
      const x = slotCenterX - entryW / 2;
      const barX = x + iconSize + iconBarGap;
      const labelY = headerTop;
      const expBarY = blockTop;
      const hpBarY = blockTop + expBarH + expHpGap;
      const recastY = hpBarY + hpBarH + barSkillGap;

      this.drawHudClassLabel(ally, x, labelY, labelFontSize);
      this.drawHudIcon(ally, x, blockTop, iconSize);
      this.drawHudExpBar(ally, barX, expBarY, barW, expBarH);
      this.drawHudHpBar(ally, barX, hpBarY, barW, hpBarH);
      this.drawHudStatusBadges(ally, barX, hpBarY, barW, hpBarH);
      this.drawSkillRecastRow(
        ally,
        barX,
        recastY,
        barW,
        recastBarH,
        recastGap,
      );
    });
  }

  private drawHudClassLabel(
    ally: AllyHudEntry,
    leftX: number,
    labelY: number,
    fontSize: number,
  ): void {
    const { ctx } = this;

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = this.theme.deadAlpha;
    }

    ctx.font = `${fontSize}px ${this.theme.fontFamily}`;
    ctx.fillStyle = this.theme.nameColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${ally.displayName} Lv${ally.level}`, leftX, labelY);
    ctx.restore();
  }

  private drawHudExpBar(
    ally: AllyHudEntry,
    x: number,
    y: number,
    barW: number,
    barH: number
  ): void {
    const { ctx } = this;
    const ratio =
      ally.expRequired > 0
        ? Math.max(0, Math.min(1, ally.exp / ally.expRequired))
        : 0;

    ctx.fillStyle = this.theme.barBorder;
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

    ctx.fillStyle = this.theme.barTrack;
    ctx.fillRect(x, y, barW, barH);

    if (ratio > 0) {
      ctx.fillStyle = this.theme.expBarFill;
      ctx.fillRect(x, y, barW * ratio, barH);
    }
  }

  /** HPバー下のリキャストバー（上: スロット1 / 下: スロット2） */
  private drawSkillRecastRow(
    ally: AllyHudEntry,
    x: number,
    y: number,
    width: number,
    rowH: number,
    rowGap: number,
  ): void {
    const { ctx } = this;
    const bySlot = new Map(
      ally.activeCooldowns.map((cd) => [cd.slotIndex, cd] as const)
    );

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = this.theme.deadAlpha;
    }

    for (let slot = 0; slot < this.maxActiveSkillSlots(); slot++) {
      const rowY = y + slot * (rowH + rowGap);
      this.drawSkillRecastBar(bySlot.get(slot), x, rowY, width, rowH);
    }

    ctx.restore();
  }

  private drawSkillRecastBar(
    cd: AllyHudEntry["activeCooldowns"][number] | undefined,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const { ctx } = this;

    ctx.fillStyle = this.theme.barBorder;
    ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = this.theme.skillRecastTrack;
    ctx.fillRect(x, y, width, height);

    if (!cd) return;

    const ready = cd.remaining <= 0;
    const ratio = ready
      ? 1
      : Math.max(0, Math.min(1, 1 - cd.remaining / cd.triggerValue));

    if (ratio <= 0) return;

    ctx.fillStyle = ready
      ? this.theme.skillRecastReady
      : this.theme.skillRecastCharging;
    ctx.fillRect(x, y, width * ratio, height);
  }

  private drawHudIcon(
    ally: AllyHudEntry,
    x: number,
    y: number,
    size: number
  ): void {
    const { ctx } = this;

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = this.theme.deadAlpha;
    }

    ctx.fillStyle = this.theme.iconFrame;
    ctx.fillRect(x - 1, y - 1, size + 2, size + 2);

    ctx.fillStyle = this.theme.iconBorder;
    ctx.fillRect(x, y, size, size);

    this.drawClassIconImage(ally.iconKey, x, y, size, size);

    ctx.restore();
  }

  private drawHudHpBar(
    ally: AllyHudEntry,
    x: number,
    y: number,
    barW: number,
    barH: number
  ): void {
    const { ctx } = this;

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = this.theme.deadAlpha;
    }

    ctx.fillStyle = this.theme.barBorder;
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

    ctx.fillStyle = this.theme.barTrack;
    ctx.fillRect(x, y, barW, barH);

    this.fillHpBarWithBarrier(
      x,
      y,
      barW,
      barH,
      ally.hp,
      ally.maxHp,
      ally.barrierHp,
      this.theme.hpBarFill,
      this.theme.barrierFill,
      this.theme.barrierOverflowFill,
    );

    ctx.restore();
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

    const hpRatio = Math.max(0, hp / maxHp);
    ctx.fillStyle = hpFill;
    ctx.fillRect(x, y, barW * hpRatio, barH);

    if (barrierHp <= 0) return;

    const tier1Ratio = Math.min(barrierHp, maxHp) / maxHp;
    ctx.fillStyle = barrierFill;
    ctx.fillRect(x, y, barW * tier1Ratio, barH);

    const overflowRatio = Math.max(0, barrierHp - maxHp) / maxHp;
    if (overflowRatio > 0) {
      ctx.fillStyle = barrierOverflowFill;
      ctx.fillRect(x, y, barW * overflowRatio, barH);
    }
  }

  private drawHudStatusBadges(
    ally: AllyHudEntry,
    barX: number,
    hpBarY: number,
    barW: number,
    hpBarH: number,
  ): void {
    const badges = aggregateStatStatusEffects(ally.statusEffects, {
      atk: ally.atk,
      def: ally.def,
      reg: ally.reg,
    });
    const drawItems = orderBadgesForDraw(badges);
    if (drawItems.length === 0) return;

    const scale = 1;
    const rowW = statusBadgeRowWidth(
      drawItems.length,
      scale,
      this.theme.statusBadgeIconSize,
      this.theme.statusBadgeArrowWidth,
      this.theme.statusBadgeOverlap,
    );
    const badgeH = this.theme.statusBadgeIconSize * scale;
    const centerX = barX + barW - rowW / 2;
    const top = hpBarY + hpBarH - badgeH;

    const { ctx } = this;
    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = this.theme.deadAlpha;
    }

    drawStatusBadgeRow(this.ctx, centerX, top, drawItems, scale, {
      buffColor: this.theme.statusBuffColor,
      badgeBg: this.theme.statusBadgeBg,
      debuffColor: this.theme.statusDebuffColor,
      iconSize: this.theme.statusBadgeIconSize,
      arrowWidth: this.theme.statusBadgeArrowWidth,
      rowOverlap: this.theme.statusBadgeOverlap,
      overlayColor: this.theme.statusBadgeOverlay,
      iconFallbackAlpha: this.theme.statusIconFallbackAlpha,
      resolveIconFallbackColor: (category) =>
        resolveStatusIconFallbackColor(category, this.theme),
    });

    ctx.restore();
  }

  private drawClassIconImage(
    iconKey: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const { ctx } = this;
    const image = getClassIconImage(iconKey);

    if (image) {
      ctx.drawImage(image, x, y, width, height);
      return;
    }

    ctx.fillStyle = resolveClassIconPlaceholderColor(iconKey, this.theme);
    ctx.fillRect(x, y, width, height);
  }

  private drawSprite(
    layout: CombatantLayout,
    x: number,
    y: number,
    scale: number,
  ): void {
    const { ctx } = this;
    const size = SPRITE_SIZE * scale;
    const offsetY = hasSpriteSheetAnimation(layout.spriteKey, layout.anim)
      ? 0
      : getPlaceholderSpriteYOffset(layout, scale);

    const deathTransform =
      layout.anim === "death" &&
      !hasSpriteSheetAnimation(layout.spriteKey, "death")
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
      );
    };

    const drawLocalSprite = (localCtx: CanvasRenderingContext2D) => {
      drawAtFoot(localCtx, footX, footY);
    };

    const tintBufferSize = Math.ceil(
      Math.max(size, getSheetCellSize(layout.spriteKey) * scale),
    );

    const buffGlow = this.buffGlows.getIntensity(
      layout.id,
      this.theme.buffGlowPeak,
    );

    if (layout.anim === "death") {
      drawLocalSprite(ctx);
    } else if (layout.anim === "hurt") {
      drawSpriteWithDamageEffect(
        ctx,
        tintBufferSize,
        size,
        (bufferCtx) => {
          drawAtFoot(bufferCtx, tintBufferSize / 2, tintBufferSize);
        },
        this.theme.hurtTintStrength,
        this.theme.hurtTintR,
        this.theme.hurtTintG,
        this.theme.hurtTintB,
      );
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
    const y = barTop ?? defaultEnemyHpBarTop(spriteY, scale);

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

  private drawStatusBadges(
    enemyBarTops: Map<string, number>,
    scale: number,
  ): void {
    const badgeInputs: StatusBadgeLayoutInput[] = [];
    const rowWidthById = new Map<string, number>();

    for (const layout of this.layouts) {
      if (layout.isEnemy && !layout.isAlive) continue;

      const badges = aggregateStatStatusEffects(layout.statusEffects, {
        atk: layout.atk,
        def: layout.def,
        reg: layout.reg,
      });
      const drawItems = orderBadgesForDraw(badges);
      if (drawItems.length === 0) continue;

      const rowWidth = statusBadgeRowWidth(
        drawItems.length,
        scale,
        this.theme.statusBadgeIconSize,
        this.theme.statusBadgeArrowWidth,
        this.theme.statusBadgeOverlap,
      );
      rowWidthById.set(layout.id, rowWidth);
      badgeInputs.push({
        id: layout.id,
        x: layout.x,
        y: layout.y,
        isEnemy: layout.isEnemy,
        hpBarTop: layout.isEnemy ? enemyBarTops.get(layout.id) : undefined,
      });
    }

    const badgeTops = computeStatusBadgeTops(
      badgeInputs,
      rowWidthById,
      scale,
      SPRITE_SIZE,
    );

    for (const layout of this.layouts) {
      if (layout.isEnemy && !layout.isAlive) continue;

      const badges = aggregateStatStatusEffects(layout.statusEffects, {
        atk: layout.atk,
        def: layout.def,
        reg: layout.reg,
      });
      const drawItems = orderBadgesForDraw(badges);
      const top = badgeTops.get(layout.id);
      if (drawItems.length === 0 || top === undefined) continue;

      const spriteW = SPRITE_SIZE * scale;
      const centerX = layout.x + spriteW / 2;

      drawStatusBadgeRow(this.ctx, centerX, top, drawItems, scale, {
        buffColor: this.theme.statusBuffColor,
        badgeBg: this.theme.statusBadgeBg,
        debuffColor: this.theme.statusDebuffColor,
        iconSize: this.theme.statusBadgeIconSize,
        arrowWidth: this.theme.statusBadgeArrowWidth,
        rowOverlap: this.theme.statusBadgeOverlap,
        overlayColor: this.theme.statusBadgeOverlay,
        iconFallbackAlpha: this.theme.statusIconFallbackAlpha,
        resolveIconFallbackColor: (category) =>
          resolveStatusIconFallbackColor(category, this.theme),
      });
    }
  }
}

export { CANVAS_W, CANVAS_H };
