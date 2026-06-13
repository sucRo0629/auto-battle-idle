import type { BattleSnapshot, CombatantSnapshot } from "../battle/types.ts";

const CANVAS_W = 480;
const CANVAS_H = 157;
const DOT_RADIUS = 4;
const LABEL_FONT = "11px 'Segoe UI', system-ui, sans-serif";

export class BattleXDebugCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private snapshot: BattleSnapshot | null = null;
  private visible = false;

  mount(parent: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.className = "battle-x-debug-canvas";
    this.canvas.hidden = !this.visible;
    parent.appendChild(this.canvas);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.canvas) {
      this.canvas.hidden = !visible;
    }
    if (visible) {
      this.draw();
    }
  }

  syncFromSnapshot(snapshot: BattleSnapshot): void {
    this.snapshot = snapshot;
  }

  tick(_deltaMs: number): void {
    if (!this.visible) return;
    this.draw();
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.snapshot = null;
  }

  private draw(): void {
    const { canvas, ctx, snapshot } = this;
    if (!canvas || !ctx || !snapshot) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(14, 18, 28, 0.96)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    this.drawHeader(ctx);
    this.drawAxis(ctx);
    this.drawUnits(
      ctx,
      [
        ...this.sortByBattleX(snapshot.allies),
        ...this.sortByBattleX(snapshot.enemies),
      ].sort((a, b) => a.battleX - b.battleX),
      72,
    );

    ctx.restore();
  }

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#d9e4f5";
    ctx.fillText("battleX debug", 10, 14);
    ctx.fillStyle = "#9fb0c8";
    ctx.fillText("raw battleX by combatant id", 110, 14);
  }

  private drawAxis(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(CANVAS_W, 32);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillStyle = "#72809a";
    ctx.textAlign = "center";
    for (const x of [0, 120, 240, 360, 480]) {
      ctx.beginPath();
      ctx.moveTo(x, 28);
      ctx.lineTo(x, CANVAS_H - 8);
      ctx.stroke();
      ctx.fillText(String(x), x, 24);
    }
  }

  private drawUnits(
    ctx: CanvasRenderingContext2D,
    units: CombatantSnapshot[],
    y: number,
  ): void {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();

    for (const unit of units) {
      const x = this.clamp(unit.battleX, 6, CANVAS_W - 6);
      this.drawRangeBand(ctx, unit, y, unit.effectiveRangePx, "effective");
      this.drawRangeBand(ctx, unit, y, unit.rangePx, "base");

      ctx.fillStyle = unit.isEnemy ? "#ff8f8f" : "#8fd3ff";
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.stroke();

      const idText = unit.id;
      const xText = String(Math.round(unit.battleX));
      const idY = y + 12;
      const xY = y + 24;

      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillStyle = "#ffffff";
      ctx.strokeText(idText, x, idY);
      ctx.fillText(idText, x, idY);
      ctx.strokeText(xText, x, xY);
      ctx.fillText(xText, x, xY);
    }
  }

  private drawRangeBand(
    ctx: CanvasRenderingContext2D,
    unit: CombatantSnapshot,
    y: number,
    rangePx: number,
    bandKind: "base" | "effective",
  ): void {
    const clampedRangePx = Math.max(0, rangePx);
    if (clampedRangePx <= 0) return;

    const bandTop = y - 5;
    const bandHeight = 10;
    const rawStart = unit.isEnemy
      ? unit.battleX - clampedRangePx
      : unit.battleX;
    const rawEnd = unit.isEnemy
      ? unit.battleX
      : unit.battleX + clampedRangePx;
    const start = this.clamp(rawStart, 0, CANVAS_W);
    const end = this.clamp(rawEnd, 0, CANVAS_W);
    const width = end - start;
    if (width <= 0) return;

    ctx.save();
    ctx.fillStyle =
      bandKind === "effective"
        ? unit.isEnemy
          ? "rgba(199, 143, 255, 0.14)"
          : "rgba(165, 255, 203, 0.14)"
        : unit.isEnemy
          ? "rgba(255, 143, 143, 0.20)"
          : "rgba(143, 211, 255, 0.20)";
    ctx.fillRect(start, bandTop, width, bandHeight);
    ctx.strokeStyle =
      bandKind === "effective"
        ? unit.isEnemy
          ? "rgba(199, 143, 255, 0.38)"
          : "rgba(165, 255, 203, 0.38)"
        : unit.isEnemy
          ? "rgba(255, 143, 143, 0.40)"
          : "rgba(143, 211, 255, 0.40)";
    ctx.strokeRect(start, bandTop, width, bandHeight);
    ctx.restore();
  }

  private sortByBattleX(units: CombatantSnapshot[]): CombatantSnapshot[] {
    return [...units].sort((a, b) => a.battleX - b.battleX);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
