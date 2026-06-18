import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { applyDamageTakenToHeal } from './passiveEffects.ts';
import type { BattleEvent, CombatantState } from './types.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';

function mockAlly(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 80,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
    threat: 0,
    ...overrides,
  };
}

function mockEnemy(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return mockAlly({ ...overrides, isEnemy: true });
}

function damageTakenToHealEffect(ratio: number) {
  return {
    id: 'test_damageTakenToHeal',
    kind: 'buff' as const,
    overlay: 'damageTakenToHeal' as const,
    ratio,
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
    sourceId: 'ally',
    skillId: 'df_duelist_active_2',
  };
}

type HandleDamageThreat = (
  actor: CombatantState,
  target: CombatantState,
  amount: number,
  meta?: {
    attackKind: 'damage' | 'dot';
    isCounterDamage?: boolean;
    hpDamage?: number;
  },
) => void;

function callHandleDamageThreat(
  engine: BattleEngine,
  actor: CombatantState,
  target: CombatantState,
  amount: number,
  meta?: {
    attackKind: 'damage' | 'dot';
    isCounterDamage?: boolean;
    hpDamage?: number;
  },
): void {
  const internal = engine as unknown as { handleDamageThreat: HandleDamageThreat };
  internal.handleDamageThreat(actor, target, amount, meta);
}

describe('applyDamageTakenToHeal', () => {
  it('heals a fraction of hp damage based on overlay ratio', () => {
    const ally = mockAlly({
      id: 'ally',
      hp: 80,
      statusEffects: [damageTakenToHealEffect(0.5)],
    });

    const healed = applyDamageTakenToHeal(ally, 20);

    expect(healed).toBe(10);
    expect(ally.hp).toBe(90);
  });

  it('does not heal when damage is zero', () => {
    const ally = mockAlly({
      id: 'ally',
      statusEffects: [damageTakenToHealEffect(0.5)],
    });

    expect(applyDamageTakenToHeal(ally, 0)).toBe(0);
    expect(ally.hp).toBe(80);
  });

  it('caps heal at maxHp', () => {
    const ally = mockAlly({
      id: 'ally',
      hp: 95,
      statusEffects: [damageTakenToHealEffect(0.5)],
    });

    const healed = applyDamageTakenToHeal(ally, 20);

    expect(healed).toBe(5);
    expect(ally.hp).toBe(100);
  });
});

describe('BattleEngine damageTakenToHeal', () => {
  it('emits heal event when ally takes hp damage with overlay active', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );

    const ally = mockAlly({
      id: 'ally',
      hp: 80,
      statusEffects: [damageTakenToHealEffect(0.5)],
    });
    const enemy = mockEnemy({ id: 'enemy' });
    const events: BattleEvent[] = [];
    engine.onEvent((event) => events.push(event));

    callHandleDamageThreat(engine, enemy, ally, 20, {
      attackKind: 'damage',
      hpDamage: 20,
    });

    expect(ally.hp).toBe(90);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'skill',
        effect: 'heal',
        amount: 10,
        statusLabel: 'damageTakenToHeal',
        targetId: 'ally',
      }),
    );
  });

  it('does not heal when only barrier absorbs damage (hpDamage is zero)', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );

    const ally = mockAlly({
      id: 'ally',
      hp: 80,
      barrierHp: 30,
      statusEffects: [damageTakenToHealEffect(0.5)],
    });
    const enemy = mockEnemy({ id: 'enemy' });
    const events: BattleEvent[] = [];
    engine.onEvent((event) => events.push(event));

    callHandleDamageThreat(engine, enemy, ally, 30, {
      attackKind: 'damage',
      hpDamage: 0,
    });

    expect(ally.hp).toBe(80);
    expect(
      events.some(
        (event) =>
          event.type === 'skill' &&
          event.effect === 'heal' &&
          event.statusLabel === 'damageTakenToHeal',
      ),
    ).toBe(false);
  });
});
