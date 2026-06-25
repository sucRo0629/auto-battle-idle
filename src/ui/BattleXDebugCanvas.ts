import type { BattleSnapshot, CombatantSnapshot } from "../battle/types.ts";

const CANVAS_W = 480;
const MIN_CANVAS_H = 157;
const DOT_RADIUS = 4;
const LABEL_FONT = "11px 'Segoe UI', system-ui, sans-serif";
const FIRST_LANE_Y = 72;
const LANE_STEP = 36;
const LABEL_Y_OFFSET = 24;
const BOTTOM_PADDING = 20;
const DEAD_ENEMY_ALPHA = 0.35;
const SKILL_RANGE_FLASH_MS = 1000;

export class BattleXDebugCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private snapshot: BattleSnapshot | null = null;
  private visible = false;
  private elapsedMs = 0;
  private laneByUnitId = new Map<string, number>();
  private nextLane = 0;
  private rangeFlashes = new Map<string, { rangePx: number; expiresAtMs: number }>();

  mount(parent: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = MIN_CANVAS_H;
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
    if (this.snapshot?.waveIndex !== snapshot.waveIndex) {
      this.resetLanes();
    }
    this.snapshot = snapshot;
    this.ensureLanes(snapshot);
  }

  flashSkillRange(actorId: string, rangePx: number): void {
    this.rangeFlashes.set(actorId, {
      rangePx,
      expiresAtMs: this.elapsedMs + SKILL_RANGE_FLASH_MS,
    });
  }

  tick(deltaMs: number): void {
    if (!this.visible) return;
    this.elapsedMs += deltaMs;
    this.pruneRangeFlashes();
    this.draw();
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.snapshot = null;
    this.resetLanes();
    this.rangeFlashes.clear();
    this.elapsedMs = 0;
  }

  private resetLanes(): void {
    this.laneByUnitId.clear();
    this.nextLane = 0;
  }

  private pruneRangeFlashes(): void {
    for (const [actorId, flash] of this.rangeFlashes) {
      if (flash.expiresAtMs <= this.elapsedMs) {
        this.rangeFlashes.delete(actorId);
      }
    }
  }

  private ensureLanes(snapshot: BattleSnapshot): void {
    const units = [
      ...snapshot.allies
        .slice()
        .sort(
          (a, b) =>
            (a.partySlotIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.partySlotIndex ?? Number.MAX_SAFE_INTEGER),
        ),
      ...snapshot.enemies.slice().sort((a, b) => a.id.localeCompare(b.id)),
    ];
    for (const unit of units) {
      if (!this.laneByUnitId.has(unit.id)) {
        this.laneByUnitId.set(unit.id, this.nextLane++);
      }
    }
  }

  private draw(): void {
    const { canvas, ctx, snapshot } = this;
    if (!canvas || !ctx || !snapshot) return;

    const units = [...snapshot.allies, ...snapshot.enemies];
    this.ensureCanvasHeight(canvas, this.nextLane);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(14, 18, 28, 0.96)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    this.drawHeader(ctx);
    this.drawAxis(ctx, canvas.height);
    this.drawUnits(ctx, units);

    ctx.restore();
  }

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#d9e4f5";
    ctx.fillText("battleX debug", 10, 14);
    ctx.fillStyle = "#9fb0c8";
    ctx.fillText("raw battleX by combatant id", 110, 14);
  }

  private drawAxis(ctx: CanvasRenderingContext2D, canvasHeight: number): void {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(CANVAS_W, 32);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillStyle = "#72809a";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0.5, 28);
    ctx.lineTo(0.5, canvasHeight - 8);
    ctx.stroke();

    for (const x of [0, 120, 240, 360, 480]) {
      ctx.beginPath();
      ctx.moveTo(x, 28);
      ctx.lineTo(x, canvasHeight - 8);
      ctx.stroke();
      ctx.fillText(String(x), x, 24);
    }
  }

  private drawUnits(
    ctx: CanvasRenderingContext2D,
    units: CombatantSnapshot[],
  ): void {
    const sorted = units
      .slice()
      .sort(
        (a, b) =>
          (this.laneByUnitId.get(a.id) ?? 0) - (this.laneByUnitId.get(b.id) ?? 0),
      );

    for (const unit of sorted) {
      const lane = this.laneByUnitId.get(unit.id);
      if (lane === undefined) continue;

      const y = FIRST_LANE_Y + lane * LANE_STEP;
      const isDeadEnemy = unit.isEnemy && unit.hp <= 0;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();

      const flash = this.rangeFlashes.get(unit.id);
      if (flash && flash.expiresAtMs > this.elapsedMs) {
        this.drawRangeBand(ctx, unit, y, flash.rangePx, isDeadEnemy);
      }

      ctx.save();
      if (isDeadEnemy) {
        ctx.globalAlpha = DEAD_ENEMY_ALPHA;
      }

      const x = this.clamp(unit.battleX, 6, CANVAS_W - 6);
      ctx.fillStyle = unit.isEnemy ? "#ff8f8f" : "#8fd3ff";
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.stroke();

      const idText = unit.id;
      const xText = String(Math.round(unit.battleX));
      const idY = y + 12;
      const xY = y + LABEL_Y_OFFSET;

      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillStyle = "#ffffff";
      ctx.strokeText(idText, x, idY);
      ctx.fillText(idText, x, idY);
      ctx.strokeText(xText, x, xY);
      ctx.fillText(xText, x, xY);

      ctx.restore();
    }
  }

  private drawRangeBand(
    ctx: CanvasRenderingContext2D,
    unit: CombatantSnapshot,
    y: number,
    rangePx: number,
    faded: boolean,
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
    if (faded) {
      ctx.globalAlpha = DEAD_ENEMY_ALPHA;
    }
    ctx.fillStyle = unit.isEnemy
      ? "rgba(199, 143, 255, 0.14)"
      : "rgba(165, 255, 203, 0.14)";
    ctx.fillRect(start, bandTop, width, bandHeight);
    ctx.strokeStyle = unit.isEnemy
      ? "rgba(199, 143, 255, 0.38)"
      : "rgba(165, 255, 203, 0.38)";
    const tipX = this.clamp(end, 0, CANVAS_W - 1);
    ctx.fillRect(tipX, bandTop, 1, bandHeight);
    ctx.restore();
  }

  private ensureCanvasHeight(
    canvas: HTMLCanvasElement,
    laneCount: number,
  ): void {
    const requiredHeight = Math.max(
      MIN_CANVAS_H,
      FIRST_LANE_Y +
        Math.max(0, laneCount - 1) * LANE_STEP +
        LABEL_Y_OFFSET +
        BOTTOM_PADDING,
    );
    if (canvas.height !== requiredHeight) {
      canvas.height = requiredHeight;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
