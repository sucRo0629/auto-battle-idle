let spriteBuffer: HTMLCanvasElement | null = null;

/** 透過を保持したままスプライトに被ダメージの赤みを付けて描画する */
export function drawSpriteWithDamageEffect(
  targetCtx: CanvasRenderingContext2D,
  size: number,
  drawSprite: (ctx: CanvasRenderingContext2D) => void,
  tintStrength: number,
  tintR: number,
  tintG: number,
  tintB: number,
): void {
  const pixelSize = Math.ceil(size);
  const bufferCtx = getSpriteBuffer(pixelSize);
  drawSprite(bufferCtx);
  applyHurtTint(bufferCtx, pixelSize, tintStrength, tintR, tintG, tintB);
  targetCtx.drawImage(
    spriteBuffer!,
    0,
    0,
    pixelSize,
    pixelSize,
    0,
    0,
    size,
    size
  );
}

function getSpriteBuffer(size: number): CanvasRenderingContext2D {
  if (!spriteBuffer) {
    spriteBuffer = document.createElement("canvas");
  }

  spriteBuffer.width = size;
  spriteBuffer.height = size;

  const ctx = spriteBuffer.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.clearRect(0, 0, size, size);
  return ctx;
}

function applyHurtTint(
  ctx: CanvasRenderingContext2D,
  size: number,
  tintStrength: number,
  tintR: number,
  tintG: number,
  tintB: number,
): void {
  const strength = Math.max(0, Math.min(1, tintStrength));
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    data[i] = Math.round(data[i] * (1 - strength) + tintR * strength);
    data[i + 1] = Math.round(data[i + 1] * (1 - strength) + tintG * strength);
    data[i + 2] = Math.round(data[i + 2] * (1 - strength) + tintB * strength);
  }

  ctx.putImageData(imageData, 0, 0);
}
