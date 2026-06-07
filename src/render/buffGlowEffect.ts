const BUFF_GLOW_DURATION_MS = 800;

let spriteBuffer: HTMLCanvasElement | null = null;

/** 透過を保持したままスプライトを白く光らせて描画する */
export function drawSpriteWithBuffGlow(
  targetCtx: CanvasRenderingContext2D,
  size: number,
  intensity: number,
  drawSprite: (ctx: CanvasRenderingContext2D) => void,
  glowR: number,
  glowG: number,
  glowB: number,
): void {
  if (intensity <= 0) {
    drawSprite(targetCtx);
    return;
  }

  const pixelSize = Math.ceil(size);
  const bufferCtx = getSpriteBuffer(pixelSize);
  drawSprite(bufferCtx);
  applyBuffGlow(bufferCtx, pixelSize, intensity, glowR, glowG, glowB);
  targetCtx.drawImage(
    spriteBuffer!,
    0,
    0,
    pixelSize,
    pixelSize,
    0,
    0,
    size,
    size,
  );
}

function getSpriteBuffer(size: number): CanvasRenderingContext2D {
  if (!spriteBuffer) {
    spriteBuffer = document.createElement('canvas');
  }

  spriteBuffer.width = size;
  spriteBuffer.height = size;

  const ctx = spriteBuffer.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  ctx.clearRect(0, 0, size, size);
  return ctx;
}

function applyBuffGlow(
  ctx: CanvasRenderingContext2D,
  size: number,
  intensity: number,
  glowR: number,
  glowG: number,
  glowB: number,
): void {
  const strength = Math.max(0, Math.min(1, intensity));
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    data[i] = Math.round(data[i] * (1 - strength) + glowR * strength);
    data[i + 1] = Math.round(data[i + 1] * (1 - strength) + glowG * strength);
    data[i + 2] = Math.round(data[i + 2] * (1 - strength) + glowB * strength);
  }

  ctx.putImageData(imageData, 0, 0);
}

export class BuffGlowManager {
  private readonly glows = new Map<string, number>();

  trigger(combatantId: string): void {
    this.glows.set(combatantId, BUFF_GLOW_DURATION_MS);
  }

  tick(deltaMs: number): void {
    for (const [id, remaining] of this.glows) {
      const next = remaining - deltaMs;
      if (next <= 0) {
        this.glows.delete(id);
      } else {
        this.glows.set(id, next);
      }
    }
  }

  getIntensity(combatantId: string, peak: number): number {
    const remaining = this.glows.get(combatantId);
    if (!remaining) return 0;
    const t = remaining / BUFF_GLOW_DURATION_MS;
    return t * peak;
  }
}
