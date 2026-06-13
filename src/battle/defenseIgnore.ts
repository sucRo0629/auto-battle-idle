import { getPassiveDefs } from './combatMath.ts';
import type {
  CombatantState,
  DefenseIgnoreSpec,
  PassiveSkillDef,
} from './types.ts';

function mergeDefenseIgnoreSpecs(
  specs: Array<DefenseIgnoreSpec | undefined>,
): DefenseIgnoreSpec {
  let defFlat = 0;
  let defPercent = 0;
  let regPercent = 0;

  for (const spec of specs) {
    if (!spec) continue;
    if (spec.def?.mode === 'flat') {
      defFlat += spec.def.amount;
    } else if (spec.def?.mode === 'percent') {
      defPercent += spec.def.amount;
    }
    if (spec.reg?.percent !== undefined) {
      regPercent += spec.reg.percent;
    }
  }

  const merged: DefenseIgnoreSpec = {};
  if (defFlat > 0 || defPercent > 0) {
    if (defFlat > 0 && defPercent <= 0) {
      merged.def = { mode: 'flat', amount: defFlat };
    } else if (defPercent > 0 && defFlat <= 0) {
      merged.def = { mode: 'percent', amount: Math.min(1, defPercent) };
    } else if (defFlat > 0 && defPercent > 0) {
      merged.def = { mode: 'percent', amount: Math.min(1, defPercent) };
      // flat is applied separately via combined spec — use custom handling in apply
    }
  }
  if (regPercent > 0) {
    merged.reg = { percent: Math.min(1, regPercent) };
  }
  return merged;
}

function rollDefenseIgnoreChance(chance: number | undefined): boolean {
  const resolved = chance ?? 1;
  if (resolved <= 0) return false;
  return Math.random() <= Math.min(1, resolved);
}

export function rollDefenseIgnoreSpec(
  spec: DefenseIgnoreSpec | undefined,
): DefenseIgnoreSpec | undefined {
  if (!spec) return undefined;
  if (!rollDefenseIgnoreChance(spec.chance)) return undefined;
  return spec;
}

export function getPassiveDefenseIgnoreSpec(
  attacker: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): DefenseIgnoreSpec | undefined {
  const specs: Array<DefenseIgnoreSpec | undefined> = [];
  for (const passive of getPassiveDefs(attacker, passives)) {
    if (passive.effect !== 'defenseIgnore') continue;
    const chance = passive.defenseIgnore?.chance ?? passive.chance ?? 1;
    if (rollDefenseIgnoreChance(chance)) {
      specs.push(passive.defenseIgnore);
    }
  }
  if (specs.length === 0) return undefined;
  return mergeDefenseIgnoreSpecs(specs);
}

export function mergeDefenseIgnore(
  ...specs: Array<DefenseIgnoreSpec | undefined>
): DefenseIgnoreSpec {
  return mergeDefenseIgnoreSpecs(specs);
}

export function applyDefenseIgnoreToDef(
  effectiveDef: number,
  specs: Array<DefenseIgnoreSpec | undefined>,
): number {
  let defFlat = 0;
  let defPercent = 0;
  for (const spec of specs) {
    if (!spec?.def) continue;
    if (spec.def.mode === 'flat') {
      defFlat += spec.def.amount;
    } else {
      defPercent += spec.def.amount;
    }
  }
  defPercent = Math.min(1, defPercent);
  const afterFlat = Math.max(0, effectiveDef - defFlat);
  return Math.max(0, afterFlat * (1 - defPercent));
}

export function applyDefenseIgnoreToReg(
  effectiveReg: number,
  specs: Array<DefenseIgnoreSpec | undefined>,
): number {
  let regPercent = 0;
  for (const spec of specs) {
    if (spec?.reg?.percent !== undefined) {
      regPercent += spec.reg.percent;
    }
  }
  regPercent = Math.min(1, regPercent);
  return Math.max(0, effectiveReg * (1 - regPercent));
}
