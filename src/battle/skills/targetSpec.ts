import { isRangedAttack } from "../data/entityTraits.ts";
import {
  currentHpRatio,
  getEffectiveAtk,
  getEffectiveDef,
  getEffectiveMaxHp,
  getEffectiveReg,
} from "../combatMath.ts";
import {
  getBattleX,
  isPlayerRearAssaultAccess,
} from "../combatPosition.ts";
import { hasMatchingStatus } from "../statusMatching.ts";
import {
  compareThreatTargetPriority,
  pickHighestThreatAlly,
  pickThreatTargetWithHysteresis,
} from "../threat.ts";
import type {
  BuffFilterTag,
  CombatantState,
  DebuffFilterTag,
  PassiveSkillDef,
  SkillEffectDef,
  SkillHitTarget,
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
    case "lowestRegEnemy":
      return { kind: "stat", side: "enemy", stat: "reg", order: "lowest" };
    case "highestRegEnemy":
      return { kind: "stat", side: "enemy", stat: "reg", order: "highest" };
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
      (order !== "nearest" &&
        order !== "farthest" &&
        order !== "selfOrigin")
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
      (stat !== "hp" && stat !== "atk" && stat !== "def" && stat !== "reg") ||
      (order !== "highest" && order !== "lowest" && order !== "ratio")
    ) {
      throw new Error("Invalid target.stat fields");
    }
    if (order === "ratio" && stat !== "hp") {
      throw new Error("target.stat order ratio is only valid for hp");
    }
    return { kind: "stat", side, stat, order };
  }
  if (kind === "attackType") {
    const spec: TargetSpec = { kind: "attackType" };
    if (raw.physical === true) (spec as { physical?: boolean }).physical = true;
    if (raw.magic === true) (spec as { magic?: boolean }).magic = true;
    if (raw.melee === true) (spec as { melee?: boolean }).melee = true;
    if (raw.ranged === true) (spec as { ranged?: boolean }).ranged = true;
    const attackSpec = spec as {
      kind: "attackType";
      physical?: boolean;
      magic?: boolean;
      melee?: boolean;
      ranged?: boolean;
    };
    if (
      !attackSpec.physical &&
      !attackSpec.magic &&
      !attackSpec.melee &&
      !attackSpec.ranged
    ) {
      throw new Error("target.attackType requires at least one filter");
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
  /** 指定時は一致スコープの targetRuleOverride のみ適用 */
  applyScope?: TargetRuleOverrideApplyTo;
}

/** effect target の適用スコープ（spec.side は actor 視点。自己対象は self） */
export function targetSpecFaction(
  spec: TargetSpec,
  _actor: CombatantState,
): TargetRuleOverrideApplyTo | "self" {
  if (spec.kind === "self") return "self";
  if (spec.kind === "distance" || spec.kind === "stat" || spec.kind === "all") {
    return spec.side;
  }
  if (spec.kind === "attackType") {
    return "enemy";
  }
  if (spec.kind === "status") {
    return spec.side ?? "enemy";
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
    if (passive.effect !== "targetRuleOverride" || !passive.targetRuleOverride) {
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
        context.enemies
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

function matchesAttackType(
  unit: CombatantState,
  spec: Extract<TargetSpec, { kind: "attackType" }>
): boolean {
  const damageFilters: boolean[] = [];
  if (spec.physical) {
    damageFilters.push(unit.traits.damageType === "physical");
  }
  if (spec.magic) {
    damageFilters.push(unit.traits.damageType === "magic");
  }
  const rangeFilters: boolean[] = [];
  if (spec.melee) {
    rangeFilters.push(!isRangedAttack(unit.traits.rangePx));
  }
  if (spec.ranged) {
    rangeFilters.push(isRangedAttack(unit.traits.rangePx));
  }

  const damageOk =
    damageFilters.length === 0 || damageFilters.some((value) => value);
  const rangeOk =
    rangeFilters.length === 0 || rangeFilters.some((value) => value);
  return damageOk && rangeOk;
}

function compareStat(unit: CombatantState, stat: TargetStat): number {
  switch (stat) {
    case "hp":
      return unit.hp;
    case "atk":
      return getEffectiveAtk(unit);
    case "def":
      return getEffectiveDef(unit);
    case "reg":
      return getEffectiveReg(unit);
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
  enemies: CombatantState[]
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

  if (spec.kind === "attackType") {
    const pool = factionPool("enemy", actor, allies, enemies);
    if (actor.isEnemy) return pool;
    return pool.filter((unit) => matchesAttackType(unit, spec));
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
  targets: SkillHitTarget[],
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
   * 至近/最遠は使用者との battleX 距離で決め、Threat や接近 chase の編成奥選択を使わない。
   */
  moveAnchor?: boolean;
  /** heal 等：味方 stat / distance 対象で使用者を候補プールに含める */
  includeActorInAllyPool?: boolean;
};

/** 回復 effect は味方対象に使用者自身も含める */
export function pickOptionsForEffect(
  effect: SkillEffectDef | undefined,
): PickTargetOptions | undefined {
  if (effect?.type === 'heal') {
    return { includeActorInAllyPool: true };
  }
  return undefined;
}

function includeActorInAllyPool(options?: PickTargetOptions): boolean {
  return options?.includeActorInAllyPool === true;
}

/** 味方対象で自身を除いた後に候補が空なら、単独パーティ時は自身にフォールバック */
function allySelectablePool(
  pool: CombatantState[],
  actor: CombatantState,
  options?: PickTargetOptions,
): CombatantState[] {
  if (includeActorInAllyPool(options)) {
    return pool.filter((unit) => unit.isAlive);
  }
  return allySelectableExcludingSelf(pool, actor);
}

/** 味方対象で自身を除いた後に候補が空なら、単独パーティ時は自身にフォールバック */
function allySelectableExcludingSelf(
  pool: CombatantState[],
  actor: CombatantState,
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
  order: "nearest" | "farthest",
): CombatantState {
  const actorX = getBattleX(actor);
  return pool.reduce((a, b) => {
    const da = Math.abs(getBattleX(a) - actorX);
    const db = Math.abs(getBattleX(b) - actorX);
    if (order === "nearest") return da <= db ? a : b;
    return da >= db ? a : b;
  });
}

function enemyForwardFacingPool(
  actor: CombatantState,
  pool: CombatantState[],
): CombatantState[] {
  const actorX = getBattleX(actor);
  return pool.filter(
    (unit) => !isPlayerRearAssaultAccess(unit, actorX),
  );
}

export function pickTargetFromPool(
  spec: TargetSpec,
  actor: CombatantState,
  pool: CombatantState[],
  options?: PickTargetOptions,
): CombatantState | null {
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

  if (actor.isEnemy) {
    if (spec.kind === "distance" && spec.side === "enemy") {
      // Target Intent: AttackTarget. Enemy attacks player-side targets by Threat.
      if (spec.order === "nearest" && !options?.moveAnchor) {
        const facingPool = enemyForwardFacingPool(actor, pool);
        const { target, focusId } = pickThreatTargetWithHysteresis(
          facingPool,
          actor.threatFocusTargetId,
        );
        if (focusId !== undefined) {
          actor.threatFocusTargetId = focusId;
        } else {
          delete actor.threatFocusTargetId;
        }
        return target;
      }
      // Target Intent: MoveAnchor. Enemy move effects use actor-distance anchors.
      if (spec.order === "nearest" || spec.order === "farthest") {
        return pickEnemyByActorDistance(actor, pool, spec.order);
      }
    }
    return pool[0] ?? null;
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
      // Target Intent: MoveAnchor. Player move effects also use actor-distance anchors.
      if (spec.order === "nearest" || spec.order === "farthest") {
        return pickEnemyByActorDistance(actor, pool, spec.order);
      }
    }
    // Target Intent: AttackTarget. Player enemy nearest/farthest follows battle-line depth.
    if (spec.order === "nearest") {
      return pool.reduce((a, b) => (getBattleX(a) >= getBattleX(b) ? a : b));
    }
    return pool.reduce((a, b) => (getBattleX(a) <= getBattleX(b) ? a : b));
  }

  if (spec.kind === "stat") {
    const selectable =
      spec.side === "ally"
        ? allySelectablePool(pool, actor, options)
        : pool;
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
  pool: CombatantState[],
): CombatantState[] {
  if (
    spec.kind === "stat" &&
    spec.side === "ally" &&
    spec.stat === "hp" &&
    spec.order === "ratio"
  ) {
    return pool.filter(
      (unit) => unit.isAlive && unit.hp < getEffectiveMaxHp(unit),
    );
  }
  return pool;
}

export function orderPoolByTarget(
  spec: TargetSpec,
  actor: CombatantState,
  pool: CombatantState[],
  options?: PickTargetOptions,
): CombatantState[] {
  if (pool.length <= 1) return [...pool];

  const copy = [...pool];
  if (spec.kind === "self" || spec.kind === "all") return copy;

  if (
    actor.isEnemy &&
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "nearest"
  ) {
    return copy.sort(compareThreatTargetPriority);
  }

  if (
    actor.isEnemy &&
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
    if (spec.order === "nearest") {
      return copy.sort((a, b) => getBattleX(b) - getBattleX(a));
    }
    return copy.sort((a, b) => getBattleX(a) - getBattleX(b));
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
  atk: "ATK",
  def: "DEF",
  reg: "REG",
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
