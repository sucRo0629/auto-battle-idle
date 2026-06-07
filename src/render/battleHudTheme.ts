export interface BattleHudTheme {
  iconSize: number;
  barW: number;
  iconBarGap: number;
  barSkillGap: number;
  bottomMargin: number;
  headerFontSize: number;
  expBarH: number;
  headerBlockGap: number;
  expHpGap: number;
  recastBarH: number;
  recastGap: number;
  fontFamily: string;
  iconBorder: string;
  nameColor: string;
  expBarFill: string;
  hpBarFill: string;
  enemyHpBarFill: string;
  barBorder: string;
  barTrack: string;
  skillRecastTrack: string;
  skillRecastCharging: string;
  skillRecastReady: string;
  iconFrame: string;
}

function readNumber(
  style: CSSStyleDeclaration,
  name: string,
  fallback: number,
): number {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readString(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  const raw = style.getPropertyValue(name).trim();
  return raw || fallback;
}

export function readBattleHudTheme(host: HTMLElement): BattleHudTheme {
  const style = getComputedStyle(host);

  return {
    iconSize: readNumber(style, '--hud-icon-size', 24),
    barW: readNumber(style, '--hud-bar-w', 80),
    iconBarGap: readNumber(style, '--hud-icon-bar-gap', 4),
    barSkillGap: readNumber(style, '--hud-bar-skill-gap', 2),
    bottomMargin: readNumber(style, '--hud-bottom-margin', 5),
    headerFontSize: readNumber(style, '--hud-header-font-size', 9),
    expBarH: readNumber(style, '--hud-exp-bar-h', 4),
    headerBlockGap: readNumber(style, '--hud-header-block-gap', 2),
    expHpGap: readNumber(style, '--hud-exp-hp-gap', 2),
    recastBarH: readNumber(style, '--hud-recast-bar-h', 3),
    recastGap: readNumber(style, '--hud-recast-gap', 1),
    fontFamily: readString(
      style,
      '--hud-font-family',
      "'Segoe UI', system-ui, sans-serif",
    ),
    iconBorder: readString(style, '--hud-icon-border', '#4a5568'),
    nameColor: readString(style, '--hud-name-color', '#ffffff'),
    expBarFill: readString(style, '--hud-exp-bar-fill', '#f5a623'),
    hpBarFill: readString(style, '--hud-hp-bar-fill', '#2ecc71'),
    enemyHpBarFill: readString(style, '--hud-enemy-hp-bar-fill', '#e74c3c'),
    barBorder: readString(style, '--hud-bar-border', '#1a1a1a'),
    barTrack: readString(style, '--hud-bar-track', '#333333'),
    skillRecastTrack: readString(style, '--hud-skill-recast-track', '#2a2a35'),
    skillRecastCharging: readString(
      style,
      '--hud-skill-recast-charging',
      '#5a6270',
    ),
    skillRecastReady: readString(style, '--hud-skill-recast-ready', '#9aa3b0'),
    iconFrame: readString(style, '--hud-icon-frame', '#1a1a1a'),
  };
}
