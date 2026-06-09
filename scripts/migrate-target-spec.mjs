import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'data/skills.json');

const DEBUFF_TAGS = ['atk', 'def', 'reg', 'damageTaken', 'dot', 'stun'];

function convertRule(rule, debuffFilter) {
  switch (rule) {
    case 'self':
      return { kind: 'self' };
    case 'allAllies':
      return { kind: 'all', side: 'ally' };
    case 'allEnemies':
      return { kind: 'all', side: 'enemy' };
    case 'closestAlly':
      return { kind: 'distance', side: 'ally', order: 'nearest' };
    case 'frontEnemy':
      return { kind: 'distance', side: 'enemy', order: 'nearest' };
    case 'farthestEnemy':
      return { kind: 'distance', side: 'enemy', order: 'farthest' };
    case 'lowestHpEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'hp', order: 'lowest' };
    case 'highestHpEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'hp', order: 'highest' };
    case 'mostDamagedAlly':
      return { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' };
    case 'highestAtkEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'atk', order: 'highest' };
    case 'lowestDefEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'def', order: 'lowest' };
    case 'highestDefEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'def', order: 'highest' };
    case 'lowestRegEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'reg', order: 'lowest' };
    case 'highestRegEnemy':
      return { kind: 'stat', side: 'enemy', stat: 'reg', order: 'highest' };
    case 'rangedAttackingEnemy':
      return { kind: 'attackType', ranged: true };
    case 'magicAttackingEnemy':
      return { kind: 'attackType', magic: true };
    case 'debuffedEnemy':
      return {
        kind: 'status',
        side: 'enemy',
        debuffTags:
          debuffFilter && debuffFilter.length > 0 ? debuffFilter : [...DEBUFF_TAGS],
      };
    default:
      throw new Error(`Unknown targetRule: ${rule}`);
  }
}

function migrateEffect(effect) {
  if (!effect || typeof effect !== 'object') return effect;
  const next = { ...effect };
  if (typeof next.targetRule === 'string') {
    next.target = convertRule(next.targetRule, next.targetDebuffFilter);
    delete next.targetRule;
    delete next.targetDebuffFilter;
  }
  return next;
}

function migratePassive(passive) {
  if (!passive || typeof passive !== 'object') return passive;
  const next = { ...passive };
  for (const key of [
    'targetRuleOverride',
    'hotTargetRule',
    'damageReductionTargetRule',
    'dispelTargetRule',
  ]) {
    if (typeof next[key] === 'string') {
      next[key] = convertRule(next[key]);
    }
  }
  return next;
}

function migrateActive(active) {
  if (!active || typeof active !== 'object') return active;
  const next = { ...active };
  if (Array.isArray(next.effect)) {
    next.effect = next.effect.map(migrateEffect);
  }
  return next;
}

const data = JSON.parse(readFileSync(path, 'utf8'));
if (Array.isArray(data.passives)) {
  data.passives = data.passives.map(migratePassive);
} else if (data.passives) {
  for (const [id, passive] of Object.entries(data.passives)) {
    data.passives[id] = migratePassive(passive);
  }
}
if (Array.isArray(data.actives)) {
  data.actives = data.actives.map(migrateActive);
} else if (data.actives) {
  for (const [id, active] of Object.entries(data.actives)) {
    data.actives[id] = migrateActive(active);
  }
}
writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log('Migrated', path);
