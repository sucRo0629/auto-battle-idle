import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  SkillCooldown,
} from './types.ts';
import { loadGameData } from './data/loadGameData.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import {
  ARENA_DOMINANCE_OVERLAY,
  isArenaDominanceActive,
} from './arenaDominance.ts';
import { forceActiveCooldownReady } from './skillTrigger.ts';

function mockDuelist(cdRemaining: number): CombatantState {
  return {
    id: 'duelist',
    name: 'duelist',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 30,
    def: 10,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: ['df_duelist_active_4'],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: 'df_duelist_active_4',
        remaining: cdRemaining,
        slotKind: 'active',
        slotIndex: 3,
      },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
  };
}

const arenaSkill: ActiveSkillDef = {
  id: 'df_duelist_active_4',
  name: '闘技場の掟',
  trigger: { kind: 'time', value: 0 },
  firePolicy: 'smart',
  fireConditions: [{ kind: 'finalWaveStart' }],
  stageTriggerLimit: 1,
  arenaDominanceDurationSec: 15,
  effect: [{ type: 'arenaDominance', target: { kind: 'self' }, durationSec: 15 }],
};

function createExecutor(gameData: GameData) {
  const runner = new SkillSequenceRunner();
  const emit = vi.fn();
  const executor = new SkillExecutor(
    gameData,
    emit,
    {
      getSequenceRunner: () => runner,
      getBattleTimeSec: () => 0,
      getAllCombatants: () => [],
    },
  );
  return { executor, emit };
}

describe('finalWaveStart active cooldown', () => {
  it('does not execute while remaining > 0 without forced reset', () => {
    const gameData = structuredClone(loadGameData()) as GameData;
    gameData.skillRegistry.actives['df_duelist_active_4'] = arenaSkill;
    const duelist = mockDuelist(999);
    const enemy: CombatantState = {
      ...mockDuelist(0),
      id: 'enemy',
      isEnemy: true,
      battleX: 200,
      visualX: 200,
    };
    const { executor } = createExecutor(gameData);

    const fired = executor.tryExecute(duelist, duelist.cooldowns[0]!, [duelist], [enemy]);
    expect(fired).toBe(false);
    expect(isArenaDominanceActive(duelist)).toBe(false);
  });

  it('executes arena dominance after forceActiveCooldownReady', () => {
    const gameData = structuredClone(loadGameData()) as GameData;
    gameData.skillRegistry.actives['df_duelist_active_4'] = arenaSkill;
    const duelist = mockDuelist(999);
    const cd = duelist.cooldowns[0]!;
    const enemy: CombatantState = {
      ...mockDuelist(0),
      id: 'enemy',
      isEnemy: true,
      atk: 40,
      battleX: 200,
      visualX: 200,
    };
    const { executor } = createExecutor(gameData);

    forceActiveCooldownReady(cd);
    const fired = executor.tryExecute(duelist, cd, [duelist], [enemy]);
    expect(fired).toBe(true);
    expect(isArenaDominanceActive(duelist)).toBe(true);
    expect(
      duelist.statusEffects.some((effect) => effect.overlay === ARENA_DOMINANCE_OVERLAY),
    ).toBe(true);
    expect(cd.remaining).toBe(0);
  });

  it('no-charge trigger stays ready after fire', () => {
    const cd: SkillCooldown = {
      skillId: 'df_duelist_active_4',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 3,
    };
    const gameData = structuredClone(loadGameData()) as GameData;
    gameData.skillRegistry.actives['df_duelist_active_4'] = arenaSkill;
    const duelist = mockDuelist(0);
    duelist.cooldowns[0] = cd;
    duelist.activeStageRemainingTriggers = { 'df_duelist_active_4': 1 };
    const enemy: CombatantState = {
      ...mockDuelist(0),
      id: 'enemy',
      isEnemy: true,
      battleX: 200,
      visualX: 200,
    };
    const { executor } = createExecutor(gameData);

    executor.tryExecute(duelist, cd, [duelist], [enemy]);
    expect(cd.remaining).toBe(0);
  });
});
