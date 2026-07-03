import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RULE_MAP = {
  self: '{ kind: "self" }',
  allAllies: '{ kind: "all", side: "ally" }',
  allEnemies: '{ kind: "all", side: "enemy" }',
  closestAlly: '{ kind: "distance", side: "ally", order: "nearest" }',
  frontEnemy: '{ kind: "distance", side: "enemy", order: "nearest" }',
  farthestEnemy: '{ kind: "distance", side: "enemy", order: "farthest" }',
  lowestHpEnemy: '{ kind: "stat", side: "enemy", stat: "hp", order: "lowest" }',
  highestHpEnemy: '{ kind: "stat", side: "enemy", stat: "hp", order: "highest" }',
  mostDamagedAlly: '{ kind: "stat", side: "ally", stat: "hp", order: "ratio" }',
  highestAtkEnemy: '{ kind: "stat", side: "enemy", stat: "atk", order: "highest" }',
  lowestDefEnemy: '{ kind: "stat", side: "enemy", stat: "def", order: "lowest" }',
  highestDefEnemy: '{ kind: "stat", side: "enemy", stat: "def", order: "highest" }',
  lowestResEnemy: '{ kind: "stat", side: "enemy", stat: "res", order: "lowest" }',
  highestResEnemy: '{ kind: "stat", side: "enemy", stat: "res", order: "highest" }',
  rangedAttackingEnemy: '{ kind: "attackType", ranged: true }',
  magicAttackingEnemy: '{ kind: "attackType", magic: true }',
  debuffedEnemy: '{ kind: "status", side: "enemy", debuffTags: ["def"] }',
};

function migrateContent(content) {
  let next = content;
  for (const [rule, target] of Object.entries(RULE_MAP)) {
    next = next.replaceAll(`targetRule: '${rule}'`, `target: ${target}`);
    next = next.replaceAll(`targetRule: "${rule}"`, `target: ${target}`);
    next = next.replaceAll(`targetRule: '${rule}' as const`, `target: ${target}`);
    next = next.replaceAll(`targetRuleOverride: '${rule}'`, `targetRuleOverride: ${target}`);
    next = next.replaceAll(`targetRuleOverride: "${rule}"`, `targetRuleOverride: ${target}`);
    next = next.replaceAll(`hotTargetRule: '${rule}'`, `hotTargetRule: ${target}`);
    next = next.replaceAll(`hotTargetRule: '${rule}' as const`, `hotTargetRule: ${target}`);
    next = next.replaceAll(`damageReductionTargetRule: '${rule}'`, `damageReductionTargetRule: ${target}`);
    next = next.replaceAll(`damageReductionTargetRule: '${rule}' as const`, `damageReductionTargetRule: ${target}`);
    next = next.replaceAll(`.targetRule).toBe('${rule}')`, `.target).toEqual(${target})`);
    next = next.replaceAll(`?.targetRule).toBe('${rule}')`, `?.target).toEqual(${target})`);
  }
  return next;
}

const files = walk(join(root, 'src'));
for (const path of files) {
  const rel = path.slice(root.length + 1);
  const original = readFileSync(path, 'utf8');
  const migrated = migrateContent(original);
  if (migrated !== original) {
    writeFileSync(path, migrated, 'utf8');
    console.log('Updated', rel);
  }
}
