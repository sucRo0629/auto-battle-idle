import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = path.join(root, 'data/skills');
const legacyPath = path.join(skillsDir, 'passives.json');
const passivesDir = path.join(skillsDir, 'passives');

function getSkillFileStem(skillId) {
  const parts = skillId.split('_');
  if (parts.length < 2) {
    throw new Error(`invalid skill id: ${skillId}`);
  }
  return `${parts[0]}_${parts[1]}`;
}

if (!fs.existsSync(legacyPath)) {
  console.error('data/skills/passives.json not found — already split?');
  process.exit(1);
}

const passives = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
if (!Array.isArray(passives)) {
  throw new Error('passives.json must be a JSON array');
}

const byId = new Map();
for (const passive of passives) {
  byId.set(passive.id, passive);
}
const deduped = [...byId.values()];

fs.mkdirSync(passivesDir, { recursive: true });

const byStem = new Map();
for (const passive of deduped) {
  const stem = getSkillFileStem(passive.id);
  const bucket = byStem.get(stem) ?? [];
  bucket.push(passive);
  byStem.set(stem, bucket);
}

for (const [stem, stemPassives] of [...byStem.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  fs.writeFileSync(
    path.join(passivesDir, `${stem}.json`),
    `${JSON.stringify(stemPassives, null, 2)}\n`,
  );
}

fs.unlinkSync(legacyPath);

console.log(
  'split complete:',
  deduped.length,
  'passives (',
  passives.length - deduped.length,
  'duplicates removed) in',
  byStem.size,
  'files',
);
