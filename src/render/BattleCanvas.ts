import type { BattleSnapshot } from "../battle/types.ts";
import { getSpriteColor, getSpriteImage } from "./SpriteRegistry.ts";
import { BuffGlowManager, drawSpriteWithBuffGlow } from "./buffGlowEffect.ts";
import { drawSpriteWithDamageEffect } from "./damageEffect.ts";
import {
  getPlaceholderSpriteYOffset,
  hasSpriteSheetAnimation,
} from "./placeholderSpriteAnim.ts";
import { getClassIconColor, getClassIconImage } from "./IconRegistry.ts";
import { SpriteAnimator } from "./SpriteAnimator.ts";
import {
  groundY,
  ENEMY_VISIBLE_MIN_X,
  BATTLE_GROUND_MARGIN,
  battleCanvasHeight,
} from "./formationLayout.ts";
import { AttackEffectManager, type AttackEffectKind } from "./AttackEffect.ts";
import { DamagePopupManager } from "./DamagePopup.ts";
import {
  computeEnemyHpBarTops,
  defaultEnemyHpBarTop,
  ENEMY_HP_BAR_H,
  ENEMY_HP_BAR_W,
} from "./enemyHpBarLayout.ts";
import type {
  AnimState,
  CombatantLayout,
  IBattleRenderer,
} from "./IBattleRenderer.ts";
import { readBattleHudTheme, type BattleHudTheme } from "./battleHudTheme.ts";
import { VictoryOverlay } from "./VictoryOverlay.ts";

const CANVAS_W = 480;
const CANVAS_H = battleCanvasHeight(1);
const SPRITE_SIZE = 32;
const SPRITE_SCALE = 1;

interface AllyHudEntry {
  displayName: string;
  level: number;
  exp: number;
  expRequired: number;
  iconKey: string;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  activeCooldowns: {
    skillId: string;
    remaining: number;
    interval: number;
    slotIndex: 0 | 1;
  }[];
}

export interface PartyHudMeta {
  displayName: string;
  level: number;
  exp: number;
  expRequired: number;
}

const ACTIVE_SKILL_SLOT_COUNT = 2;

export class BattleCanvas implements IBattleRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animator = new SpriteAnimator();
  private attackEffects = new AttackEffectManager();
  private damagePopups = new DamagePopupManager();
  private buffGlows = new BuffGlowManager();
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
  }

  playAttackEffect(
    actorId: string,
    targetId: string,
    kind: AttackEffectKind,
    isHeal = false
  ): void {
    this.attackEffects.spawn(actorId, targetId, kind, isHeal);
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

    // 進軍中は画面内に入ってから表示。Victory 等の非戦闘時は非表示
    const canShowEnemies = snapshot.phase === "running";
    if (canShowEnemies) {
      for (const enemy of snapshot.enemies) {
        if (enemy.hp <= 0) continue;
        if (!snapshot.engaged && enemy.visualX < ENEMY_VISIBLE_MIN_X) continue;
        const animState = this.animator.getState(enemy.id);
        layouts.push({
          id: enemy.id,
          x: enemy.visualX,
          y,
          spriteKey: enemy.spriteKey,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          isEnemy: true,
          isAlive: enemy.hp > 0,
          anim: animState.anim,
          animFrame: animState.frame,
        });
      }
    }

    for (const ally of snapshot.allies) {
      const animState = this.animator.getState(ally.id);
      layouts.push({
        id: ally.id,
        x: ally.visualX,
        y,
        spriteKey: ally.spriteKey,
        hp: ally.hp,
        maxHp: ally.maxHp,
        role: ally.role,
        isEnemy: false,
        isAlive: ally.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
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
        isAlive: ally.hp > 0,
        activeCooldowns: ally.activeCooldowns,
      };
    });
    this.worldOffsetX = snapshot.worldOffsetX;
    this.victoryOverlay.syncPhase(snapshot.phase, snapshot.alliesOffScreen);
  }

  private drawBackground(): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const groundLineY = canvas.height - BATTLE_GROUND_MARGIN;
    const tileW = 32;
    const scrollX = ((this.worldOffsetX % tileW) + tileW) % tileW;

    ctx.fillStyle = "#22283a";
    for (let x = -tileW + scrollX; x < canvas.width + tileW; x += tileW) {
      ctx.fillRect(x, groundLineY + 4, tileW / 2, 8);
    }

    ctx.strokeStyle = "#2d3a4f";
    ctx.lineWidth = 2;
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
        .filter((layout) => layout.isEnemy)
        .map((layout) => ({ id: layout.id, x: layout.x, y: layout.y })),
      SPRITE_SCALE,
      SPRITE_SIZE
    );

    for (const layout of this.layouts) {
      this.drawSprite(layout, layout.x, layout.y, SPRITE_SCALE);
      if (layout.isEnemy) {
        this.drawHpBar(
          layout,
          layout.x,
          layout.y,
          SPRITE_SCALE,
          enemyBarTops.get(layout.id)
        );
      }
    }

    this.attackEffects.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE
    );
    this.damagePopups.draw(
      this.ctx,
      this.layouts,
      SPRITE_SIZE * SPRITE_SCALE,
      SPRITE_SCALE
    );

    this.drawPartyHud();
    this.victoryOverlay.draw(
      this.ctx,
      canvas.width,
      canvas.height,
      this.theme.fontFamily,
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
    const recastTotalH =
      recastBarH * ACTIVE_SKILL_SLOT_COUNT +
      recastGap * (ACTIVE_SKILL_SLOT_COUNT - 1);
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
      ctx.globalAlpha = 0.35;
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
      ctx.globalAlpha = 0.35;
    }

    for (let slot = 0; slot < ACTIVE_SKILL_SLOT_COUNT; slot++) {
      const rowY = y + slot * (rowH + rowGap);
      this.drawSkillRecastBar(bySlot.get(slot as 0 | 1), x, rowY, width, rowH);
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
      : Math.max(0, Math.min(1, 1 - cd.remaining / cd.interval));

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
      ctx.globalAlpha = 0.35;
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
    const ratio = ally.maxHp > 0 ? Math.max(0, ally.hp / ally.maxHp) : 0;

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = 0.35;
    }

    ctx.fillStyle = this.theme.barBorder;
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

    ctx.fillStyle = this.theme.barTrack;
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = this.theme.hpBarFill;
    ctx.fillRect(x, y, barW * ratio, barH);

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

    ctx.fillStyle = getClassIconColor(iconKey);
    ctx.fillRect(x, y, width, height);
  }

  private drawSpriteImage(
    ctx: CanvasRenderingContext2D,
    spriteKey: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const image = getSpriteImage(spriteKey);

    if (image) {
      ctx.drawImage(image, x, y, width, height);
      return;
    }

    ctx.fillStyle = getSpriteColor(spriteKey);
    ctx.fillRect(x, y, width, height);
  }

  private drawSprite(
    layout: CombatantLayout,
    x: number,
    y: number,
    scale: number
  ): void {
    const { ctx } = this;
    const size = SPRITE_SIZE * scale;
    const offsetY = hasSpriteSheetAnimation(layout.spriteKey)
      ? 0
      : getPlaceholderSpriteYOffset(layout, scale);

    ctx.save();
    if (layout.isEnemy) {
      ctx.translate(x + size, y + offsetY);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(x, y + offsetY);
    }

    if (!layout.isAlive) {
      ctx.globalAlpha = 0.35;
    }

    const drawLocalSprite = (localCtx: CanvasRenderingContext2D) => {
      this.drawSpriteImage(localCtx, layout.spriteKey, 0, 0, size, size);
    };

    const buffGlow = this.buffGlows.getIntensity(layout.id);

    if (layout.anim === "hurt") {
      drawSpriteWithDamageEffect(ctx, size, drawLocalSprite);
    } else if (buffGlow > 0) {
      drawSpriteWithBuffGlow(ctx, size, buffGlow, drawLocalSprite);
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
    const ratio = layout.maxHp > 0 ? Math.max(0, layout.hp / layout.maxHp) : 0;

    ctx.fillStyle = this.theme.barTrack;
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = this.theme.enemyHpBarFill;
    ctx.fillRect(x, y, barW * ratio, barH);

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, barW + 1, barH + 1);
  }
}

export { CANVAS_W, CANVAS_H };
