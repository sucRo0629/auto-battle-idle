import fs from 'node:fs';
import path from 'node:path';
import type { ActiveSkillDef, PassiveSkillDef } from '../types.ts';

export const SKILLS_DATA_DIR = path.resolve(process.cwd(), 'data/skills');
export const PASSIVES_DIR = path.join(SKILLS_DATA_DIR, 'passives');
export const ACTIVES_DIR = path.join(SKILLS_DATA_DIR, 'actives');

/** スキル ID の先頭2セグメント（例: df_guardian_passive_1 → df_guardian） */
export function getSkillFileStemForSkillId(skillId: string): string {
  const parts = skillId.split('_');
  if (parts.length < 2) {
    throw new Error(`invalid skill id: ${skillId}`);
  }
  return `${parts[0]}_${parts[1]}`;
}

/** @deprecated use getSkillFileStemForSkillId */
export function getActiveFileStemForSkillId(skillId: string): string {
  return getSkillFileStemForSkillId(skillId);
}

export function passiveFilePath(stem: string): string {
  return path.join(PASSIVES_DIR, `${stem}.json`);
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
}

export function readPassiveFile(stem: string): PassiveSkillDef[] {
  return readJsonArray<PassiveSkillDef>(passiveFilePath(stem));
}

export function writePassiveFile(stem: string, passives: PassiveSkillDef[]): void {
  writeJsonArray(passiveFilePath(stem), passives);
}

export function readAllPassiveFiles(): PassiveSkillDef[] {
  if (!fs.existsSync(PASSIVES_DIR)) {
    return [];
  }
  const files = fs
    .readdirSync(PASSIVES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  return files.flatMap((name) =>
    readJsonArray<PassiveSkillDef>(path.join(PASSIVES_DIR, name)),
  );
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
    passives: readAllPassiveFiles(),
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

  const passivesByStem = new Map<string, PassiveSkillDef[]>();
  for (const passive of passives) {
    const stem = getSkillFileStemForSkillId(passive.id);
    const filePath = passiveFilePath(stem);
    const bucket =
      passivesByStem.get(stem) ??
      (fs.existsSync(filePath) ? readPassiveFile(stem) : []);
    passivesByStem.set(stem, upsertById(bucket, passive));
  }

  for (const [stem, nextPassives] of passivesByStem) {
    writePassiveFile(stem, nextPassives);
    written.add(passiveFilePath(stem));
  }

  const activesByStem = new Map<string, ActiveSkillDef[]>();
  for (const active of actives) {
    const stem = getSkillFileStemForSkillId(active.id);
    const filePath = activeFilePath(stem);
    const bucket =
      activesByStem.get(stem) ??
      (fs.existsSync(filePath) ? readActiveFile(stem) : []);
    activesByStem.set(stem, upsertById(bucket, active));
  }

  for (const [stem, nextActives] of activesByStem) {
    writeActiveFile(stem, nextActives);
    written.add(activeFilePath(stem));
  }

  return [...written];
}

/** in-memory skills root から entityStem 分を payload で置換（orphan 除去） */
export function mergeSkillsRootAfterEntityReplace(
  skillsRoot: { passives: PassiveSkillDef[]; actives: ActiveSkillDef[] },
  entityStem: string,
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
): { passives: PassiveSkillDef[]; actives: ActiveSkillDef[] } {
  const belongsToEntity = (skillId: string) =>
    getSkillFileStemForSkillId(skillId) === entityStem;

  const otherPassives = skillsRoot.passives.filter((p) => !belongsToEntity(p.id));
  const otherActives = skillsRoot.actives.filter((a) => !belongsToEntity(a.id));

  return {
    passives: [...otherPassives, ...passives],
    actives: [...otherActives, ...actives],
  };
}

/** entityStem の stem ファイルを payload で丸ごと上書き（他 stem は変更しない） */
export function replaceEntitySkillsInFiles(
  entityStem: string,
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
): string[] {
  writePassiveFile(entityStem, passives);
  writeActiveFile(entityStem, actives);
  return [passiveFilePath(entityStem), activeFilePath(entityStem)];
}
