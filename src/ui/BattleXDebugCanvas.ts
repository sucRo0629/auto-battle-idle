import {
  formatBattleXTraceDetails,
  isBattleXTraceApproachIdleRow,
  isBattleXTraceTableRowVisible,
} from "../battle/battleXDebugTraceTable.ts";
import {
  BattleXDebugReplayBuffer,
  buildBattleXDebugReplayFrame,
  type BattleXDebugReplayFrame,
} from "../battle/battleXDebugReplayBuffer.ts";
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
  private root: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tableBody: HTMLTableSectionElement | null = null;
  private replayPanel: HTMLElement | null = null;
  private replayInfoEl: HTMLElement | null = null;
  private seekInput: HTMLInputElement | null = null;
  private seekMarkersEl: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private followButton: HTMLButtonElement | null = null;
  private snapshot: BattleSnapshot | null = null;
  private selectedTraceEntries: BattleXDebugTraceEntryView[] = [];
  private visible = false;
  private elapsedMs = 0;
  private laneByUnitId = new Map<string, number>();
  private nextLane = 0;
  private rangeFlashes = new Map<string, { rangePx: number; expiresAtMs: number }>();
  private readonly replayBuffer = new BattleXDebugReplayBuffer();
  private followLatest = true;
  private selectedIndex = 0;
  private liveFrame: BattleXDebugReplayFrame | null = null;

  mount(parent: HTMLElement): void {
    this.root = document.createElement("section");
    this.root.className = "battle-x-debug";
    this.root.hidden = !this.visible;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = MIN_CANVAS_H;
    this.canvas.className = "battle-x-debug-canvas";
    this.canvas.hidden = !this.visible;
    this.root.appendChild(this.canvas);
    this.mountReplayControls(this.root);
    this.mountTraceTable(this.root);
    parent.appendChild(this.root);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.root) {
      this.root.hidden = !visible;
    }
    if (this.canvas) {
      this.canvas.hidden = !visible;
    }
    if (!visible) {
      this.replayBuffer.clear();
      this.followLatest = true;
      this.selectedIndex = 0;
      this.liveFrame = null;
      this.selectedTraceEntries = [];
    }
    if (visible) {
      this.updateReplayControls();
      this.draw();
      this.renderTraceTable();
    }
  }

  /** replay paused: UI seek 固定 + 戦闘エンジン tick 停止対象 */
  isReplayPaused(): boolean {
    return this.visible && !this.followLatest;
  }

  recordLiveFrame(liveSnapshot: BattleSnapshot): void {
    if (!this.visible || !this.followLatest) return;
    const frame = buildBattleXDebugReplayFrame(liveSnapshot);
    if (!frame) return;

    this.liveFrame = frame;
    this.replayBuffer.push(frame);
    if (this.followLatest) {
      this.selectedIndex = this.replayBuffer.latestIndex;
    } else if (this.selectedIndex > this.replayBuffer.latestIndex) {
      this.selectedIndex = this.replayBuffer.latestIndex;
    }
    this.applySelectedFrame();
    this.updateReplayControls();
  }

  resolveDisplaySnapshot(liveSnapshot: BattleSnapshot): BattleSnapshot {
    if (!this.visible || this.followLatest) {
      return this.liveFrame?.snapshot ?? liveSnapshot;
    }
    return (
      this.replayBuffer.getFrame(this.selectedIndex)?.snapshot ?? liveSnapshot
    );
  }

  syncFromSnapshot(snapshot: BattleSnapshot): void {
    if (this.snapshot?.waveIndex !== snapshot.waveIndex) {
      this.resetLanes();
    }
    this.snapshot = snapshot;
    this.ensureLanes(snapshot);
    this.draw();
    this.renderTraceTable();
  }

  flashSkillRange(actorId: string, rangePx: number): void {
    if (!this.followLatest) return;
    this.rangeFlashes.set(actorId, {
      rangePx,
      expiresAtMs: this.elapsedMs + SKILL_RANGE_FLASH_MS,
    });
  }

  tick(deltaMs: number): void {
    if (!this.visible) return;
    this.elapsedMs += deltaMs;
    if (this.followLatest) {
      this.pruneRangeFlashes();
    }
    this.draw();
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.tableBody = null;
    this.replayPanel = null;
    this.replayInfoEl = null;
    this.seekInput = null;
    this.seekMarkersEl = null;
    this.pauseButton = null;
    this.followButton = null;
    this.snapshot = null;
    this.liveFrame = null;
    this.selectedTraceEntries = [];
    this.resetLanes();
    this.rangeFlashes.clear();
    this.replayBuffer.clear();
    this.elapsedMs = 0;
  }

  private applySelectedFrame(): void {
    const frame =
      this.replayBuffer.getFrame(this.selectedIndex) ?? this.liveFrame;
    if (!frame) return;
    this.snapshot = frame.snapshot;
    this.selectedTraceEntries = frame.traceEntries;
    this.ensureLanes(frame.snapshot);
    this.draw();
    this.renderTraceTable();
  }

  private mountReplayControls(parent: HTMLElement): void {
    this.replayPanel = document.createElement("div");
    this.replayPanel.className = "battle-x-debug-replay";

    const toolbar = document.createElement("div");
    toolbar.className = "battle-x-debug-replay__toolbar";

    this.pauseButton = this.createReplayButton("Pause", () => {
      if (this.followLatest) {
        this.followLatest = false;
      } else {
        this.followLatest = true;
        this.selectedIndex = this.replayBuffer.latestIndex;
        this.applySelectedFrame();
      }
      this.updateReplayControls();
    });
    this.followButton = this.createReplayButton("Follow latest", () => {
      this.followLatest = true;
      this.selectedIndex = this.replayBuffer.latestIndex;
      this.applySelectedFrame();
      this.updateReplayControls();
    });
    const stepBackButton = this.createReplayButton("◀ tick", () => {
      this.followLatest = false;
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.applySelectedFrame();
      this.updateReplayControls();
    });
    const stepForwardButton = this.createReplayButton("tick ▶", () => {
      this.followLatest = false;
      this.selectedIndex = Math.min(
        this.replayBuffer.latestIndex,
        this.selectedIndex + 1,
      );
      this.applySelectedFrame();
      this.updateReplayControls();
    });
    const prevWarningButton = this.createReplayButton("◀ warn", () => {
      this.followLatest = false;
      const target = this.replayBuffer.findNearestWarningIndex(
        this.selectedIndex,
        -1,
      );
      if (target !== null) {
        this.selectedIndex = target;
        this.applySelectedFrame();
      }
      this.updateReplayControls();
    });
    const nextWarningButton = this.createReplayButton("warn ▶", () => {
      this.followLatest = false;
      const target = this.replayBuffer.findNearestWarningIndex(
        this.selectedIndex,
        1,
      );
      if (target !== null) {
        this.selectedIndex = target;
        this.applySelectedFrame();
      }
      this.updateReplayControls();
    });

    toolbar.append(
      this.pauseButton,
      this.followButton,
      stepBackButton,
      stepForwardButton,
      prevWarningButton,
      nextWarningButton,
    );

    const seekWrap = document.createElement("div");
    seekWrap.className = "battle-x-debug-replay__seek-wrap";

    this.seekMarkersEl = document.createElement("div");
    this.seekMarkersEl.className = "battle-x-debug-replay__seek-markers";

    this.seekInput = document.createElement("input");
    this.seekInput.type = "range";
    this.seekInput.className = "battle-x-debug-replay__seek";
    this.seekInput.min = "0";
    this.seekInput.step = "1";
    this.seekInput.value = "0";
    this.seekInput.addEventListener("input", () => {
      this.followLatest = false;
      this.selectedIndex = Number(this.seekInput?.value ?? 0);
      this.applySelectedFrame();
      this.updateReplayControls();
    });

    seekWrap.append(this.seekMarkersEl, this.seekInput);

    this.replayInfoEl = document.createElement("div");
    this.replayInfoEl.className = "battle-x-debug-replay__info";

    this.replayPanel.append(toolbar, seekWrap, this.replayInfoEl);
    parent.appendChild(this.replayPanel);
  }

  private createReplayButton(
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-x-debug-replay__button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private updateReplayControls(): void {
    if (!this.replayPanel || !this.seekInput || !this.replayInfoEl) return;

    const latestIndex = this.replayBuffer.latestIndex;
    const frame =
      this.replayBuffer.getFrame(this.selectedIndex) ?? this.liveFrame;
    const warningCount = this.replayBuffer.collectWarningIndices().length;

    this.seekInput.max = String(Math.max(0, latestIndex));
    this.seekInput.value = String(this.selectedIndex);
    this.seekInput.disabled = this.replayBuffer.size <= 0;

    if (this.pauseButton) {
      this.pauseButton.textContent = this.followLatest ? "Pause" : "Resume";
    }
    if (this.followButton) {
      this.followButton.disabled = this.followLatest;
    }

    this.renderSeekMarkers(latestIndex);

    const modeLabel = this.followLatest ? "live" : "paused";
    const engineLabel = this.followLatest ? "running" : "frozen";
    const tickLabel = frame
      ? `${frame.tickIndex} / ${latestIndex >= 0 ? this.replayBuffer.getFrame(latestIndex)?.tickIndex ?? frame.tickIndex : frame.tickIndex}`
      : "-";
    const timeLabel = frame ? `${frame.battleTimeSec.toFixed(2)}s` : "-";
    const waveLabel = frame ? `W${frame.waveIndex + 1}` : "-";
    const phaseLabel = frame?.runtimePhase ?? "-";
    const warningLabel =
      frame?.hasWarning || frame?.traceEntries.some((entry) => entry.warning)
        ? "yes"
        : "no";

    this.replayInfoEl.textContent = [
      `mode=${modeLabel}`,
      `engine=${engineLabel}`,
      `frame=${this.selectedIndex + 1}/${Math.max(1, this.replayBuffer.size)}`,
      `tick=${tickLabel}`,
      `time=${timeLabel}`,
      `wave=${waveLabel}`,
      `phase=${phaseLabel}`,
      `warnings=${warningCount}`,
      `frameWarn=${warningLabel}`,
    ].join("  ·  ");
  }

  private renderSeekMarkers(latestIndex: number): void {
    if (!this.seekMarkersEl) return;
    this.seekMarkersEl.replaceChildren();
    if (latestIndex <= 0) return;

    const warnings = this.replayBuffer.collectWarningIndices();
    for (const index of warnings) {
      const marker = document.createElement("span");
      marker.className = "battle-x-debug-replay__seek-marker";
      marker.style.left = `${(index / latestIndex) * 100}%`;
      marker.title = `warning @ frame ${index + 1}`;
      this.seekMarkersEl.appendChild(marker);
    }
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

  private mountTraceTable(parent: HTMLElement): void {
    const panel = document.createElement("div");
    panel.className = "battle-x-debug-trace";

    const title = document.createElement("div");
    title.className = "battle-x-debug-trace__title";
    title.textContent = "battleX 更新内訳（selected tick）";

    const table = document.createElement("table");
    table.className = "battle-x-debug-trace__table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of [
      "unit",
      "side",
      "reason",
      "before",
      "after",
      "delta",
      "time",
      "details",
    ]) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    this.tableBody = document.createElement("tbody");
    table.appendChild(this.tableBody);
    panel.append(title, table);
    parent.appendChild(panel);
  }

  private renderTraceTable(): void {
    if (!this.tableBody) return;
    this.tableBody.replaceChildren();
    const rows = this.selectedTraceEntries.filter(isBattleXTraceTableRowVisible);
    if (rows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.className = "battle-x-debug-trace__empty";
      cell.textContent = "no trace rows on selected tick";
      row.appendChild(cell);
      this.tableBody.appendChild(row);
      return;
    }

    for (const entry of rows) {
      const row = document.createElement("tr");
      if (entry.warning) {
        row.classList.add("battle-x-debug-trace__row--warning");
      }
      if (isBattleXTraceApproachIdleRow(entry)) {
        row.classList.add("battle-x-debug-trace__row--approach-idle");
      }
      const detailsText = formatBattleXTraceDetails(entry);
      row.title = detailsText;
      for (const value of [
        entry.unitName || entry.unitId,
        entry.isEnemy ? "enemy" : "ally",
        entry.reason,
        this.formatPx(entry.beforeX),
        this.formatPx(entry.afterX),
        this.formatSignedPx(entry.deltaX),
        `${entry.tickIndex} / ${entry.battleTimeSec.toFixed(2)}s`,
        detailsText,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (value === detailsText) {
          cell.className = "battle-x-debug-trace__details";
        }
        row.appendChild(cell);
      }
      this.tableBody.appendChild(row);
    }
  }

  private formatPx(value: number): string {
    return value.toFixed(1);
  }

  private formatSignedPx(value: number): string {
    const formatted = this.formatPx(value);
    return value > 0 ? `+${formatted}` : formatted;
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
    const frame =
      this.replayBuffer.getFrame(this.selectedIndex) ?? this.liveFrame;
    ctx.fillStyle = "#d9e4f5";
    ctx.fillText("battleX debug", 10, 14);
    ctx.fillStyle = "#9fb0c8";
    const mode = this.followLatest ? "live" : "paused";
    const tickLabel = frame ? `tick ${frame.tickIndex}` : "tick -";
    ctx.fillText(`${mode} · ${tickLabel}`, 110, 14);
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

type BattleXDebugTraceEntryView = NonNullable<
  BattleSnapshot["battleXDebugTickTrace"]
>[number];
