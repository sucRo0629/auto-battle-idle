import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/battle/skills/targeting.test.ts');
let content = readFileSync(path, 'utf8');

if (!content.includes('normalizeTarget')) {
  content = content.replace(
    "import type { CombatantState, DamageSkillEffect, GameData } from '../types.ts';",
    "import type { CombatantState, DamageSkillEffect, GameData, SkillEffectDef, TargetRule } from '../types.ts';\nimport { normalizeTarget } from './targetSpec.ts';",
  );
  content = content.replace(
    "const BASIC_SKILL_ID = 'test_basic_attack';",
    `const BASIC_SKILL_ID = 'test_basic_attack';

function damageEffect(
  fields: Record<string, unknown>,
  rule: TargetRule,
): SkillEffectDef {
  return {
    type: 'damage',
    damageType: 'physical',
    amount: { kind: 'atkBased', atkScale: 1 },
    target: normalizeTarget(rule),
    ...fields,
  } as SkillEffectDef;
}

function moveEffect(fields: Record<string, unknown>, rule: TargetRule) {
  return {
    type: 'move',
    moveDurationSec: 0.2,
    target: normalizeTarget(rule),
    ...fields,
  } as SkillEffectDef;
}`,
  );
}

content = content.replace(
  /resolveEffectTargets\(\s*\{([^}]+)\},\s*'([^']+)',\s*actor,\s*allies,\s*enemies,\s*gameData,\s*\)/g,
  "resolveEffectTargets(damageEffect({$1}, '$2'), actor, allies, enemies, gameData)",
);
content = content.replace(
  /resolveEffectTargets\(\s*\{([^}]+)\},\s*'([^']+)',\s*actor,\s*\[actor, ally2\],\s*enemies,\s*gameData,\s*\)/g,
  "resolveEffectTargets(damageEffect({$1}, '$2'), actor, [actor, ally2], enemies, gameData)",
);
content = content.replace(
  /resolveEffectTargets\(\s*\{([^}]+)\},\s*'([^']+)',\s*ally,\s*allies,\s*enemies,\s*gameData,\s*\)/g,
  "resolveEffectTargets(damageEffect({$1}, '$2'), ally, allies, enemies, gameData)",
);

content = content.replace(
  /resolveEffectResolution\(\s*\{([^}]+)\},\s*'([^']+)',\s*actor,\s*allies,\s*enemies,\s*gameData(?:,\s*([^)]+))?\)/g,
  (match, fields, rule, extra) =>
    `resolveEffectResolution(damageEffect({${fields}}, '${rule}'), actor, allies, enemies, gameData${extra ? `, ${extra}` : ''})`,
);

content = content.replace(
  /resolveEffectAnchor\(\s*\{([^}]+)\},\s*'([^']+)',\s*actor,\s*allies,\s*enemies,\s*gameData,\s*\)/g,
  "resolveEffectAnchor(damageEffect({$1}, '$2'), actor, allies, enemies, gameData)",
);

content = content.replace(
  /resolveEffectAnchor\(\s*moveEffect\(\{([^}]*)\},\s*'([^']+)'\),\s*'([^']+)',\s*actor,\s*allies,\s*enemies,\s*gameData,\s*\)/g,
  "resolveEffectAnchor(moveEffect({$1}, '$2'), actor, allies, enemies, gameData)",
);

writeFileSync(path, content, 'utf8');
console.log('Fixed targeting.test.ts');
