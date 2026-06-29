import type { GameTermId } from "./gameTermGlossary.ts";

export interface GameTermEnSupplement {
  title: string;
  description?: string;
  tooltip?: string;
  statusDefinition?: string;
  aliases?: readonly string[];
}

/** English locale text merged into `GAME_TERM_ENTRIES` at build time. */
export const GAME_TERM_EN_SUPPLEMENT: Record<GameTermId, GameTermEnSupplement> = {
  barrier: {
    title: "Barrier",
    description:
      "Absorbs damage separately from HP and is spent before HP.\nShown on the HUD as a bright overlay on the HP bar.\nWhen a target already has a barrier, a new barrier generally replaces the old one only if the new amount is larger.",
    aliases: ["Barrier"],
  },
  wardBarrier: {
    title: "Ward",
    description:
      "A stack-based defensive buff that greatly reduces damage taken.\nConsumed before barriers, one stack per hit.",
    aliases: ["Ward"],
  },
  windMark: {
    title: "Qian Mark",
    description:
      "A wind mark applied by the Sigilist for large fights.\nDetonation triggers area damage.\nOn auto-detonation it spreads stacks outward without attacking.",
    aliases: ["Qian Mark"],
  },
  earthMark: {
    title: "Kun Mark",
    description:
      "An earth mark applied by the Sigilist for small fights.\nDetonation triggers single-target damage.\nOn auto-detonation it converges on the same target and adds stacks.",
    aliases: ["Kun Mark"],
  },
  arenaMark: {
    title: "Gladiator's Mark",
    description:
      "A debuff applied by the Gladiator.\nIncreases damage taken by the marked target and reduces damage taken by others.",
    aliases: ["Gladiator's Mark"],
  },
  block: {
    title: "Block",
    description:
      "On taking a physical hit, may proc to reduce damage (25% + 0.1% per ATK, capped at 100%).\nBlock rate stacks additively.",
    aliases: ["Block"],
  },
  magicBlock: {
    title: "Magic Block",
    description:
      "On taking a magic hit, may proc to reduce damage by 15%.\nMagic block rate stacks additively. Resolved separately from physical block.",
    aliases: ["Magic Block"],
  },
  basicAttack: {
    title: "Basic Attack",
    description:
      "The default attack used when not casting skills. Frequency is based on attack speed.",
    aliases: ["Basic Attack"],
  },
  charge: {
    title: "Charge",
    description:
      "Stock mechanic shown as \"N charges available\".\nIf recast is ready but conditions fail, one usable charge is stored and the next recast gauge can advance.\nWhen conditions are met, stored charges are spent first.",
    aliases: ["Charge"],
  },
  stun: {
    title: "Stun",
    description:
      "Unable to act: skills, basic attacks, and movement stop. Only basic-attack recast timers reset.\nActive skill recast timers do not pause or reset.",
    aliases: ["Stun"],
  },
  dot: {
    title: "DoT",
    description:
      "Damage over Time — effects that deal damage every second for their duration.",
    aliases: ["DoT"],
  },
  dotCompress: {
    title: "DoT Compression",
    description: "Compresses remaining DoT duration and concentrates damage into a shorter window.",
    aliases: ["DoT Compression"],
  },
  multiLock: {
    title: "Multi-Lock",
    tooltip:
      "Applies effects up to the target count.\nIf targets are insufficient, remaining applications hit the same target again.",
    description:
      "Applies effects up to the target count. If targets are insufficient, remaining applications hit the same target again.",
    aliases: ["Multi-Lock"],
  },
  aoe: {
    title: "AoE",
    tooltip: "Applies effects to targets in an area.",
    aliases: ["AoE"],
  },
  pierce: {
    title: "Pierce",
    tooltip: "Applies effects through targets in line.",
    aliases: ["Pierce"],
  },
  skillLock: {
    title: "Lockout",
    description: "After using a skill, prevents skills and basic attacks for a set time.",
    aliases: ["Lockout"],
  },
  damageReduction: { title: "Damage Reduction" },
  damageIncrease: { title: "Damage Taken Increase" },
  damageTaken: { title: "Damage Taken" },
  counter: {
    title: "Counter",
    description: "On being attacked, applies the configured skill effect to the attacker.",
    aliases: ["Counter"],
  },
  evasion: {
    title: "Evasion",
    description: "Chance to completely avoid an attack and take no damage.",
    aliases: ["Evasion"],
  },
  invulnerable: {
    title: "Invulnerable",
    description: "Negates all damage and debuff application.",
    aliases: ["Invulnerable"],
  },
  moveLock: {
    title: "Root",
    description: "Prevents movement other than skill-driven movement.",
    aliases: ["Root"],
  },
  hot: {
    title: "HoT",
    description: "Heal over Time — restores HP every second for the duration.",
    aliases: ["HoT"],
  },
  poison: {
    title: "Poison",
    description: "A type of DoT. Exact behavior varies by skill.",
    aliases: ["Poison Spread", "Poison"],
  },
  bleed: {
    title: "Bleed",
    description: "A type of DoT. Exact behavior varies by skill.",
    aliases: ["Bleed"],
  },
  healReservation: {
    title: "Healing Echo",
    description:
      "After taking damage, if HP falls below a threshold, consumes one stack to heal instantly.",
    aliases: ["Healing Echo"],
  },
  blockResonance: {
    title: "Bulwark",
    description:
      "A buff stacked by the Guardian's Intercept Stance on successful blocks.\nEach stack grants damage reduction.",
    aliases: ["Bulwark"],
  },
  blockResonanceStance: {
    title: "Citadel Stance",
    description:
      "Granted by consuming all Bulwark stacks. While active, successful blocks damage and knock back nearby enemies.",
    aliases: ["Citadel Stance"],
  },
  herbalPotency: {
    title: "Herbal Potency",
    description:
      "Stacks from the Herbalist's infusion. While Herbalist HoT is active, stacks grow over time and increase HoT healing per stack.",
    aliases: ["Herbal Potency"],
  },
  herbalPotencyConstitution: {
    title: "Hardy",
    description:
      "Max HP multiplier buff granted when Herbal Potency reaches a threshold. The tier reached persists after manifestation consumes stacks.",
    aliases: ["Hardy"],
  },
  hp: { title: "HP" },
  atk: { title: "ATK" },
  def: { title: "DEF" },
  reg: { title: "REG" },
  attackSpeed: { title: "Attack Speed" },
  damageDelay: {
    title: "Damage Delay",
    description:
      "Sends part of damage taken into a deferred pool. Total damage is unchanged; it is applied over time each second. Not damage reduction.",
    aliases: ["Damage Delay"],
  },
  basicAttackTransform: {
    title: "Basic Attack Transform",
    description:
      "While active, changes basic attack behavior. Only the newest application applies if multiple are present.",
    aliases: ["Basic Attack Transform"],
  },
  lastStandGuts: {
    title: "Last Stand",
    description:
      "Triggers before death, keeping HP from falling below 1 for several seconds. On end, stuns and knocks back all living enemies. (Once per wave)",
    aliases: ["Last Stand"],
  },
  arenaDominance: {
    title: "Arena Law",
    description:
      "Triggers at final wave start. Fixes single-target enemy attacks on the Gladiator and marks the highest-ATK enemy. The Gladiator cannot receive ally support while active.",
    aliases: ["Arena Law"],
  },
  duelistPride: {
    title: "Duelist's Pride",
    description:
      "While HP is above a ratio threshold, amplifies instant heals and HoT ticks for the Gladiator. Weaker self-heal boost than Arena Law.",
    aliases: ["Duelist's Pride"],
  },
  seedFlame: {
    title: "Seed Flame",
    statusDefinition:
      "Magic DoT.\n\n· Magic damage equal to 5% ATK per second\n· Lasts 10s\n· Max 5 stacks\n\nAt max stacks, further applications convert to Blazing Flame instead.",
  },
  blazingFlame: {
    title: "Blazing Flame",
    statusDefinition:
      "Magic DoT upgraded from Seed Flame.\n\n· Magic damage equal to 35% ATK per second (indefinite)\n· +10% magic damage taken per stack\n· Max 1 stack",
  },
  ballistaMark: { title: "Barrage Mark" },
  allyAttackFollowUp: {
    title: "Follow-Up Ready",
    description:
      "Watches nearby allies' successful basic attacks; the Lancer follows with one basic attack on the same target. Follow-up basics do not recurse.",
    aliases: ["Follow-Up Ready", "Follow-Up"],
  },
  poisonWeapon: { title: "Poison Weapon" },
  nextOutgoingDamage: { title: "Next Hit Amp" },
};
