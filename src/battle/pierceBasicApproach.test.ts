import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import {
  resolveAllPlayerApproachBattleX,
  resolvePlayerChaseApproachBattleX,
  resolvePierceApproachStopBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import { getEnemyContactX } from './combatPosition.ts';
import { mockApproachCombatant, mockMeleeTraits } from './testFixtures.ts';

const PIERCE_RANGE = 70;

const pierceGameData = {
  skillRegistry: {
    passives: {},
    actives: {
      pierce_basic: {
        id: 'pierce_basic',
        name: 'pierce',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
            targetShape: 'pierce',
            range: PIERCE_RANGE,
          },
        ],
      },
      basic_melee: {
        id: 'basic_melee',
        name: 'basic',
        trigger: { kind: 'time', value: 2 },
        effect: [
          {
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
          },
        ],
      },
    },
  },
} as unknown as GameData;

function pierceLancer(overrides: Partial<CombatantState> = {}): CombatantState {
  return mockApproachCombatant({
    id: 'lancer',
    formationRow: 'back',
    battleX: 60,
    traits: {
      rangePx: PIERCE_RANGE,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    cooldowns: [{ skillId: 'pierce_basic', remaining: 0, slotKind: 'basic' }],
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    ...overrides,
  });
}

function enemyLine(): CombatantState[] {
  return [200, 220, 240].map((battleX, index) =>
    mockApproachCombatant({
      id: `enemy-${index}`,
      isEnemy: true,
      battleX,
      traits: mockMeleeTraits(),
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    }),
  );
}

describe('pierce enemy basic approach', () => {
  it('approaches to contact-range and does not stop while front enemy is in range early', () => {
    const lancer = pierceLancer({ battleX: 120 });
    const enemies = enemyLine();
    const contact = getEnemyContactX(enemies)!;
    expect(contact).toBe(200);

    const pierceStopX = resolvePierceApproachStopBattleX(
      lancer,
      contact,
      pierceGameData,
      1,
    );
    expect(pierceStopX).toBe(130);

    expect(
      shouldSkipEngagedAutoApproach(lancer, [lancer], enemies, pierceGameData),
    ).toBe(false);

    const approachX = resolveAllPlayerApproachBattleX(
      [lancer],
      enemies,
      pierceGameData,
    ).get(lancer.id);
    expect(approachX).toBe(130);

    const settledLancer = pierceLancer({ battleX: 130 });
    expect(
      shouldSkipEngagedAutoApproach(
        settledLancer,
        [settledLancer],
        enemies,
        pierceGameData,
      ),
    ).toBe(true);
  });

  it('uses contact-based pierceStopX when a back-line ranged enemy is farther', () => {
    const lancer = pierceLancer({ battleX: 60 });
    const melee = mockApproachCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 200,
      traits: mockMeleeTraits(),
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const ranged = mockApproachCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 350,
      traits: {
        rangePx: 100,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const enemies = [melee, ranged];
    const contact = getEnemyContactX(enemies)!;

    expect(
      resolvePierceApproachStopBattleX(lancer, contact, pierceGameData, 1),
    ).toBe(130);
    expect(
      resolvePlayerChaseApproachBattleX(
        lancer,
        [lancer],
        enemies,
        pierceGameData,
        contact,
      ),
    ).toBe(130);
  });

  it('does not change non-pierce melee shouldSkip behavior', () => {
    const guard = mockApproachCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      traits: mockMeleeTraits(),
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enemy = mockApproachCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 200,
      traits: mockMeleeTraits(),
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    expect(
      shouldSkipEngagedAutoApproach(guard, [guard], [enemy], pierceGameData),
    ).toBe(true);

    const outOfRange = { ...guard, battleX: 198 };
    expect(
      shouldSkipEngagedAutoApproach(
        outOfRange,
        [outOfRange],
        [enemy],
        pierceGameData,
      ),
    ).toBe(false);
  });

  it('does not stop pierce approach early when front enemy is in range before contact standoff', () => {
    const lancer = pierceLancer({ battleX: 170 });
    const enemies = enemyLine();

    expect(
      shouldSkipEngagedAutoApproach(lancer, [lancer], enemies, pierceGameData),
    ).toBe(false);
  });

  it('keeps approaching when overshot past pierceStopX', () => {
    const lancer = pierceLancer({ battleX: 140 });
    const enemies = enemyLine();

    expect(
      shouldSkipEngagedAutoApproach(lancer, [lancer], enemies, pierceGameData),
    ).toBe(false);
  });

  it('resolvePlayerChaseApproachBattleX returns contact-based stop for pierce basic', () => {
    const lancer = pierceLancer();
    const enemies = enemyLine();
    const contact = getEnemyContactX(enemies)!;

    expect(
      resolvePlayerChaseApproachBattleX(
        lancer,
        [lancer],
        enemies,
        pierceGameData,
        contact,
      ),
    ).toBe(contact - PIERCE_RANGE);
  });
});
