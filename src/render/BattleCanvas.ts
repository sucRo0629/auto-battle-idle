import type { BattleSnapshot } from '../battle/types.ts';
import type { Role } from '../battle/types.ts';
import { ANIM_DEFS, getSpriteColor } from './SpriteRegistry.ts';
import { SpriteAnimator } from './SpriteAnimator.ts';
import type { AnimState, CombatantLayout, IBattleRenderer } from './IBattleRenderer.ts';

const CANVAS_W = 480;
const CANVAS_H = 320;
const AMBIENT_W = 320;
const AMBIENT_H = 240;
const SPRITE_SIZE = 32;

const ROW_Y: Record<string, number> = {
  front: 200,
  middle: 180,
  back: 160,
};

const ROLE_COLORS: Record<Role, string> = {
  defender: '#3498db',
  supporter: '#2ecc71',
  attacker: '#e67e22',
};

export class BattleCanvas implements IBattleRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animator = new SpriteAnimator();
  private layouts: CombatantLayout[] = [];
  private worldOffsetX = 0;
  private ambient = false;

  constructor(ambient = false) {
    this.ambient = ambient;
  }

  mount(container: HTMLElement): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.ambient ? AMBIENT_W : CANVAS_W;
    this.canvas.height = this.ambient ? AMBIENT_H : CANVAS_H;
    this.canvas.className = 'battle-canvas';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
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

  tick(deltaMs: number): void {
    for (const layout of this.layouts) {
      this.animator.tick(layout.id, deltaMs);
    }
    this.draw();
  }

  destroy(): void {
    this.canvas.remove();
  }

  syncFromSnapshot(snapshot: BattleSnapshot): void {
    const layouts: CombatantLayout[] = [];
    let enemyIndex = 0;
    let allyIndex = 0;

    for (const enemy of snapshot.enemies) {
      const animState = this.animator.getState(enemy.id);
      layouts.push({
        id: enemy.id,
        x: 80 + enemyIndex * 56,
        y: ROW_Y.front,
        spriteKey: enemy.spriteKey,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        isEnemy: true,
        isAlive: enemy.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
      });
      enemyIndex++;
    }

    for (const ally of snapshot.allies) {
      const animState = this.animator.getState(ally.id);
      layouts.push({
        id: ally.id,
        x: 280 + allyIndex * 48,
        y: ROW_Y[ally.formationRow] ?? ROW_Y.front,
        spriteKey: ally.spriteKey,
        hp: ally.hp,
        maxHp: ally.maxHp,
        isEnemy: false,
        isAlive: ally.hp > 0,
        anim: animState.anim,
        animFrame: animState.frame,
      });
      allyIndex++;
    }

    this.layouts = layouts;
    this.worldOffsetX = snapshot.worldOffsetX;
  }

  private draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#2d3a4f';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 48);
    ctx.lineTo(canvas.width, canvas.height - 48);
    ctx.stroke();

    const scale = this.ambient ? 2 : 1;
    const offsetX = this.worldOffsetX % canvas.width;

    for (const layout of this.layouts) {
      const x = layout.x + offsetX;
      const y = layout.y;
      this.drawSprite(layout, x, y, scale);
      this.drawHpBar(layout, x, y - 10, scale);
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
    const color = getSpriteColor(layout.spriteKey);
    const bob = layout.anim === 'idle' ? Math.sin(layout.animFrame * 0.8) * 2 : 0;

    ctx.save();
    if (layout.isEnemy) {
      ctx.translate(x + size, y + bob);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(x, y + bob);
    }

    if (!layout.isAlive) {
      ctx.globalAlpha = 0.35;
    }

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    const def = ANIM_DEFS[layout.anim];
    const flash = layout.animFrame % def.frames;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(flash * (size / def.frames), 0, size / def.frames, size);

    if (layout.anim === 'hurt') {
      ctx.fillStyle = 'rgba(255,0,0,0.35)';
      ctx.fillRect(0, 0, size, size);
    }

    ctx.restore();
  }

  private drawHpBar(
    layout: CombatantLayout,
    x: number,
    y: number,
    scale: number,
  ): void {
    const { ctx } = this;
    const w = SPRITE_SIZE * scale;
    const h = 4 * scale;
    const ratio = layout.maxHp > 0 ? layout.hp / layout.maxHp : 0;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = layout.isEnemy ? '#9b59b6' : '#3498db';
    ctx.fillRect(x, y, w * ratio, h);
  }

  static hpColorForRole(role?: Role): string {
    if (!role) return '#9b59b6';
    return ROLE_COLORS[role] ?? '#3498db';
  }
}

export { CANVAS_W, CANVAS_H, AMBIENT_W, AMBIENT_H };
