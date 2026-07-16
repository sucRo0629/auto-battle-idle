import { resolveUnitAttackMethod } from "../data/resolveUnitAttackMethod.ts";
import {
  currentHpRatio,
  getEffectiveAtk,
  getEffectiveDef,
  getEffectiveMaxHp,
  getEffectiveRes,
} from "../combatMath.ts";
import {
  getBattleX,
  isPlayerHostileRearAssaultMoveEffect,
  isPlayerRearAssaultAccess,
} from "../combatPosition.ts";
import { hasMatchingStatus } from "../statusMatching.ts";
import { isArenaDominanceActive } from "../arenaDominance.ts";
import type {
  BuffFilterTag,
  CombatantState,
  DebuffFilterTag,
  GameData,
  PassiveSkillDef,
  SkillEffectDef,
  SkillHitTarget,
  MoveSkillEffect,
  TargetDistanceOrder,
  TargetRule,
  TargetRuleOverrideApplyTo,
  TargetSide,
  TargetSpec,
  TargetStat,
  TargetStatOrder,
} from "../types.ts";
import { TARGET_RULES } from "../data/gameDataSchema.ts";
import { DEBUFF_FILTER_TAG_OPTIONS } from "../data/gameDataSchema.ts";
import type { DangerTargetingRuntime } from "../dangerTargeting.ts";
import { resolveDangerTargets } from "../dangerTargeting.ts";

const TARGET_RULES_SET = new Set<string>(TARGET_RULES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function livingAllies(allies: CombatantState[]): CombatantState[] {
  return allies.filter((a) => a.isAlive);
}

function livingEnemies(enemies: CombatantState[]): CombatantState[] {
  return enemies.filter((e) => e.isAlive);
}

function targetRuleToSpec(
  rule: TargetRule,
  debuffTags?: DebuffFilterTag[]
): TargetSpec {
  switch (rule) {
    case "self":
      return { kind: "self" };
    case "allAllies":
      return { kind: "all", side: "ally" };
    case "allEnemies":
      return { kind: "all", side: "enemy" };
    case "closestAlly":
      return { kind: "distance", side: "ally", order: "nearest" };
    case "frontEnemy":
      return { kind: "distance", side: "enemy", order: "nearest" };
    case "farthestEnemy":
      return { kind: "distance", side: "enemy", order: "farthest" };
    case "lowestHpEnemy":
      return { kind: "stat", side: "enemy", stat: "hp", order: "lowest" };
    case "highestHpEnemy":
      return { kind: "stat", side: "enemy", stat: "hp", order: "highest" };
    case "mostDamagedAlly":
      return { kind: "stat", side: "ally", stat: "hp", order: "ratio" };
    case "highestAtkEnemy":
      return { kind: "stat", side: "enemy", stat: "atk", order: "highest" };
    case "lowestDefEnemy":
      return { kind: "stat", side: "enemy", stat: "def", order: "lowest" };
    case "highestDefEnemy":
      return { kind: "stat", side: "enemy", stat: "def", order: "highest" };
    case "lowestResEnemy":
      return { kind: "stat", side: "enemy", stat: "res", order: "lowest" };
    case "highestResEnemy":
      return { kind: "stat", side: "enemy", stat: "res", order: "highest" };
    case "rangedAttackingEnemy":
      return { kind: "attackType", ranged: true };
    case "magicAttackingEnemy":
      return { kind: "attackType", magic: true };
    case "debuffedEnemy":
      return {
        kind: "status",
        side: "enemy",
        debuffTags:
          debuffTags && debuffTags.length > 0
            ? debuffTags
            : [...DEBUFF_FILTER_TAG_OPTIONS],
      };
  }
}

function parseTargetSpecObject(raw: Record<string, unknown>): TargetSpec {
  const kind = raw.kind;
  if (kind === "self") return { kind: "self" };
  if (kind === "all") {
    const side = raw.side;
    if (side !== "ally" && side !== "enemy") {
      throw new Error("Invalid target.side");
    }
    return { kind: "all", side };
  }
  if (kind === "distance") {
    const side = raw.side;
    const order = raw.order;
    if (
      (side !== "ally" && side !== "enemy") ||
      (order !== "nearest" && order !== "farthest" && order !== "selfOrigin")
    ) {
      throw new Error("Invalid target.distance fields");
    }
    const includeSelf = raw.includeSelf === true ? true : undefined;
    return {
      kind: "distance",
      side,
      order,
      ...(includeSelf !== undefined ? { includeSelf } : {}),
    };
  }
  if (kind === "stat") {
    const side = raw.side;
    const stat = raw.stat;
    const order = raw.order;
    if (
      (side !== "ally" && side !== "enemy") ||
      (stat !== "hp" &&
        stat !== "maxHp" &&
        stat !== "atk" &&
        stat !== "def" &&
        stat !== "res") ||
      (order !== "highest" && order !== "lowest" && order !== "ratio")
    ) {
      throw new Error("Invalid target.stat fields");
    }
    if (order === "ratio" && stat !== "hp") {
      throw new Error("target.stat order ratio is only valid for hp");
    }
    const poolFromEffectIndex = raw.poolFromEffectIndex;
    if (
      poolFromEffectIndex !== undefined &&
      (typeof poolFromEffectIndex !== "number" ||
        !Number.isInteger(poolFromEffectIndex) ||
        poolFromEffectIndex < 0)
    ) {
      throw new Error("Invalid target.poolFromEffectIndex");
    }
    return {
      kind: "stat",
      side,
      stat,
      order,
      ...(poolFromEffectIndex !== undefined ? { poolFromEffectIndex } : {}),
    };
  }
  if (kind === "attackType") {
    const spec: TargetSpec = { kind: "attackType" };
    if (raw.physical === true) (spec as { physical?: boolean }).physical = true;
    if (raw.magic === true) (spec as { magic?: boolean }).magic = true;
    if (raw.melee === true) (spec as { melee?: boolean }).melee = true;
    if (raw.ranged === true) (spec as { ranged?: boolean }).ranged = true;
    const attackSpec = spec as Extract<TargetSpec, { kind: "attackType" }>;
    if (
      !attackSpec.physical &&
      !attackSpec.magic &&
      !attackSpec.melee &&
      !attackSpec.ranged
    ) {
      throw new Error("target.attackType requires at least one filter");
    }
    if (Array.isArray(raw.excludeRoles)) {
      attackSpec.excludeRoles = raw.excludeRoles as Extract<
        TargetSpec,
        { kind: "attackType" }
      >["excludeRoles"];
    }
    return attackSpec;
  }
  if (kind === "status") {
    const side = raw.side;
    if (side !== undefined && side !== "ally" && side !== "enemy") {
      throw new Error("Invalid target.status side");
    }
    const debuffTags = Array.isArray(raw.debuffTags)
      ? (raw.debuffTags as DebuffFilterTag[])
      : undefined;
    const buffTags = Array.isArray(raw.buffTags)
      ? (raw.buffTags as BuffFilterTag[])
      : undefined;
    if (
      (!debuffTags || debuffTags.length === 0) &&
      (!buffTags || buffTags.length === 0)
    ) {
      throw new Error("target.status requires debuffTags and/or buffTags");
    }
    return {
      kind: "status",
      ...(side !== undefined ? { side } : {}),
      ...(debuffTags && debuffTags.length > 0 ? { debuffTags } : {}),
      ...(buffTags && buffTags.length > 0 ? { buffTags } : {}),
    };
  }
  if (kind === "clusterCenter") {
    const side = raw.side;
    if (side !== "ally" && side !== "enemy") {
      throw new Error("Invalid target.clusterCenter side");
    }
    return { kind: "clusterCenter", side };
  }
  if (kind === "danger") {
    const side = raw.side;
    if (side !== "ally" && side !== "enemy") {
      throw new Error("Invalid target.danger side");
    }
    const maxTargets = raw.maxTargets;
    if (
      typeof maxTargets !== "number" ||
      !Number.isInteger(maxTargets) ||
      maxTargets < 1
    ) {
      throw new Error("Invalid target.danger maxTargets");
    }
    const windowSec = raw.windowSec;
    if (
      typeof windowSec !== "number" ||
      !Number.isFinite(windowSec) ||
      windowSec < 0
    ) {
      throw new Error("Invalid target.danger windowSec");
    }
    return { kind: "danger", side, maxTargets, windowSec };
  }
  throw new Error(`Unknown target.kind: ${String(kind)}`);
}

/** 旧 targetRule または新 target を TargetSpec に変換 */
export function normalizeTarget(
  raw: unknown,
  legacyRule?: TargetRule,
  legacyDebuffFilter?: DebuffFilterTag[]
): TargetSpec {
  if (isRecord(raw) && typeof raw.kind === "string") {
    return parseTargetSpecObject(raw);
  }
  if (typeof raw === "string" && TARGET_RULES_SET.has(raw)) {
    return targetRuleToSpec(raw as TargetRule, legacyDebuffFilter);
  }
  if (legacyRule !== undefined) {
    return targetRuleToSpec(legacyRule, legacyDebuffFilter);
  }
  return { kind: "distance", side: "enemy", order: "nearest" };
}

export function getEffectTarget(effect: {
  target?: TargetSpec;
  targetRule?: TargetRule;
  targetDebuffFilter?: DebuffFilterTag[];
}): TargetSpec {
  if (effect.target) return effect.target;
  return normalizeTarget(
    effect.targetRule,
    effect.targetRule,
    effect.targetDebuffFilter
  );
}

export interface TargetRuleContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
  /** attackType フィルタの attackMethod 解決に使用 */
  gameData?: Pick<GameData, 'skillRegistry' | 'combatModuleRegistry'>;
  /** 指定時は一致スコープの targetRuleOverride のみ適用 */
  applyScope?: TargetRuleOverrideApplyTo;
}

/** effect target の適用スコープ（spec.side は actor 視点。自己対象は self） */
export function targetSpecFaction(
  spec: TargetSpec,
  _actor: CombatantState
): TargetRuleOverrideApplyTo | "self" {
  if (spec.kind === "self") return "self";
  if (spec.kind === "distance" || spec.kind === "stat" || spec.kind === "all") {
    return spec.side;
  }
  if (spec.kind === "attackType") {
    return "enemy";
  }
  if (spec.kind === "status" || spec.kind === "clusterCenter") {
    return spec.side ?? "enemy";
  }
  if (spec.kind === "danger") {
    return spec.side;
  }
  return "enemy";
}

/** パッシブ targetRuleOverride は候補がいるときだけ適用（射手排除など） */
export function resolveTargetSpec(
  passives: PassiveSkillDef[],
  defaultSpec: TargetSpec,
  context?: TargetRuleContext
): TargetSpec {
  for (let i = passives.length - 1; i >= 0; i--) {
    const passive = passives[i]!;
    if (
      passive.effect !== "targetRuleOverride" ||
      !passive.targetRuleOverride
    ) {
      continue;
    }
    const scope = passive.targetRuleOverrideApplyTo ?? "enemy";
    if (context?.applyScope !== undefined && scope !== context.applyScope) {
      continue;
    }
    const override = passive.targetRuleOverride;
    if (context) {
      const pool = getTargetPool(
        override,
        context.actor,
        context.allies,
        context.enemies,
        context.gameData,
      );
      if (pool.length > 0) return override;
      continue;
    }
    return override;
  }
  return defaultSpec;
}

function factionPool(
  side: TargetSide,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[]
): CombatantState[] {
  const alliesLive = livingAllies(allies);
  const enemiesLive = livingEnemies(enemies);
  if (actor.isEnemy) {
    return side === "ally" ? enemiesLive : alliesLive;
  }
  return side === "ally" ? alliesLive : enemiesLive;
}

export function matchesAttackType(
  unit: CombatantState,
  spec: Extract<TargetSpec, { kind: "attackType" }>,
  gameData?: Pick<GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): boolean {
  const damageFilters: boolean[] = [];
  if (spec.physical) {
    damageFilters.push(unit.traits.damageType === "physical");
  }
  if (spec.magic) {
    damageFilters.push(unit.traits.damageType === "magic");
  }
  const rangeFilters: boolean[] = [];
  const attackMethod =
    gameData !== undefined
      ? resolveUnitAttackMethod(unit, gameData)
      : undefined;
  if (spec.melee) {
    rangeFilters.push(attackMethod === "melee");
  }
  if (spec.ranged) {
    rangeFilters.push(attackMethod === "ranged");
  }

  const damageOk =
    damageFilters.length === 0 || damageFilters.some((value) => value);
  const rangeOk =
    rangeFilters.length === 0 || rangeFilters.some((value) => value);
  if (!damageOk || !rangeOk) return false;
  if (spec.excludeRoles?.includes(unit.role)) return false;
  return true;
}

function compareStat(unit: CombatantState, stat: TargetStat): number {
  switch (stat) {
    case "hp":
      return unit.hp;
    case "maxHp":
      return getEffectiveMaxHp(unit);
    case "atk":
      return getEffectiveAtk(unit);
    case "def":
      return getEffectiveDef(unit);
    case "res":
      return getEffectiveRes(unit);
  }
}

function isFrontlineAnchorSpec(spec: TargetSpec): boolean {
  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "nearest"
  ) {
    return true;
  }
  if (spec.kind === "attackType") return true;
  if (spec.kind === "status") return true;
  return false;
}

/** targetRule が参照する側の生存ユニット一覧（射程フィルタ前） */
export function getTargetPool(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData?: Pick<GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): CombatantState[] {
  if (spec.kind === "self") {
    return actor.isAlive ? [actor] : [];
  }

  if (spec.kind === "all") {
    return factionPool(spec.side, actor, allies, enemies);
  }

  if (spec.kind === "distance" || spec.kind === "stat") {
    return factionPool(spec.side, actor, allies, enemies);
  }

  if (spec.kind === "danger") {
    return factionPool(spec.side, actor, allies, enemies);
  }

  if (spec.kind === "attackType") {
    const pool = factionPool("enemy", actor, allies, enemies);
    if (actor.isEnemy) return pool;
    return pool.filter((unit) => matchesAttackType(unit, spec, gameData));
  }

  if (spec.kind === "status") {
    const side = spec.side ?? "enemy";
    const pool = factionPool(side, actor, allies, enemies);
    if (actor.isEnemy) return pool;
    return pool.filter((unit) =>
      hasMatchingStatus(unit, spec.debuffTags, spec.buffTags)
    );
  }

  return livingEnemies(enemies);
}

export function isMultiTargetSpec(spec: TargetSpec): boolean {
  return spec.kind === "all";
}

export function isSelfOriginSpec(spec: TargetSpec): boolean {
  return spec.kind === "distance" && spec.order === "selfOrigin";
}

export function distanceSpecIncludesSelf(spec: TargetSpec): boolean {
  return (
    spec.kind === "distance" &&
    spec.side === "ally" &&
    (spec.order === "selfOrigin" || spec.includeSelf === true)
  );
}

/** 自動接近・接敵停止用。selfOrigin は貫通の着弾基準であり追跡対象ではない */
export function resolveApproachTargetSpec(spec: TargetSpec): TargetSpec {
  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "selfOrigin"
  ) {
    return { kind: "distance", side: "enemy", order: "nearest" };
  }
  return spec;
}

export function applyIncludeSelfFilter(
  spec: TargetSpec,
  actor: CombatantState,
  targets: SkillHitTarget[]
): SkillHitTarget[] {
  if (spec.kind === "self") {
    return targets;
  }
  if (distanceSpecIncludesSelf(spec)) {
    return targets;
  }
  const filtered = targets.filter((entry) => entry.unit.id !== actor.id);
  if (filtered.length === 0 && targets.length > 0) {
    return targets;
  }
  return filtered;
}

export type PickTargetOptions = {
  /**
   * Target Intent: MoveAnchor.
   * MoveAnchor は移動の到達基準であり、AttackTarget / ChaseTarget とは別責務。
   * 至近/最遠は使用者との battleX 距離で決め、接近 chase の編成奥選択を使わない。
   */
  moveAnchor?: boolean;
  /**
   * 敵対 rear toAnchor（正 offset）の MoveAnchor。
   * battle-line 奥（max）ではなく、敵のプレイヤー寄り前衛（min battleX = contact）を anchor にする。
   */
  enemyFrontlineMoveAnchor?: boolean;
  /** heal 等：味方 stat / distance 対象で使用者を候補プールに含める */
  includeActorInAllyPool?: boolean;
  /** 単体攻撃ターゲット選定（闘技場の掟の強制ターゲット用） */
  singleTargetAttack?: boolean;
  /** kind: danger 解決に必要な runtime 状態 */
  dangerRuntime?: DangerTargetingRuntime;
};

/** 回復 effect は味方対象に使用者自身も含める。単体 damage は闘技場の掟判定用 */
export function pickOptionsForEffect(
  effect: SkillEffectDef | undefined
): PickTargetOptions | undefined {
  if (effect?.type === "heal") {
    return { includeActorInAllyPool: true };
  }
  if (
    effect?.type === "damage" &&
    (effect.targetShape ?? "single") === "single"
  ) {
    return { singleTargetAttack: true };
  }
  return undefined;
}

export function pickMoveAnchorOptions(
  actor: CombatantState,
  effect: SkillEffectDef,
): PickTargetOptions {
  return {
    moveAnchor: true,
    enemyFrontlineMoveAnchor: isPlayerHostileRearAssaultMoveEffect(
      actor,
      effect as MoveSkillEffect,
    ),
  };
}

function includeActorInAllyPool(options?: PickTargetOptions): boolean {
  return options?.includeActorInAllyPool === true;
}

/** 味方対象で自身を除いた後に候補が空なら、単独パーティ時は自身にフォールバック */
function allySelectablePool(
  pool: CombatantState[],
  actor: CombatantState,
  options?: PickTargetOptions
): CombatantState[] {
  if (includeActorInAllyPool(options)) {
    return pool.filter((unit) => unit.isAlive);
  }
  return allySelectableExcludingSelf(pool, actor);
}

/** 味方対象で自身を除いた後に候補が空なら、単独パーティ時は自身にフォールバック */
function allySelectableExcludingSelf(
  pool: CombatantState[],
  actor: CombatantState
): CombatantState[] {
  const others = pool.filter((unit) => unit.id !== actor.id);
  if (others.length > 0) return others;
  if (actor.isAlive && pool.some((unit) => unit.id === actor.id)) {
    return [actor];
  }
  return [];
}

function pickEnemyByActorDistance(
  actor: CombatantState,
  pool: CombatantState[],
  order: "nearest" | "farthest"
): CombatantState {
  const actorX = getBattleX(actor);
  return pool.reduce((a, b) => {
    const da = Math.abs(getBattleX(a) - actorX);
    const db = Math.abs(getBattleX(b) - actorX);
    if (da !== db) {
      return order === "nearest" ? (da < db ? a : b) : da > db ? a : b;
    }
    return a.id <= b.id ? a : b;
  });
}

function enemyForwardFacingPool(
  actor: CombatantState,
  pool: CombatantState[]
): CombatantState[] {
  const actorX = getBattleX(actor);
  return pool.filter((unit) => !isPlayerRearAssaultAccess(unit, actorX));
}

/** combat.md §敵対単体ターゲット選定 — デフォルト spec（distance/enemy/nearest） */
export function isDefaultHostileChaseSpec(spec: TargetSpec): boolean {
  return (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "nearest"
  );
}

export type EditorHostileTargetMode = "default" | "priority";

export const EDITOR_HOSTILE_TARGET_MODE_LABELS: Record<
  EditorHostileTargetMode,
  string
> = {
  default: "デフォルト（敵対単体共通ルール）",
  priority: "優先ターゲット",
};

export function defaultHostileChaseTargetSpec(): TargetSpec {
  return { kind: "distance", side: "enemy", order: "nearest" };
}

export function resolveEditorHostileTargetMode(
  spec: TargetSpec | undefined,
): EditorHostileTargetMode {
  if (spec === undefined) return "default";
  return isDefaultHostileChaseSpec(spec) ? "default" : "priority";
}

/** エディタ保存時: 敵対デフォルト spec は JSON から省略 */
export function sanitizeHostileTargetSpecForJson(
  spec: TargetSpec | undefined,
): TargetSpec | undefined {
  if (spec === undefined) return undefined;
  if (isDefaultHostileChaseSpec(spec)) return undefined;
  return spec;
}

/** 敵対 2 モード UI を出すか（自身・味方ターゲットは対象外） */
export function shouldUseHostileTargetEditorMode(spec: TargetSpec): boolean {
  if (spec.kind === "self") return false;
  if (
    spec.kind === "distance" ||
    spec.kind === "stat" ||
    spec.kind === "all" ||
    spec.kind === "clusterCenter"
  ) {
    return spec.side === "enemy";
  }
  return spec.kind === "attackType" || spec.kind === "status";
}

/** @deprecated use isDefaultHostileChaseSpec */
export function isDefaultEnemyChaseSpec(spec: TargetSpec): boolean {
  return isDefaultHostileChaseSpec(spec);
}

function pickFrontmostOnOpponentLine(
  pool: CombatantState[],
  preferMaxBattleX: boolean
): CombatantState {
  return pool.reduce((a, b) => {
    const ax = getBattleX(a);
    const bx = getBattleX(b);
    if (ax !== bx) {
      return preferMaxBattleX ? (ax > bx ? a : b) : ax < bx ? a : b;
    }
    return a.id.localeCompare(b.id) <= 0 ? a : b;
  });
}

/**
 * combat.md §敵対単体ターゲット選定 — 敵味方共通デフォルト（Chase / Attack）。
 * defender 優先後、相手戦線の最前（味方 actor → min battleX / 敵 actor → max battleX）。
 */
export function pickDefaultHostileSingleTarget(
  actor: CombatantState,
  pool: CombatantState[]
): CombatantState | null {
  const living = pool.filter((unit) => unit.isAlive);
  if (living.length === 0) return null;
  const defenders = living.filter((unit) => unit.role === "defender");
  const candidates = defenders.length > 0 ? defenders : living;
  return pickFrontmostOnOpponentLine(candidates, actor.isEnemy);
}

/** @deprecated use pickDefaultHostileSingleTarget */
export function pickEnemyDefaultNearestTarget(
  actor: CombatantState,
  pool: CombatantState[]
): CombatantState | null {
  return pickDefaultHostileSingleTarget(actor, pool);
}

/** combat.md §敵の単体ターゲット選定 — Chase / Attack 共通 */
export function pickEnemySingleTargetFromPool(
  enemy: CombatantState,
  spec: TargetSpec,
  pool: CombatantState[]
): CombatantState | null {
  const facingPool = enemyForwardFacingPool(
    enemy,
    pool.filter((unit) => unit.isAlive)
  );
  if (facingPool.length === 0) return null;

  const dominanceDuelist = facingPool.find((unit) =>
    isArenaDominanceActive(unit)
  );
  if (dominanceDuelist) return dominanceDuelist;

  if (!isDefaultHostileChaseSpec(spec)) {
    const overridePick = pickTargetFromPool(spec, enemy, facingPool, {
      singleTargetAttack: true,
    });
    if (overridePick) return overridePick;
  }

  return pickDefaultHostileSingleTarget(enemy, facingPool);
}

export function pickTargetFromPool(
  spec: TargetSpec,
  actor: CombatantState,
  pool: CombatantState[],
  options?: PickTargetOptions
): CombatantState | null {
  if (spec.kind === "danger") {
    const runtime = options?.dangerRuntime;
    if (!runtime?.resolveCurrentAttackTarget) return null;
    const targets = resolveDangerTargets(
      spec,
      actor,
      runtime.allies,
      runtime.enemies,
      {
        pendingHits: runtime.pendingHits,
        battleSec: runtime.battleSec,
        resolveCurrentAttackTarget: runtime.resolveCurrentAttackTarget,
      },
    );
    return targets[0] ?? null;
  }

  if (pool.length === 0) return null;

  if (spec.kind === "self") {
    return actor.isAlive ? actor : null;
  }

  if (spec.kind === "distance" && spec.order === "selfOrigin") {
    return actor.isAlive ? actor : null;
  }

  if (spec.kind === "all") {
    return pool[0] ?? null;
  }

  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    isDefaultHostileChaseSpec(spec) &&
    !options?.moveAnchor
  ) {
    const hostilePool = actor.isEnemy
      ? enemyForwardFacingPool(actor, pool)
      : pool;
    if (hostilePool.length === 0) return null;
    if (options?.singleTargetAttack && actor.isEnemy) {
      const dominanceDuelist = hostilePool.find(
        (unit) => unit.isAlive && isArenaDominanceActive(unit)
      );
      if (dominanceDuelist) return dominanceDuelist;
    }
    return pickDefaultHostileSingleTarget(actor, hostilePool);
  }

  if (
    actor.isEnemy &&
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    (spec.order === "nearest" || spec.order === "farthest") &&
    options?.moveAnchor
  ) {
    return pickEnemyByActorDistance(actor, pool, spec.order);
  }

  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "farthest" &&
    !options?.moveAnchor
  ) {
    return pickEnemyByActorDistance(actor, pool, "farthest");
  }

  if (spec.kind === "distance" && spec.side === "ally") {
    const selectable = distanceSpecIncludesSelf(spec)
      ? pool.filter((unit) => unit.isAlive)
      : allySelectablePool(pool, actor, options);
    if (selectable.length === 0) return null;
    const actorX = getBattleX(actor);
    // Target Intent: ally closestAlly. Same-faction distance is pure battleX distance.
    if (spec.order === "nearest") {
      return selectable.reduce((a, b) =>
        Math.abs(getBattleX(a) - actorX) <= Math.abs(getBattleX(b) - actorX)
          ? a
          : b
      );
    }
    return selectable.reduce((a, b) =>
      Math.abs(getBattleX(a) - actorX) >= Math.abs(getBattleX(b) - actorX)
        ? a
        : b
    );
  }

  if (spec.kind === "distance" && spec.side === "enemy") {
    if (options?.moveAnchor) {
      if (options.enemyFrontlineMoveAnchor) {
        // 敵前衛 = プレイヤー寄り = min battleX（AttackTarget nearest の max＝奥 とは逆）
        if (spec.order === "nearest") {
          return pool.reduce((a, b) => (getBattleX(a) <= getBattleX(b) ? a : b));
        }
        if (spec.order === "farthest") {
          return pool.reduce((a, b) => (getBattleX(a) >= getBattleX(b) ? a : b));
        }
      }
      // Target Intent: MoveAnchor. 通常は使用者との battleX 距離。
      if (spec.order === "nearest" || spec.order === "farthest") {
        return pickEnemyByActorDistance(actor, pool, spec.order);
      }
    }
    if (spec.order === "nearest" || spec.order === "farthest") {
      return pickEnemyByActorDistance(actor, pool, spec.order);
    }
  }

  if (spec.kind === "stat") {
    const selectable =
      spec.side === "ally" ? allySelectablePool(pool, actor, options) : pool;
    if (selectable.length === 0) return null;
    const pickHigher = spec.order === "highest";
    const pickLower = spec.order === "lowest" || spec.order === "ratio";
    if (spec.stat === "hp" && spec.order === "ratio") {
      return selectable.reduce((a, b) =>
        currentHpRatio(a) <= currentHpRatio(b) ? a : b
      );
    }
    return selectable.reduce((a, b) => {
      const av = compareStat(a, spec.stat);
      const bv = compareStat(b, spec.stat);
      if (pickHigher) return av >= bv ? a : b;
      if (pickLower) return av <= bv ? a : b;
      return a;
    });
  }

  if (isFrontlineAnchorSpec(spec)) {
    return pool.reduce((a, b) => (getBattleX(a) >= getBattleX(b) ? a : b));
  }

  return pool[0] ?? null;
}

/** ally HP 割合最低: 満タン（hp >= maxHp）の味方は対象プールから除外 */
export function filterSelectablePool(
  spec: TargetSpec,
  pool: CombatantState[]
): CombatantState[] {
  if (
    spec.kind === "stat" &&
    spec.side === "ally" &&
    spec.stat === "hp" &&
    spec.order === "ratio"
  ) {
    return pool.filter(
      (unit) => unit.isAlive && unit.hp < getEffectiveMaxHp(unit)
    );
  }
  return pool;
}

export function orderPoolByTarget(
  spec: TargetSpec,
  actor: CombatantState,
  pool: CombatantState[],
  options?: PickTargetOptions
): CombatantState[] {
  if (pool.length <= 1) return [...pool];

  const copy = [...pool];
  if (spec.kind === "self" || spec.kind === "all") return copy;

  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    isDefaultHostileChaseSpec(spec)
  ) {
    const preferMax = actor.isEnemy;
    return copy.sort((a, b) => {
      const aDef = a.role === "defender" ? 0 : 1;
      const bDef = b.role === "defender" ? 0 : 1;
      if (aDef !== bDef) return aDef - bDef;
      const ax = getBattleX(a);
      const bx = getBattleX(b);
      if (ax !== bx) return preferMax ? bx - ax : ax - bx;
      return a.id.localeCompare(b.id);
    });
  }

  if (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "farthest"
  ) {
    const actorX = getBattleX(actor);
    return copy.sort((a, b) => {
      const da = Math.abs(getBattleX(a) - actorX);
      const db = Math.abs(getBattleX(b) - actorX);
      return db - da;
    });
  }

  if (spec.kind === "distance" && spec.side === "ally") {
    const actorX = getBattleX(actor);
    const selectable = distanceSpecIncludesSelf(spec)
      ? copy.filter((unit) => unit.isAlive)
      : includeActorInAllyPool(options)
      ? copy.filter((unit) => unit.isAlive)
      : copy.filter((unit) => unit.id !== actor.id);
    const sorted = selectable.sort((a, b) => {
      const da = Math.abs(getBattleX(a) - actorX);
      const db = Math.abs(getBattleX(b) - actorX);
      if (spec.order === "selfOrigin") return da - db;
      return spec.order === "nearest" ? da - db : db - da;
    });
    return sorted;
  }

  if (spec.kind === "distance" && spec.side === "enemy") {
    if (spec.order === "nearest" || spec.order === "farthest") {
      const actorX = getBattleX(actor);
      return copy.sort((a, b) => {
        const da = Math.abs(getBattleX(a) - actorX);
        const db = Math.abs(getBattleX(b) - actorX);
        return spec.order === "nearest" ? da - db : db - da;
      });
    }
  }

  if (spec.kind === "stat") {
    if (spec.stat === "hp" && spec.order === "ratio") {
      const selectable =
        spec.side === "ally"
          ? includeActorInAllyPool(options)
            ? copy.filter((unit) => unit.isAlive)
            : copy.filter((unit) => unit.id !== actor.id)
          : copy;
      return selectable.sort((a, b) => currentHpRatio(a) - currentHpRatio(b));
    }
    const desc = spec.order === "highest";
    const selectable =
      spec.side === "ally"
        ? includeActorInAllyPool(options)
          ? copy.filter((unit) => unit.isAlive)
          : copy.filter((unit) => unit.id !== actor.id)
        : copy;
    return selectable.sort((a, b) => {
      const av = compareStat(a, spec.stat);
      const bv = compareStat(b, spec.stat);
      return desc ? bv - av : av - bv;
    });
  }

  if (isFrontlineAnchorSpec(spec)) {
    return copy.sort((a, b) => getBattleX(b) - getBattleX(a));
  }

  return copy.sort((a, b) => getBattleX(a) - getBattleX(b));
}

const SIDE_LABELS: Record<TargetSide, string> = {
  ally: "味方",
  enemy: "敵",
};

const DISTANCE_ORDER_LABELS: Record<TargetDistanceOrder, string> = {
  nearest: "至近",
  farthest: "最遠",
  selfOrigin: "自身起点",
};

const STAT_LABELS: Record<TargetStat, string> = {
  hp: "HP",
  maxHp: "最大HP",
  atk: "ATK",
  def: "DEF",
  res: "RES",
};

const STAT_ORDER_LABELS: Record<TargetStatOrder, string> = {
  highest: "最高",
  lowest: "最低",
  ratio: "割合（最低）",
};

export function formatTargetLabel(spec: TargetSpec): string {
  switch (spec.kind) {
    case "self":
      return "自身";
    case "all":
      return spec.side === "ally" ? "味方全員" : "敵全員";
    case "distance":
      return `${SIDE_LABELS[spec.side]}・${DISTANCE_ORDER_LABELS[spec.order]}`;
    case "stat":
      return `${SIDE_LABELS[spec.side]}・${STAT_LABELS[spec.stat]}${
        STAT_ORDER_LABELS[spec.order]
      }`;
    case "attackType": {
      const parts: string[] = [];
      if (spec.physical) parts.push("物理");
      if (spec.magic) parts.push("魔法");
      if (spec.melee) parts.push("近接");
      if (spec.ranged) parts.push("遠隔");
      return `攻撃種別: ${parts.join("・")}`;
    }
    case "status":
      return `${SIDE_LABELS[spec.side ?? "enemy"]}・状態`;
    case "clusterCenter":
      return `${SIDE_LABELS[spec.side]}・クラスタ中心`;
    case "danger":
      return `${SIDE_LABELS[spec.side]}・危険対象×${spec.maxTargets}（${spec.windowSec}s）`;
  }
}

export function defaultTargetForEffectType(type: string): TargetSpec {
  switch (type) {
    case "heal":
    case "barrier":
    case "dispel":
      return { kind: "stat", side: "ally", stat: "hp", order: "ratio" };
    case "buff":
    case "block":
    case "counter":
      return { kind: "self" };
    default:
      return { kind: "distance", side: "enemy", order: "nearest" };
  }
}
