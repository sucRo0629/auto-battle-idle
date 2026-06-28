import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../events.ts';
import type { CombatantState, GameData } from '../types.ts';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from '../../render/skillAnimRegistry.ts';
import { SkillExecutor } from './SkillExecutor.ts';
import { SkillSequenceRunner } from './skillSequence.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 48 } as HTMLImageElement;
}

function makeActor(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    id: 'p1',
    name: 'p1',
    isAlive: true,
    isEnemy: false,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    battleX: 100,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    threat: 0,
    baseThreat: 0,
    statusEffects: [],
    cooldowns: [],
    corpseVisible: true,
    spriteKey: 'at_warrior',
    iconKey: 'placeholder',
    traits: {
      rangePx: 40,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    ...overrides,
  } as CombatantState;
}

function makeEnemy(): CombatantState {
  return makeActor({
    id: 'e1',
    name: 'e1',
    isEnemy: true,
    battleX: 130,
    role: 'attacker',
    spriteKey: 'enemy_grunt',
  });
}

describe('applyFrame', () => {
  it('emits skillWindup immediately and defers damage via pending queue', () => {
    __registerSkillAnimForTest('test_basic', mockImage(256));
    const events: BattleEvent[] = [];
    const pending: Parameters<SkillExecutor['applyPendingHit']>[0][] = [];
    let battleSec = 0;

    const gameData = {
      skillRegistry: {
        actives: {
          test_basic: {
            id: 'test_basic',
            name: 'Test Basic',
            trigger: { kind: 'time', value: 1 },
            effect: [
              {
                type: 'damage',
                damageType: 'physical',
                target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                amount: { kind: 'atkBased', atkScale: 1 },
                animStartFrame: 1,
                applyFrame: 3,
              },
            ],
          },
        },
        passives: {},
      },
    } as unknown as GameData;

    const runner = new SkillSequenceRunner();

    const actor = makeActor();
    const enemy = makeEnemy();
    const cd = { skillId: 'test_basic', remaining: 0, slotKind: 'basic' as const };

    const executor = new SkillExecutor(
      gameData,
      (event) => events.push(event),
      {
        getBattleTimeSec: () => battleSec,
        enqueuePendingHits: (hits) => {
          pending.push(...hits);
        },
        getAllCombatants: () => [actor, enemy],
        getSequenceRunner: () => runner,
      },
    );

    const fired = executor.tryExecute(actor, cd, [actor], [enemy]);
    expect(fired).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['skillWindup']);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.applyAtBattleSec).toBe(0.25);

    battleSec = 0.25;
    const applied = executor.applyPendingHit(pending[0]!);
    expect(applied).toBe(true);
    expect(events.some((e) => e.type === 'skill' && e.effect === 'damage')).toBe(
      true,
    );
    expect(enemy.hp).toBeLessThan(100);
    __resetSkillAnimsForTest();
  });
});
