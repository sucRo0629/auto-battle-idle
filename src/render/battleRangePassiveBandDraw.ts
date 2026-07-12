import type { AllyRangePassiveBand } from '../battle/allyRangePassiveBands.ts';
import { resolveAllyRangePassiveBandInterval } from '../battle/allyRangePassiveBands.ts';
import type { BattleHudTheme } from './battleHudTheme.ts';

const BAND_HEIGHT_PX = 6;

export function battleXToScreenX(battleX: number): number {
  return battleX;
}

export function drawAllyRangePassiveBands(
  ctx: CanvasRenderingContext2D,
  bands: readonly AllyRangePassiveBand[],
  groundLineY: number,
  theme: BattleHudTheme,
): void {
  if (bands.length === 0) return;

  const fill = theme.allyRangePassiveBandFill ?? 'rgba(72, 140, 200, 0.18)';
  const stroke = theme.allyRangePassiveBandStroke ?? 'rgba(96, 168, 232, 0.45)';

  for (const band of bands) {
    const { minBattleX, maxBattleX } = resolveAllyRangePassiveBandInterval(band);
    const left = battleXToScreenX(minBattleX);
    const right = battleXToScreenX(maxBattleX);
    const width = Math.max(1, right - left);
    const top = groundLineY - BAND_HEIGHT_PX;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(left, top, width, BAND_HEIGHT_PX);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, width - 1, BAND_HEIGHT_PX - 1);
    ctx.restore();
  }
}
