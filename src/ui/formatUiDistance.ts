/** プレイヤー向け UI: 内部 px を単位なし数値へ（px / 10） */
export function formatUiDistanceValue(px: number): string {
  const value = Math.round((px / 10) * 10) / 10;
  return Object.is(value, -0) ? "0" : `${value}`;
}

export function formatSignedUiDistanceValue(px: number): string {
  const sign = px > 0 ? "+" : "";
  return `${sign}${formatUiDistanceValue(px)}`;
}
