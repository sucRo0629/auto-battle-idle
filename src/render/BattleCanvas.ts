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
import type {
  AnimState,
  CombatantLayout,
  IBattleRenderer,
} from "./IBattleRenderer.ts";

const CANVAS_W = 480;
const CANVAS_H = battleCanvasHeight(1);
const AMBIENT_W = 320;
const AMBIENT_H = battleCanvasHeight(2);
const SPRITE_SIZE = 32;

const HP_BAR_W = 48;
const HP_BAR_H = 6;
const ALLY_HP_BAR_FILL = "#2ecc71";
const ENEMY_HP_BAR_FILL = "#e74c3c";

const HUD_ICON_SIZE = 24;
const HUD_BAR_W = 80;
const HUD_ICON_BAR_GAP = 4;
const HUD_BAR_SKILL_GAP = 2;
const HUD_BOTTOM_MARGIN = 5;

const HUD_ICON_BORDER = "#4a5568";
const HUD_HP_BAR_RATIO = 0.5;

interface AllyHudEntry {
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

const ACTIVE_SKILL_SLOT_COUNT = 2;
const SKILL_RECAST_CHARGING = "#5a6270";
const SKILL_RECAST_READY = "#9aa3b0";

export class BattleCanvas implements IBattleRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animator = new SpriteAnimator();
  private attackEffects = new AttackEffectManager();
  private damagePopups = new DamagePopupManager();
  private buffGlows = new BuffGlowManager();
  private layouts: CombatantLayout[] = [];
  private allyHud: AllyHudEntry[] = [];
  private ambient = false;
  private worldOffsetX = 0;

  constructor(ambient = false) {
    this.ambient = ambient;
  }

  mount(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.ambient ? AMBIENT_W : CANVAS_W;
    this.canvas.height = this.ambient ? AMBIENT_H : CANVAS_H;
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
    this.draw();
  }

  destroy(): void {
    this.canvas.remove();
  }

  syncFromSnapshot(snapshot: BattleSnapshot): void {
    const layouts: CombatantLayout[] = [];
    const scale = this.ambient ? 2 : 1;
    const y = groundY(this.canvas.height, scale);

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
    this.allyHud = snapshot.allies.map((ally) => ({
      iconKey: ally.iconKey,
      hp: ally.hp,
      maxHp: ally.maxHp,
      isAlive: ally.hp > 0,
      activeCooldowns: ally.activeCooldowns,
    }));
    this.worldOffsetX = snapshot.worldOffsetX;
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

    const scale = this.ambient ? 2 : 1;

    for (const layout of this.layouts) {
      this.drawSprite(layout, layout.x, layout.y, scale);
      if (layout.isEnemy) {
        this.drawHpBar(layout, layout.x, layout.y, scale);
      }
    }

    this.attackEffects.draw(this.ctx, this.layouts, SPRITE_SIZE * scale, scale);
    this.damagePopups.draw(this.ctx, this.layouts, SPRITE_SIZE * scale, scale);

    this.drawPartyHud(scale);
  }

  private measurePartyHudBars(
    iconSize: number,
    hudScale: number
  ): { hpBarH: number; recastBarH: number; barSkillGap: number } {
    const barSkillGap = HUD_BAR_SKILL_GAP * hudScale;
    const stackH = iconSize - barSkillGap;
    const hpBarH = Math.max(2, Math.round(stackH * HUD_HP_BAR_RATIO));
    const recastBarH = stackH - hpBarH;
    return { hpBarH, recastBarH, barSkillGap };
  }

  private drawPartyHud(scale: number): void {
    if (this.allyHud.length === 0) return;

    const { canvas } = this;
    const compact = this.ambient;
    const hudScale = compact ? 1 : scale;
    const iconSize = (compact ? 14 : HUD_ICON_SIZE) * hudScale;
    const barW = (compact ? 40 : HUD_BAR_W) * hudScale;
    const { hpBarH, recastBarH, barSkillGap } = this.measurePartyHudBars(
      iconSize,
      hudScale
    );
    const iconBarGap = HUD_ICON_BAR_GAP * hudScale;
    const entryW = iconSize + iconBarGap + barW;
    const blockBottom = canvas.height - HUD_BOTTOM_MARGIN;
    const blockTop = blockBottom - iconSize;
    const slotW = canvas.width / this.allyHud.length;

    this.allyHud.forEach((ally, index) => {
      const slotCenterX = slotW * index + slotW / 2;
      const x = slotCenterX - entryW / 2;
      const barX = x + iconSize + iconBarGap;
      const barY = blockTop;
      const recastY = blockTop + hpBarH + barSkillGap;

      this.drawHudIcon(ally, x, blockTop, iconSize);
      this.drawHudHpBar(ally, barX, barY, barW, hpBarH);
      this.drawSkillRecastRow(ally, barX, recastY, barW, recastBarH, hudScale);
    });
  }

  /** HPバー下のリキャストバー（上: スロット1 / 下: スロット2） */
  private drawSkillRecastRow(
    ally: AllyHudEntry,
    x: number,
    y: number,
    width: number,
    height: number,
    hudScale: number
  ): void {
    const { ctx } = this;
    const bySlot = new Map(
      ally.activeCooldowns.map((cd) => [cd.slotIndex, cd] as const)
    );

    ctx.save();
    if (!ally.isAlive) {
      ctx.globalAlpha = 0.35;
    }

    const gap = Math.max(1, hudScale);
    const rowH = (height - gap) / ACTIVE_SKILL_SLOT_COUNT;

    for (let slot = 0; slot < ACTIVE_SKILL_SLOT_COUNT; slot++) {
      const rowY = y + slot * (rowH + gap);
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

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = "#2a2a35";
    ctx.fillRect(x, y, width, height);

    if (!cd) return;

    const ready = cd.remaining <= 0;
    const ratio = ready
      ? 1
      : Math.max(0, Math.min(1, 1 - cd.remaining / cd.interval));

    if (ratio <= 0) return;

    ctx.fillStyle = ready ? SKILL_RECAST_READY : SKILL_RECAST_CHARGING;
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

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x - 1, y - 1, size + 2, size + 2);

    ctx.fillStyle = HUD_ICON_BORDER;
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

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = ALLY_HP_BAR_FILL;
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
    scale: number
  ): void {
    const { ctx } = this;
    const spriteW = SPRITE_SIZE * scale;
    const barW = HP_BAR_W * scale;
    const barH = HP_BAR_H * scale;
    const x = spriteX + (spriteW - barW) / 2;
    const y = spriteY - barH - 4 * scale;
    const ratio = layout.maxHp > 0 ? Math.max(0, layout.hp / layout.maxHp) : 0;

    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = ENEMY_HP_BAR_FILL;
    ctx.fillRect(x, y, barW * ratio, barH);

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, barW + 1, barH + 1);
  }
}

export { CANVAS_W, CANVAS_H, AMBIENT_W, AMBIENT_H };
