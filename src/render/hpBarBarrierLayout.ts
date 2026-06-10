export interface HpBarBarrierSegment {
  x: number;
  width: number;
}

export interface HpBarBarrierLayout {
  hpWidth: number;
  tier1: HpBarBarrierSegment[];
}

/** HP バー + バリア tier1 のピクセル配置（Canvas fillRect 用） */
export function layoutHpBarBarrier(
  x: number,
  barW: number,
  hp: number,
  maxHp: number,
  barrierHp: number,
): HpBarBarrierLayout | null {
  if (maxHp <= 0) return null;

  const hpPx = hp >= maxHp ? barW : Math.floor((barW * Math.max(0, hp)) / maxHp);
  if (barrierHp <= 0) {
    return { hpWidth: hpPx, tier1: [] };
  }

  const tier1Px = Math.max(
    1,
    Math.ceil((barW * Math.min(barrierHp, maxHp)) / maxHp),
  );

  if (hp >= maxHp) {
    return {
      hpWidth: hpPx,
      tier1: [{ x, width: tier1Px }],
    };
  }

  const tier1X = x + hpPx;
  const inTrackPx = Math.max(0, barW - hpPx);
  const inBarPx = Math.min(tier1Px, inTrackPx);
  const pastBarPx = tier1Px - inBarPx;
  const tier1: HpBarBarrierSegment[] = [];
  if (inBarPx > 0) {
    tier1.push({ x: tier1X, width: inBarPx });
  }
  if (pastBarPx > 0) {
    tier1.push({ x, width: pastBarPx });
  }
  return { hpWidth: hpPx, tier1 };
}
