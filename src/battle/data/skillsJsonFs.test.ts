import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSkillDef, PassiveSkillDef } from '../types.ts';

function passive(id: string): PassiveSkillDef {
  return { id, name: id, effect: { type: 'stat', stat: 'def', value: 1 } };
}

function active(id: string): ActiveSkillDef {
  return {
    id,
    name: id,
    trigger: { kind: 'time', value: 2 },
    effect: [
      {
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        type: 'damage',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
  };
}

describe('replaceEntitySkillsInFiles', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    vi.resetModules();
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-json-fs-'));
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'data/skills/passives'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'data/skills/actives'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes orphan passives from the entity stem file', async () => {
    const guardianPassives = [
      passive('df_guardian_passive_1'),
      passive('df_guardian_passive_2'),
      passive('df_guardian_passive_3'),
      passive('df_guardian_passive_4'),
      passive('df_guardian_passive_5'),
    ];
    fs.writeFileSync(
      path.join(tmpDir, 'data/skills/passives/df_guardian.json'),
      `${JSON.stringify(guardianPassives, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'data/skills/passives/df_paladin.json'),
      `${JSON.stringify([passive('df_paladin_passive_1'), passive('df_paladin_passive_5')], null, 2)}\n`,
    );

    const { replaceEntitySkillsInFiles, readPassiveFile } = await import('./skillsJsonFs.ts');
    replaceEntitySkillsInFiles(
      'df_guardian',
      [
        passive('df_guardian_passive_1'),
        passive('df_guardian_passive_2'),
        passive('df_guardian_passive_3'),
      ],
      [],
    );

    const guardianIds = readPassiveFile('df_guardian').map((p) => p.id);
    expect(guardianIds).toEqual([
      'df_guardian_passive_1',
      'df_guardian_passive_2',
      'df_guardian_passive_3',
    ]);
    expect(readPassiveFile('df_paladin').map((p) => p.id)).toEqual([
      'df_paladin_passive_1',
      'df_paladin_passive_5',
    ]);
  });

  it('does not change other entity stem files', async () => {
    const paladinPassives = [passive('df_paladin_passive_1'), passive('df_paladin_passive_2')];
    const paladinPath = path.join(tmpDir, 'data/skills/passives/df_paladin.json');
    fs.writeFileSync(paladinPath, `${JSON.stringify(paladinPassives, null, 2)}\n`);
    const paladinBefore = fs.readFileSync(paladinPath, 'utf8');

    fs.writeFileSync(
      path.join(tmpDir, 'data/skills/passives/df_guardian.json'),
      `${JSON.stringify([passive('df_guardian_passive_1')], null, 2)}\n`,
    );

    const { replaceEntitySkillsInFiles } = await import('./skillsJsonFs.ts');
    replaceEntitySkillsInFiles('df_guardian', [passive('df_guardian_passive_1')], []);

    expect(fs.readFileSync(paladinPath, 'utf8')).toBe(paladinBefore);
  });
});

describe('mergeSkillsRootAfterEntityReplace', () => {
  it('removes orphan skills for the entity stem from in-memory skills root', async () => {
    const { mergeSkillsRootAfterEntityReplace } = await import('./skillsJsonFs.ts');

    const skillsRoot = {
      passives: [
        passive('df_guardian_passive_1'),
        passive('df_guardian_passive_4'),
        passive('df_guardian_passive_5'),
        passive('df_paladin_passive_1'),
      ],
      actives: [
        active('df_guardian_active_1'),
        active('df_guardian_active_2'),
        active('df_paladin_active_1'),
      ],
    };

    const next = mergeSkillsRootAfterEntityReplace(
      skillsRoot,
      'df_guardian',
      [passive('df_guardian_passive_1'), passive('df_guardian_passive_2')],
      [active('df_guardian_active_1')],
    );

    expect(next.passives.map((p) => p.id)).toEqual([
      'df_paladin_passive_1',
      'df_guardian_passive_1',
      'df_guardian_passive_2',
    ]);
    expect(next.actives.map((a) => a.id)).toEqual([
      'df_paladin_active_1',
      'df_guardian_active_1',
    ]);
  });
});
