export type SkillCardLocale = "ja" | "en";

let formattingLocale: SkillCardLocale = "ja";

export function getSkillTextLocale(): SkillCardLocale {
  return formattingLocale;
}

export function runWithSkillTextLocale<T>(
  locale: SkillCardLocale,
  fn: () => T,
): T {
  const prev = formattingLocale;
  formattingLocale = locale;
  try {
    return fn();
  } finally {
    formattingLocale = prev;
  }
}

const SKILL_TEXT = {
  ja: {
    recast: "再使用",
    duration: "持続",
    fireCondition: "発動条件",
    passiveEffectPrefix: "効果：",
    passiveAlways: "常時",
    passiveOnHit: "被攻撃時",
    passiveFrontAllyHit: "周囲の味方被弾時",
    noCharge: "チャージなし",
    basicAttackCount: (n: number) => `通常攻撃${n}回`,
    hitsTakenCount: (n: number) => `被攻撃${n}回`,
    seconds: (n: number) => `${n}秒`,
    skillLock: "硬直",
    moveLock: "移動停止",
    moveLockPresent: "移動停止あり",
    damagePhysical: "物理",
    damageMagic: "魔法",
    metaJoiner: " / ",
    labelColon: "：",
    fireConditionJoinerAll: " & ",
    fireConditionJoinerAny: " | ",
  },
  en: {
    recast: "Recast",
    duration: "Duration",
    fireCondition: "Condition",
    passiveEffectPrefix: "Effect: ",
    passiveAlways: "Always",
    passiveOnHit: "On hit taken",
    passiveFrontAllyHit: "When nearby ally is hit",
    noCharge: "No charge",
    basicAttackCount: (n: number) => `After ${n} basic attack${n === 1 ? "" : "s"}`,
    hitsTakenCount: (n: number) => `After ${n} hit${n === 1 ? "" : "s"} taken`,
    seconds: (n: number) => `${n}s`,
    skillLock: "Lockout",
    moveLock: "Root",
    moveLockPresent: "Movement stop",
    damagePhysical: "physical",
    damageMagic: "magic",
    metaJoiner: " / ",
    labelColon: ": ",
    fireConditionJoinerAll: " & ",
    fireConditionJoinerAny: " | ",
  },
} as const;

type SkillTextTable = (typeof SKILL_TEXT)[SkillCardLocale];

export function skillText(): SkillTextTable {
  return SKILL_TEXT[formattingLocale];
}
