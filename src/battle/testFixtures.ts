import type { CombatantState, GameData, NormalizedEntityTraits } from './types.ts';

export function mockMeleeTraits(): NormalizedEntityTraits {
  return {
    rangePx: 0,
    damageType: 'physical',
    basicAttackVfx: { enabled: true },
  };
}

export function mockRangedTraits(rangePx = 100): NormalizedEntityTraits {
  return {
    rangePx,
    damageType: 'physical',
    basicAttackVfx: { enabled: true },
  };
}

export type MockCombatantPreset =
  | 'neutral'
  | 'rangedArcher'
  | 'meleeFront'
  | 'counterDefender'
  | 'supporter'
  | 'stageTracker';

function presetBase(preset: MockCombatantPreset): Omit<CombatantState, 'id' | 'name'> {
  switch (preset) {
    case 'rangedArcher':
      return {
        hp: 100,
        maxHp: 100,
        barrierHp: 0,
        atk: 10,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'attacker',
        classId: 'test',
        formationRow: 'back',
        traits: mockRangedTraits(100),
        build: {
          learnedPassiveIds: ['archer_passive'],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
        cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
        statusEffects: [],
        spriteKey: 'placeholder',
        iconKey: 'placeholder',
        isEnemy: false,
        battleX: 60,
        corpseVisible: true,
      };
    case 'meleeFront':
      return {
        hp: 100,
        maxHp: 100,
        barrierHp: 0,
        atk: 10,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'attacker',
        classId: 'test',
        formationRow: 'front',
        traits: mockMeleeTraits(),
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
        cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
        statusEffects: [],
        spriteKey: 'placeholder',
        iconKey: 'placeholder',
        isEnemy: false,
        battleX: 180,
        corpseVisible: true,
      };
    case 'counterDefender':
      return {
        hp: 100,
        maxHp: 100,
        barrierHp: 0,
        atk: 20,
        def: 10,
        res: 0,
        isAlive: true,
        role: 'defender',
        classId: 'test',
        formationRow: 'front',
        traits: mockMeleeTraits(),
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
        corpseVisible: true,
      };
    case 'supporter':
      return {
        hp: 50,
        maxHp: 100,
        barrierHp: 0,
        atk: 20,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'supporter',
        classId: 'test',
        formationRow: 'back',
        traits: mockRangedTraits(50),
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
        corpseVisible: true,
      };
    case 'stageTracker':
      return {
        hp: 50,
        maxHp: 100,
        barrierHp: 0,
        atk: 20,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'attacker',
        classId: 'swordsman',
        formationRow: 'front',
        traits: mockMeleeTraits(),
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
        cooldowns: [],
        statusEffects: [],
        spriteKey: 'swordsman',
        iconKey: 'swordsman',
        isEnemy: false,
        battleX: 0,
        corpseVisible: true,
      };
    case 'neutral':
    default:
      return {
        hp: 100,
        maxHp: 100,
        barrierHp: 0,
        atk: 10,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'attacker',
        classId: 'test',
        formationRow: 'back',
        traits: mockRangedTraits(100),
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
        corpseVisible: true,
      };
  }
}

export function mockCombatant(
  overrides: Partial<CombatantState> & { id?: string } = {},
  preset: MockCombatantPreset = 'neutral',
): CombatantState {
  const id = overrides.id ?? 'unit';
  const base = presetBase(preset);
  const battleX = overrides.battleX ?? base.battleX;
  return {
    ...base,
    ...overrides,
    id,
    name: overrides.name ?? id,
    battleX,
    isAlive: overrides.isAlive ?? (overrides.hp !== undefined ? overrides.hp > 0 : base.isAlive),
  };
}

export type MockUnitOpts = {
  hp?: number;
  maxHp?: number;
  isEnemy?: boolean;
  atk?: number;
  def?: number;
  res?: number;
  rangePx?: number;
  formationRow?: CombatantState['formationRow'];
};

export const TARGETING_BASIC_SKILL_ID = 'test_basic_attack';

/** Targeting tests: unit positioned on the battle line. */
export function mockUnit(
  id: string,
  battleX: number,
  opts: MockUnitOpts = {},
): CombatantState {
  const maxHp = opts.maxHp ?? 100;
  const hp = opts.hp ?? maxHp;
  return mockCombatant({
    id,
    battleX,
    hp,
    maxHp,
    atk: opts.atk ?? 10,
    def: opts.def ?? 5,
    res: opts.res ?? 0,
    isEnemy: opts.isEnemy ?? false,
    formationRow: opts.formationRow ?? 'back',
    classId: opts.isEnemy ? 'test_enemy' : 'at_sorcerer',
    traits: mockRangedTraits(opts.rangePx ?? 100),
    cooldowns: [
      { skillId: TARGETING_BASIC_SKILL_ID, remaining: 0, slotKind: 'basic' },
    ],
    isAlive: hp > 0,
  });
}

export function mockTargetingGameData(basicRange = 50): GameData {
  return {
    classOrder: [],
    classRegistry: {},
    skillRegistry: {
      passives: {},
      actives: {
        [TARGETING_BASIC_SKILL_ID]: {
          id: TARGETING_BASIC_SKILL_ID,
          name: 'basic',
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
              range: basicRange,
            },
          ],
        },
      },
    },
    enemyRegistry: {},
    stages: [],
    parties: {},
  };
}

/** resolveApproachBattleX tests: ranged back-row default with archer passive. */
export function mockApproachCombatant(
  overrides: Partial<CombatantState> & { id?: string } = {},
): CombatantState {
  return mockCombatant(overrides, 'rangedArcher');
}

export function mockApproachGameData(): GameData {
  return {
    skillRegistry: {
      passives: {
        archer_passive: {
          id: 'archer_passive',
          name: '射手排除',
          effect: 'targetRuleOverride',
          targetRuleOverride: { kind: 'attackType', ranged: true },
        },
      },
      actives: {
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
        bow_basic: {
          id: 'bow_basic',
          name: '射撃',
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
              range: 100,
            },
          ],
        },
      },
    },
  } as unknown as GameData;
}
