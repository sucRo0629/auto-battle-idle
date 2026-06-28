import { PLACEHOLDER_SPRITE_KEYS } from "../battle/classVisuals.ts";
import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";
import { ENEMY_DEFAULT_SPRITE_KEY } from "./SpriteRegistry.ts";

export interface BattleHudTheme {
  iconSize: number;
  barW: number;
  iconBarGap: number;
  barSkillGap: number;
  bottomMargin: number;
  offsetY: number;
  backdropColor: string;
  backdropPadX: number;
  backdropPadY: number;
  backdropPadBottom: number;
  headerFontSize: number;
  expBarH: number;
  headerBlockGap: number;
  expHpGap: number;
  recastBarH: number;
  recastGap: number;
  fontFamily: string;
  iconBorder: string;
  nameColor: string;
  epithetColor: string;
  expBarFill: string;
  hpBarFill: string;
  barrierFill: string;
  barrierOverflowFill: string;
  enemyHpBarFill: string;
  enemyBarrierFill: string;
  enemyBarrierOverflowFill: string;
  barBorder: string;
  barTrack: string;
  skillRecastTrack: string;
  skillRecastCharging: string;
  skillRecastReady: string;
  iconFrame: string;
  statusBadgeIconSize: number;
  statusBadgeOverlap: number;
  popupFontSize: number;
  popupOutlineWidth: number;
  popupFontFamily: string;
  popupDamageFill: string;
  popupDamageStroke: string;
  popupDotFill: string;
  popupDotStroke: string;
  popupPoisonDotFill: string;
  popupPoisonDotStroke: string;
  popupHealFill: string;
  popupHealStroke: string;
  sceneSkyFill: string;
  sceneGroundFill: string;
  sceneGroundStroke: string;
  sceneGroundStrokeWidth: number;
  deadAlpha: number;
  enemyHpBarOutline: string;
  enemyHpBarOutlineWidth: number;
  victoryFontSize: number;
  victoryFill: string;
  victoryStroke: string;
  victoryOutlineWidth: number;
  attackSlashPrimary: string;
  attackSlashSecondary: string;
  attackSlashPrimaryWidth: number;
  attackSlashSecondaryWidth: number;
  attackHealPrimary: string;
  attackHealSecondary: string;
  attackHealPrimaryWidth: number;
  attackHealSecondaryWidth: number;
  attackHealPeakAlpha: number;
  attackOrbFill: string;
  attackOrbHighlight: string;
  attackOrbAlpha: number;
  attackOrbHighlightAlpha: number;
  attackArrowShaft: string;
  attackArrowTip: string;
  attackChainLightningCore: string;
  attackChainLightningGlow: string;
  attackChainLightningTail: string;
  attackChainLightningCoreAlpha: number;
  attackChainLightningGlowAlpha: number;
  attackChainLightningTailAlpha: number;
  attackImpaleShaft: string;
  attackImpaleTip: string;
  statusBadgeOverlay: string;
  statusIconOutlineColor: string;
  statusIconOutlineWidth: number;
  statusIconFallbackAlpha: number;
  hurtTintR: number;
  hurtTintG: number;
  hurtTintB: number;
  hurtTintStrength: number;
  buffGlowR: number;
  buffGlowG: number;
  buffGlowB: number;
  buffGlowPeak: number;
  spriteDefender: string;
  spriteAttackerMelee: string;
  spriteSupporter: string;
  spriteAttackerRanged: string;
  spriteEnemyDefault: string;
  spriteDefault: string;
  iconDefender: string;
  iconAttackerMelee: string;
  iconSupporter: string;
  iconAttackerRanged: string;
  iconDefault: string;
  statusIconHp: string;
  statusIconAtk: string;
  statusIconDef: string;
  statusIconReg: string;
  statusIconAttackSpeed: string;
  statusIconDamageReduction: string;
  statusIconDamageIncrease: string;
  statusIconHot: string;
  statusIconDot: string;
  statusIconBlock: string;
  statusIconCounter: string;
  statusIconStun: string;
  statusIconMoveLock: string;
  statusIconDamageDelay: string;
}

function readNumber(
  style: CSSStyleDeclaration,
  name: string,
  fallback: number
): number {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readString(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string
): string {
  const raw = style.getPropertyValue(name).trim();
  return raw || fallback;
}

export function readBattleHudTheme(host: HTMLElement): BattleHudTheme {
  const style = getComputedStyle(host);

  return {
    iconSize: readNumber(style, "--hud-icon-size", 24),
    barW: readNumber(style, "--hud-bar-w", 80),
    iconBarGap: readNumber(style, "--hud-icon-bar-gap", 4),
    barSkillGap: readNumber(style, "--hud-bar-skill-gap", 2),
    bottomMargin: readNumber(style, "--hud-bottom-margin", 5),
    offsetY: readNumber(style, "--hud-offset-y", 0),
    backdropColor: readString(
      style,
      "--hud-backdrop-color",
      "rgba(0, 0, 0, 0.45)"
    ),
    backdropPadX: readNumber(style, "--hud-backdrop-pad-x", 6),
    backdropPadY: readNumber(style, "--hud-backdrop-pad-y", 4),
    backdropPadBottom: readNumber(
      style,
      "--hud-backdrop-pad-bottom",
      readNumber(style, "--hud-backdrop-pad-y", 4)
    ),
    headerFontSize: readNumber(style, "--hud-header-font-size", 13),
    expBarH: readNumber(style, "--hud-exp-bar-h", 4),
    headerBlockGap: readNumber(style, "--hud-header-block-gap", 2),
    expHpGap: readNumber(style, "--hud-exp-hp-gap", 2),
    recastBarH: readNumber(style, "--hud-recast-bar-h", 3),
    recastGap: readNumber(style, "--hud-recast-gap", 1),
    fontFamily: readString(
      style,
      "--hud-font-family",
      "'Segoe UI', system-ui, sans-serif"
    ),
    iconBorder: readString(style, "--hud-icon-border", "#4a5568"),
    nameColor: readString(style, "--hud-name-color", "#ffffff"),
    epithetColor: readString(
      style,
      "--hud-epithet-color",
      "rgba(255,255,255,0.65)"
    ),
    expBarFill: readString(style, "--hud-exp-bar-fill", "#f5a623"),
    hpBarFill: readString(style, "--hud-hp-bar-fill", "#2ecc71"),
    barrierFill: readString(style, "--hud-barrier-fill", "#7bed9f"),
    barrierOverflowFill: readString(
      style,
      "--hud-barrier-overflow-fill",
      "#d5f5e3"
    ),
    enemyHpBarFill: readString(style, "--hud-enemy-hp-bar-fill", "#e74c3c"),
    enemyBarrierFill: readString(style, "--enemy-barrier-fill", "#ff8a80"),
    enemyBarrierOverflowFill: readString(
      style,
      "--enemy-barrier-overflow-fill",
      "#ffcdd2"
    ),
    barBorder: readString(style, "--hud-bar-border", "#1a1a1a"),
    barTrack: readString(style, "--hud-bar-track", "#333333"),
    skillRecastTrack: readString(style, "--hud-skill-recast-track", "#2a2a35"),
    skillRecastCharging: readString(
      style,
      "--hud-skill-recast-charging",
      "#5a6270"
    ),
    skillRecastReady: readString(style, "--hud-skill-recast-ready", "#9aa3b0"),
    iconFrame: readString(style, "--hud-icon-frame", "#1a1a1a"),
    statusBadgeIconSize: readNumber(style, "--status-badge-icon-size", 20),
    statusBadgeOverlap: readNumber(style, "--status-badge-overlap", 0),
    popupFontSize: readNumber(style, "--popup-font-size", 20),
    popupOutlineWidth: readNumber(style, "--popup-outline-width", 1),
    popupFontFamily: readString(
      style,
      "--popup-font-family",
      "'Segoe UI', system-ui, sans-serif"
    ),
    popupDamageFill: readString(style, "--popup-damage-fill", "#ffffff"),
    popupDamageStroke: readString(style, "--popup-damage-stroke", "#000000"),
    popupDotFill: readString(style, "--popup-dot-fill", "#ff3333"),
    popupDotStroke: readString(style, "--popup-dot-stroke", "#000000"),
    popupPoisonDotFill: readString(
      style,
      "--popup-poison-dot-fill",
      "#9933ff",
    ),
    popupPoisonDotStroke: readString(
      style,
      "--popup-poison-dot-stroke",
      "#000000",
    ),
    popupHealFill: readString(style, "--popup-heal-fill", "#2ecc71"),
    popupHealStroke: readString(style, "--popup-heal-stroke", "#1a3d24"),
    sceneSkyFill: readString(style, "--scene-sky-fill", "#87ceeb"),
    sceneGroundFill: readString(style, "--scene-ground-fill", "#4aa83f"),
    sceneGroundStroke: readString(style, "--scene-ground-stroke", "#2d3a4f"),
    sceneGroundStrokeWidth: readNumber(style, "--scene-ground-stroke-width", 2),
    deadAlpha: readNumber(style, "--dead-alpha", 0.35),
    enemyHpBarOutline: readString(style, "--enemy-hp-bar-outline", "#000000"),
    enemyHpBarOutlineWidth: readNumber(
      style,
      "--enemy-hp-bar-outline-width",
      1
    ),
    victoryFontSize: readNumber(style, "--victory-font-size", 48),
    victoryFill: readString(style, "--victory-fill", "#ffffff"),
    victoryStroke: readString(style, "--victory-stroke", "rgba(0, 0, 0, 0.65)"),
    victoryOutlineWidth: readNumber(style, "--victory-outline-width", 3),
    attackSlashPrimary: readString(style, "--attack-slash-primary", "#ffffff"),
    attackSlashSecondary: readString(
      style,
      "--attack-slash-secondary",
      "#8ecfff"
    ),
    attackSlashPrimaryWidth: readNumber(
      style,
      "--attack-slash-primary-width",
      3
    ),
    attackSlashSecondaryWidth: readNumber(
      style,
      "--attack-slash-secondary-width",
      2
    ),
    attackHealPrimary: readString(style, "--attack-heal-primary", "#2ecc71"),
    attackHealSecondary: readString(
      style,
      "--attack-heal-secondary",
      "#7bed9f"
    ),
    attackHealPrimaryWidth: readNumber(
      style,
      "--attack-heal-primary-width",
      2.5
    ),
    attackHealSecondaryWidth: readNumber(
      style,
      "--attack-heal-secondary-width",
      2
    ),
    attackHealPeakAlpha: readNumber(style, "--attack-heal-peak-alpha", 0.95),
    attackOrbFill: readString(style, "--attack-orb-fill", "#74b9ff"),
    attackOrbHighlight: readString(style, "--attack-orb-highlight", "#ffffff"),
    attackOrbAlpha: readNumber(style, "--attack-orb-alpha", 0.85),
    attackOrbHighlightAlpha: readNumber(
      style,
      "--attack-orb-highlight-alpha",
      0.45
    ),
    attackArrowShaft: readString(style, "--attack-arrow-shaft", "#c8a165"),
    attackArrowTip: readString(style, "--attack-arrow-tip", "#8b6914"),
    attackChainLightningCore: readString(
      style,
      "--attack-chain-lightning-core",
      "#fff9c4"
    ),
    attackChainLightningGlow: readString(
      style,
      "--attack-chain-lightning-glow",
      "#5b6cff"
    ),
    attackChainLightningTail: readString(
      style,
      "--attack-chain-lightning-tail",
      "#8fa8ff"
    ),
    attackChainLightningCoreAlpha: readNumber(
      style,
      "--attack-chain-lightning-core-alpha",
      0.95
    ),
    attackChainLightningGlowAlpha: readNumber(
      style,
      "--attack-chain-lightning-glow-alpha",
      0.8
    ),
    attackChainLightningTailAlpha: readNumber(
      style,
      "--attack-chain-lightning-tail-alpha",
      0.85
    ),
    attackImpaleShaft: readString(style, "--attack-impale-shaft", "#b8c4ce"),
    attackImpaleTip: readString(style, "--attack-impale-tip", "#5d6d7e"),
    statusBadgeOverlay: readString(
      style,
      "--status-badge-overlay",
      "rgba(0, 0, 0, 0.55)"
    ),
    statusIconOutlineColor: readString(
      style,
      "--status-icon-outline-color",
      "#000000"
    ),
    statusIconOutlineWidth: readNumber(style, "--status-icon-outline-width", 1),
    statusIconFallbackAlpha: readNumber(
      style,
      "--status-icon-fallback-alpha",
      0.35
    ),
    hurtTintR: readNumber(style, "--hurt-tint-r", 255),
    hurtTintG: readNumber(style, "--hurt-tint-g", 0),
    hurtTintB: readNumber(style, "--hurt-tint-b", 0),
    hurtTintStrength: readNumber(style, "--hurt-tint-strength", 0.35),
    buffGlowR: readNumber(style, "--buff-glow-r", 255),
    buffGlowG: readNumber(style, "--buff-glow-g", 255),
    buffGlowB: readNumber(style, "--buff-glow-b", 255),
    buffGlowPeak: readNumber(style, "--buff-glow-peak", 0.55),
    spriteDefender: readString(style, "--sprite-defender", "#4a90d9"),
    spriteAttackerMelee: readString(
      style,
      "--sprite-attacker-melee",
      "#e67e22"
    ),
    spriteSupporter: readString(style, "--sprite-supporter", "#2ecc71"),
    spriteAttackerRanged: readString(
      style,
      "--sprite-attacker-ranged",
      "#e74c3c"
    ),
    spriteEnemyDefault: readString(style, "--sprite-enemy-default", "#888888"),
    spriteDefault: readString(style, "--sprite-default", "#888888"),
    iconDefender: readString(style, "--icon-defender", "#2c5f9e"),
    iconAttackerMelee: readString(style, "--icon-attacker-melee", "#c0392b"),
    iconSupporter: readString(style, "--icon-supporter", "#1e8449"),
    iconAttackerRanged: readString(style, "--icon-attacker-ranged", "#922b21"),
    iconDefault: readString(style, "--icon-default", "#888888"),
    statusIconHp: readString(style, "--status-icon-hp", "#e74c3c"),
    statusIconAtk: readString(style, "--status-icon-atk", "#c0392b"),
    statusIconDef: readString(style, "--status-icon-def", "#2980b9"),
    statusIconReg: readString(style, "--status-icon-reg", "#9b59b6"),
    statusIconAttackSpeed: readString(
      style,
      "--status-icon-attack-speed",
      "#1abc9c"
    ),
    statusIconDamageReduction: readString(
      style,
      "--status-icon-damage-reduction",
      "#27ae60"
    ),
    statusIconDamageIncrease: readString(
      style,
      "--status-icon-damage-increase",
      "#d35400"
    ),
    statusIconHot: readString(style, "--status-icon-hot", "#27ae60"),
    statusIconDot: readString(style, "--status-icon-dot", "#8e44ad"),
    statusIconBlock: readString(style, "--status-icon-block", "#7f8c8d"),
    statusIconCounter: readString(style, "--status-icon-counter", "#e67e22"),
    statusIconStun: readString(style, "--status-icon-stun", "#f1c40f"),
    statusIconMoveLock: readString(style, "--status-icon-move-lock", "#e67e22"),
    statusIconDamageDelay: readString(
      style,
      "--status-icon-damage-delay",
      "#16a085"
    ),
  };
}

export function resolveSpritePlaceholderColor(
  spriteKey: string,
  theme: BattleHudTheme
): string {
  const colors: Record<string, string> = {
    [PLACEHOLDER_SPRITE_KEYS.defender]: theme.spriteDefender,
    [PLACEHOLDER_SPRITE_KEYS.supporter]: theme.spriteSupporter,
    [PLACEHOLDER_SPRITE_KEYS.attackerGeneral]: theme.spriteAttackerMelee,
    [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: theme.spriteAttackerMelee,
    [PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical]:
      theme.spriteAttackerRanged,
    [PLACEHOLDER_SPRITE_KEYS.attackerRangedMagic]: theme.spriteAttackerRanged,
    [ENEMY_DEFAULT_SPRITE_KEY]: theme.spriteEnemyDefault,
  };
  return colors[spriteKey] ?? theme.spriteDefault;
}

export function resolveClassIconPlaceholderColor(
  iconKey: string,
  theme: BattleHudTheme
): string {
  const colors: Record<string, string> = {
    [PLACEHOLDER_SPRITE_KEYS.defender]: theme.iconDefender,
    [PLACEHOLDER_SPRITE_KEYS.supporter]: theme.iconSupporter,
    [PLACEHOLDER_SPRITE_KEYS.attackerGeneral]: theme.iconAttackerMelee,
    [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: theme.iconAttackerMelee,
    [PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical]: theme.iconAttackerRanged,
    [PLACEHOLDER_SPRITE_KEYS.attackerRangedMagic]: theme.iconAttackerRanged,
  };
  return colors[iconKey] ?? theme.iconDefault;
}

export function resolveStatusIconFallbackColor(
  category: StatusDisplayCategory,
  theme: BattleHudTheme
): string {
  const colors: Record<StatusDisplayCategory, string> = {
    hp: theme.statusIconHp,
    atk: theme.statusIconAtk,
    def: theme.statusIconDef,
    reg: theme.statusIconReg,
    attackSpeed: theme.statusIconAttackSpeed,
    damageReduction: theme.statusIconDamageReduction,
    damageIncrease: theme.statusIconDamageIncrease,
    hot: theme.statusIconHot,
    dot: theme.statusIconDot,
    bleed: theme.statusIconDot,
    poison: theme.statusIconDot,
    evasion: theme.statusIconBlock,
    block: theme.statusIconBlock,
    counter: theme.statusIconCounter,
    stun: theme.statusIconStun,
    moveLock: theme.statusIconMoveLock,
    damageDelay: theme.statusIconDamageDelay,
    healReservation: theme.statusIconHot,
    wardBarrier: theme.statusIconBlock,
    herbalPotency: theme.statusIconHot,
    blockResonance: theme.statusIconBlock,
    blockResonanceStance: theme.statusIconDef,
    basicAttackTransform: theme.statusIconAtk,
    invulnerable: theme.statusIconStun,
    lastStandGuts: theme.statusIconCounter,
    arenaDominance: theme.statusIconAtk,
    duelistPride: theme.statusIconDamageIncrease,
    windMark: theme.statusIconHot,
    earthMark: theme.statusIconDef,
    arenaMark: theme.statusIconDamageIncrease,
    seedFlame: theme.statusIconDot,
    blazingFlame: theme.statusIconDamageIncrease,
    ballistaMark: theme.statusIconDamageIncrease,
    allyAttackFollowUp: theme.statusIconCounter,
    poisonWeapon: theme.statusIconDot,
    nextOutgoingDamage: theme.statusIconAtk,
  };
  return colors[category];
}
