import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ModuleNode, Plugin, ViteDevServer } from 'vite';
import { parseAndValidateGameDataJson } from './src/battle/data/validateGameData.ts';
import type {
  ActiveSkillDef,
  EnemyTemplate,
  PassiveSkillDef,
  SkillVfxDef,
} from '../battle/types.ts';
import type { ClassPresetBeforeEnrich } from './src/progression/skillUnlocks.ts';
import { ensureClassGrowthFields } from './src/editor/editorApi.ts';
import {
  readSkillsRoot,
  upsertSkillsToFiles,
} from './src/battle/data/skillsJsonFs.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');

const READ_FILES = {
  classes: path.join(DATA_DIR, 'classes.json'),
  enemies: path.join(DATA_DIR, 'enemies.json'),
  stages: path.join(DATA_DIR, 'stages.json'),
  parties: path.join(DATA_DIR, 'parties.json'),
} as const;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const LOAD_GAME_DATA_MODULE = path.resolve(
  process.cwd(),
  'src/battle/data/loadGameData.ts',
);

/** Vite moduleGraph が使う形式（絶対パス + `/` 区切り）に揃える */
function toModuleGraphFilePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * エディタ保存後、watch 対象外の JSON をゲーム側へ HMR 反映する。
 * invalidateModule だけではクライアントに更新が届かないため reloadModule を使う。
 */
async function reloadGameDataModules(
  server: ViteDevServer | undefined,
  writtenFiles: string[],
): Promise<void> {
  if (!server) return;

  const files = [
    ...new Set([
      ...writtenFiles.map(toModuleGraphFilePath),
      toModuleGraphFilePath(LOAD_GAME_DATA_MODULE),
    ]),
  ];

  const reloaded = new Set<ModuleNode>();
  for (const filePath of files) {
    const mods = server.moduleGraph.getModulesByFile(filePath);
    if (!mods) continue;
    for (const mod of mods) {
      if (reloaded.has(mod)) continue;
      reloaded.add(mod);
      await server.reloadModule(mod);
    }
  }
}

function loadValidationPayload(): {
  classes: unknown;
  skills: unknown;
  enemies: unknown;
  stages: unknown;
  parties: unknown;
} {
  return {
    classes: readJsonFile(READ_FILES.classes),
    skills: readSkillsRoot(),
    enemies: readJsonFile(READ_FILES.enemies),
    stages: readJsonFile(READ_FILES.stages),
    parties: readJsonFile(READ_FILES.parties),
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

interface PresentationSkillBody {
  active: ActiveSkillDef;
  entityKind?: 'class' | 'enemy';
  entityId?: string;
  basicAttackVfx?: SkillVfxDef;
}

interface ClassStatsPatchBody {
  id: string;
  maxHp: number;
  atk: number;
  def: number;
  reg: number;
  rangePx: number;
  growthTier: ClassPresetBeforeEnrich['growthTier'];
  attackSpeedTier: ClassPresetBeforeEnrich['attackSpeedTier'];
  growthPresetKey?: 'caster';
}

interface ClassStatsBulkBody {
  patches: ClassStatsPatchBody[];
}

async function applyClassBundle(
  body: ClassBundleBody,
  server?: ViteDevServer,
): Promise<void> {
  const classes = readJsonFile(READ_FILES.classes) as ClassPresetBeforeEnrich[];
  const skillsRoot = readSkillsRoot();

  const nextClasses = upsertById(classes, body.class);
  const nextPassives = body.passives.reduce(
    (list, passive) => upsertById(list, passive),
    skillsRoot.passives,
  );
  const nextActives = body.actives.reduce(
    (list, active) => upsertById(list, active),
    skillsRoot.actives,
  );

  const validationBase = loadValidationPayload();
  validateAll({
    ...validationBase,
    classes: nextClasses,
    skills: { passives: nextPassives, actives: nextActives },
  });

  writeJsonFile(READ_FILES.classes, nextClasses);
  const writtenSkillFiles = upsertSkillsToFiles(body.passives, body.actives);
  await reloadGameDataModules(server, [READ_FILES.classes, ...writtenSkillFiles]);
}

async function applyClassStatsBulk(
  body: ClassStatsBulkBody,
  server?: ViteDevServer,
): Promise<void> {
  if (!Array.isArray(body.patches) || body.patches.length === 0) {
    throw new Error('patches must be a non-empty array');
  }

  const classes = readJsonFile(READ_FILES.classes) as ClassPresetBeforeEnrich[];
  let nextClasses = classes;

  for (const patch of body.patches) {
    const index = nextClasses.findIndex((entry) => entry.id === patch.id);
    if (index < 0) {
      throw new Error(`class not found: ${patch.id}`);
    }
    const existing = nextClasses[index]!;
    const merged: ClassPresetBeforeEnrich = {
      ...existing,
      maxHp: patch.maxHp,
      atk: patch.atk,
      def: patch.def,
      reg: patch.reg,
      traits: {
        ...existing.traits,
        rangePx: patch.rangePx,
      },
      growthTier: patch.growthTier,
      attackSpeedTier: patch.attackSpeedTier,
    };
    if (merged.role === 'attacker' && patch.growthPresetKey === 'caster') {
      merged.growthPresetKey = 'caster';
    } else {
      delete merged.growthPresetKey;
    }
    ensureClassGrowthFields(merged);
    nextClasses = [...nextClasses];
    nextClasses[index] = merged;
  }

  const validationBase = loadValidationPayload();
  validateAll({
    ...validationBase,
    classes: nextClasses,
  });

  writeJsonFile(READ_FILES.classes, nextClasses);
  await reloadGameDataModules(server, [READ_FILES.classes]);
}

async function applyEnemyBundle(
  body: EnemyBundleBody,
  server?: ViteDevServer,
): Promise<void> {
  const enemies = readJsonFile(READ_FILES.enemies) as EnemyTemplate[];
  const skillsRoot = readSkillsRoot();

  const nextEnemies = upsertById(enemies, body.enemy);
  const nextPassives = body.passives.reduce(
    (list, passive) => upsertById(list, passive),
    skillsRoot.passives,
  );
  const nextActives = body.actives.reduce(
    (list, active) => upsertById(list, active),
    skillsRoot.actives,
  );

  const validationBase = loadValidationPayload();
  validateAll({
    ...validationBase,
    enemies: nextEnemies,
    skills: { passives: nextPassives, actives: nextActives },
  });

  writeJsonFile(READ_FILES.enemies, nextEnemies);
  const writtenSkillFiles = upsertSkillsToFiles(body.passives, body.actives);
  await reloadGameDataModules(server, [READ_FILES.enemies, ...writtenSkillFiles]);
}

async function applyPresentationSkill(
  body: PresentationSkillBody,
  server?: ViteDevServer,
): Promise<void> {
  const skillsRoot = readSkillsRoot();
  const nextActives = upsertById(skillsRoot.actives, body.active);

  const validationBase = loadValidationPayload();
  let nextClasses = validationBase.classes as ClassPresetBeforeEnrich[];
  let nextEnemies = validationBase.enemies as EnemyTemplate[];
  const reloadFiles: string[] = [];

  if (
    body.entityKind &&
    body.entityId &&
    body.basicAttackVfx !== undefined
  ) {
    if (body.entityKind === 'class') {
      nextClasses = (nextClasses as ClassPresetBeforeEnrich[]).map((cls) => {
        if (cls.id !== body.entityId) return cls;
        return {
          ...cls,
          traits: {
            ...cls.traits,
            basicAttackVfx: body.basicAttackVfx,
          },
        };
      });
      reloadFiles.push(READ_FILES.classes);
    } else {
      nextEnemies = (nextEnemies as EnemyTemplate[]).map((enemy) => {
        if (enemy.id !== body.entityId) return enemy;
        return {
          ...enemy,
          traits: {
            ...enemy.traits,
            basicAttackVfx: body.basicAttackVfx,
          },
        };
      });
      reloadFiles.push(READ_FILES.enemies);
    }
  }

  validateAll({
    ...validationBase,
    classes: nextClasses,
    enemies: nextEnemies,
    skills: { passives: skillsRoot.passives, actives: nextActives },
  });

  const writtenSkillFiles = upsertSkillsToFiles([], [body.active]);
  if (reloadFiles.includes(READ_FILES.classes)) {
    writeJsonFile(READ_FILES.classes, nextClasses);
  }
  if (reloadFiles.includes(READ_FILES.enemies)) {
    writeJsonFile(READ_FILES.enemies, nextEnemies);
  }
  await reloadGameDataModules(server, [...reloadFiles, ...writtenSkillFiles]);
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
            sendJson(res, 200, readSkillsRoot());
            return;
          }
          if (req.method === 'GET' && url.pathname === '/__editor/enemies') {
            sendJson(res, 200, readJsonFile(READ_FILES.enemies));
            return;
          }

          if (req.method === 'PUT' && url.pathname === '/__editor/class-bundle') {
            const body = JSON.parse(await readBody(req)) as ClassBundleBody;
            await applyClassBundle(body, server);
            sendJson(res, 200, { ok: true });
            return;
          }
          if (req.method === 'PUT' && url.pathname === '/__editor/class-stats-bulk') {
            const body = JSON.parse(await readBody(req)) as ClassStatsBulkBody;
            await applyClassStatsBulk(body, server);
            sendJson(res, 200, { ok: true });
            return;
          }
          if (req.method === 'PUT' && url.pathname === '/__editor/enemy-bundle') {
            const body = JSON.parse(await readBody(req)) as EnemyBundleBody;
            await applyEnemyBundle(body, server);
            sendJson(res, 200, { ok: true });
            return;
          }
          if (req.method === 'PUT' && url.pathname === '/__editor/presentation-skill') {
            const body = JSON.parse(await readBody(req)) as PresentationSkillBody;
            await applyPresentationSkill(body, server);
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
