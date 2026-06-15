import fs from 'node:fs';
import path from 'node:path';
import type { ActiveSkillDef, PassiveSkillDef } from '../types.ts';

export const SKILLS_DATA_DIR = path.resolve(process.cwd(), 'data/skills');
export const PASSIVES_PATH = path.join(SKILLS_DATA_DIR, 'passives.json');
export const ACTIVES_DIR = path.join(SKILLS_DATA_DIR, 'actives');

/** active スキル ID の先頭2セグメント（例: df_guardian_active_1 → df_guardian） */
export function getActiveFileStemForSkillId(skillId: string): string {
  const parts = skillId.split('_');
  if (parts.length < 2) {
    throw new Error(`invalid active skill id: ${skillId}`);
  }
  return `${parts[0]}_${parts[1]}`;
}

export function activeFilePath(stem: string): string {
  return path.join(ACTIVES_DIR, `${stem}.json`);
}

function readJsonArray<T>(filePath: string): T[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must be a JSON array`);
  }
  return parsed as T[];
}

function writeJsonArray(filePath: string, items: unknown[]): void {
  fs.writeFileSync(filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
}

export function readPassives(): PassiveSkillDef[] {
  return readJsonArray<PassiveSkillDef>(PASSIVES_PATH);
}

export function writePassives(passives: PassiveSkillDef[]): void {
  writeJsonArray(PASSIVES_PATH, passives);
}

export function readActiveFile(stem: string): ActiveSkillDef[] {
  return readJsonArray<ActiveSkillDef>(activeFilePath(stem));
}

export function writeActiveFile(stem: string, actives: ActiveSkillDef[]): void {
  writeJsonArray(activeFilePath(stem), actives);
}

export function readAllActiveFiles(): ActiveSkillDef[] {
  if (!fs.existsSync(ACTIVES_DIR)) {
    return [];
  }
  const files = fs
    .readdirSync(ACTIVES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  return files.flatMap((name) =>
    readJsonArray<ActiveSkillDef>(path.join(ACTIVES_DIR, name)),
  );
}

export function readSkillsRoot(): {
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
} {
  return {
    passives: readPassives(),
    actives: readAllActiveFiles(),
  };
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

/** 分割ファイルへ upsert し、書き込んだファイルパスを返す */
export function upsertSkillsToFiles(
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
): string[] {
  const written = new Set<string>();

  if (passives.length > 0) {
    let nextPassives = readPassives();
    for (const passive of passives) {
      nextPassives = upsertById(nextPassives, passive);
    }
    writePassives(nextPassives);
    written.add(PASSIVES_PATH);
  }

  const activesByStem = new Map<string, ActiveSkillDef[]>();
  for (const active of actives) {
    const stem = getActiveFileStemForSkillId(active.id);
    const bucket = activesByStem.get(stem) ?? readActiveFile(stem);
    activesByStem.set(stem, upsertById(bucket, active));
  }

  for (const [stem, nextActives] of activesByStem) {
    writeActiveFile(stem, nextActives);
    written.add(activeFilePath(stem));
  }

  return [...written];
}
