import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'data/skills.json');
const skillsDir = path.join(root, 'data/skills');
const passivesDir = path.join(skillsDir, 'passives');
const activesDir = path.join(skillsDir, 'actives');

function getActiveFileStem(skillId) {
  const parts = skillId.split('_');
  if (parts.length < 2) {
    throw new Error(`invalid active skill id: ${skillId}`);
  }
  return `${parts[0]}_${parts[1]}`;
}

if (!fs.existsSync(legacyPath)) {
  console.error('data/skills.json not found — already split?');
  process.exit(1);
}

const skills = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
if (!Array.isArray(skills.passives) || !Array.isArray(skills.actives)) {
  throw new Error('skills.json must have passives[] and actives[]');
}

fs.mkdirSync(passivesDir, { recursive: true });
fs.mkdirSync(activesDir, { recursive: true });

const passivesByStem = new Map();
for (const passive of skills.passives) {
  const stem = getActiveFileStem(passive.id);
  const bucket = passivesByStem.get(stem) ?? [];
  bucket.push(passive);
  passivesByStem.set(stem, bucket);
}

for (const [stem, passives] of [...passivesByStem.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  fs.writeFileSync(
    path.join(passivesDir, `${stem}.json`),
    `${JSON.stringify(passives, null, 2)}\n`,
  );
}

const byStem = new Map();
for (const active of skills.actives) {
  const stem = getActiveFileStem(active.id);
  const bucket = byStem.get(stem) ?? [];
  bucket.push(active);
  byStem.set(stem, bucket);
}

for (const [stem, actives] of [...byStem.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  fs.writeFileSync(
    path.join(activesDir, `${stem}.json`),
    `${JSON.stringify(actives, null, 2)}\n`,
  );
}

fs.unlinkSync(legacyPath);

console.log(
  'split complete:',
  skills.passives.length,
  'passives in',
  passivesByStem.size,
  'files,',
  skills.actives.length,
  'actives in',
  byStem.size,
  'files',
);
