import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { parseAndValidateGameDataJson } from './src/battle/data/validateGameData.ts';
import type {
  ActiveSkillDef,
  EnemyTemplate,
  PassiveSkillDef,
} from './src/battle/types.ts';
import type { ClassPresetBeforeEnrich } from './src/progression/skillUnlocks.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');

const READ_FILES = {
  classes: path.join(DATA_DIR, 'classes.json'),
  testClasses: path.join(DATA_DIR, 'test-classes.json'),
  skills: path.join(DATA_DIR, 'skills.json'),
  testSkills: path.join(DATA_DIR, 'test-skills.json'),
  enemies: path.join(DATA_DIR, 'enemies.json'),
  stages: path.join(DATA_DIR, 'stages.json'),
  parties: path.join(DATA_DIR, 'parties.json'),
  testParties: path.join(DATA_DIR, 'test-parties.json'),
} as const;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mergeSkills(
  base: { passives: unknown[]; actives: unknown[] },
  extra: { passives?: unknown[]; actives?: unknown[] },
): { passives: unknown[]; actives: unknown[] } {
  return {
    passives: [...base.passives, ...(extra.passives ?? [])],
    actives: [...base.actives, ...(extra.actives ?? [])],
  };
}

function loadValidationPayload(): {
  classes: unknown;
  skills: unknown;
  enemies: unknown;
  stages: unknown;
  parties: unknown;
} {
  const classes = [
    ...(readJsonFile(READ_FILES.classes) as unknown[]),
    ...(readJsonFile(READ_FILES.testClasses) as unknown[]),
  ];
  const skills = mergeSkills(
    readJsonFile(READ_FILES.skills) as { passives: unknown[]; actives: unknown[] },
    readJsonFile(READ_FILES.testSkills) as {
      passives?: unknown[];
      actives?: unknown[];
    },
  );
  return {
    classes,
    skills,
    enemies: readJsonFile(READ_FILES.enemies),
    stages: readJsonFile(READ_FILES.stages),
    parties: {
      ...(readJsonFile(READ_FILES.parties) as Record<string, unknown>),
      ...(readJsonFile(READ_FILES.testParties) as Record<string, unknown>),
    },
  };
}

function validateAll(payload: ReturnType<typeof loadValidationPayload>): void {
  parseAndValidateGameDataJson(payload, { mode: 'editor' });
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

function upsertSkills(
  skillsRoot: { passives: PassiveSkillDef[]; actives: ActiveSkillDef[] },
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
): { passives: PassiveSkillDef[]; actives: ActiveSkillDef[] } {
  let nextPassives = skillsRoot.passives;
  let nextActives = skillsRoot.actives;
  for (const passive of passives) {
    nextPassives = upsertById(nextPassives, passive);
  }
  for (const active of actives) {
    nextActives = upsertById(nextActives, active);
  }
  return { passives: nextPassives, actives: nextActives };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

interface ClassBundleBody {
  class: ClassPresetBeforeEnrich;
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
}

interface EnemyBundleBody {
  enemy: EnemyTemplate;
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
}

function applyClassBundle(body: ClassBundleBody): void {
  const classes = readJsonFile(READ_FILES.classes) as ClassPresetBeforeEnrich[];
  const skillsRoot = readJsonFile(READ_FILES.skills) as {
    passives: PassiveSkillDef[];
    actives: ActiveSkillDef[];
  };

  const nextClasses = upsertById(classes, body.class);
  const nextSkills = upsertSkills(skillsRoot, body.passives, body.actives);

  const validationBase = loadValidationPayload();
  validateAll({
    ...validationBase,
    classes: [
      ...nextClasses,
      ...(readJsonFile(READ_FILES.testClasses) as unknown[]),
    ],
    skills: mergeSkills(nextSkills, readJsonFile(READ_FILES.testSkills) as {
      passives?: unknown[];
      actives?: unknown[];
    }),
  });

  writeJsonFile(READ_FILES.classes, nextClasses);
  writeJsonFile(READ_FILES.skills, nextSkills);
}

function applyEnemyBundle(body: EnemyBundleBody): void {
  const enemies = readJsonFile(READ_FILES.enemies) as EnemyTemplate[];
  const skillsRoot = readJsonFile(READ_FILES.skills) as {
    passives: PassiveSkillDef[];
    actives: ActiveSkillDef[];
  };

  const nextEnemies = upsertById(enemies, body.enemy);
  const nextSkills = upsertSkills(skillsRoot, body.passives, body.actives);

  const validationBase = loadValidationPayload();
  validateAll({
    ...validationBase,
    enemies: nextEnemies,
    skills: mergeSkills(nextSkills, readJsonFile(READ_FILES.testSkills) as {
      passives?: unknown[];
      actives?: unknown[];
    }),
  });

  writeJsonFile(READ_FILES.enemies, nextEnemies);
  writeJsonFile(READ_FILES.skills, nextSkills);
}

export function editorApiPlugin(): Plugin {
  return {
    name: 'editor-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__editor/')) {
          next();
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');

          if (req.method === 'GET' && url.pathname === '/__editor/classes') {
            sendJson(res, 200, readJsonFile(READ_FILES.classes));
            return;
          }
          if (req.method === 'GET' && url.pathname === '/__editor/skills') {
            sendJson(res, 200, readJsonFile(READ_FILES.skills));
            return;
          }
          if (req.method === 'GET' && url.pathname === '/__editor/enemies') {
            sendJson(res, 200, readJsonFile(READ_FILES.enemies));
            return;
          }

          if (req.method === 'PUT' && url.pathname === '/__editor/class-bundle') {
            const body = JSON.parse(await readBody(req)) as ClassBundleBody;
            applyClassBundle(body);
            sendJson(res, 200, { ok: true });
            return;
          }
          if (req.method === 'PUT' && url.pathname === '/__editor/enemy-bundle') {
            const body = JSON.parse(await readBody(req)) as EnemyBundleBody;
            applyEnemyBundle(body);
            sendJson(res, 200, { ok: true });
            return;
          }

          sendJson(res, 404, { error: 'Not found' });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(res, 400, { error: message });
        }
      });
    },
  };
}
