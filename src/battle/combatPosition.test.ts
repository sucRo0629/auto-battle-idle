import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import {
  BATTLE_ENEMY_VISIBLE_MAX_X,
  SPRITE_GAP,
  enemyRangedRearGap,
  resolvePartyDeployTravelPx,
} from './battleConstants.ts';
import {
  assignInitialPlayerBattleX,
  getPlayerContactX,
  getEnemyContactX,
  getMeleeEnemyContactX,
  isEnemyVisibleOnScreen,
  resolveAttackBattleX,
  resolveApproachAttackBattleX,
  resolveApproachRangePx,
  resolveMinEquippedActiveRangePx,
  resolveMinReadyEquippedActiveRangePx,
  resolveBasicAttackRangePx,
  resolveMoveBattleX,
  resolveMaxEffectiveRangePx,
  resolveRangedRearBattleXCap,
  separateByGap,
  enemyDeployOffScreenBattleX,
  resolveEnemyDeployTargets,
  freezeEnemyCorpseScreenAnchor,
  syncDeadEnemyCorpseBattleX,
  updateUnitApproach,
} from './combatPosition.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import {
  mockCombatant as mockCombatantBase,
  mockMeleeTraits,
  mockRangedTraits,
} from './testFixtures.ts';

function mockCombatant(overrides: Partial<CombatantState> & { id: string }): CombatantState {
  return mockCombatantBase(overrides, 'meleeFront');
}

const gameData = {
  skillRegistry: {
    passives: {},
    actives: {
      basic: {
        id: 'basic',
        name: 'basic',
        trigger: { kind: 'time', value: 2 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 } }],
      },
      spear: {
        id: 'spear',
        name: 'spear',
        trigger: { kind: 'time', value: 2 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 30 }],
      },
      bow: {
        id: 'bow',
        name: 'bow',
        trigger: { kind: 'time', value: 2 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 100 }],
      },
      short_magic: {
        id: 'short_magic',
        name: 'short magic',
        trigger: { kind: 'time', value: 8 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'magic', amount: { kind: 'atkBased', atkScale: 1.4 }, range: 50 }],
      },
      sorcerer_basic: {
        id: 'sorcerer_basic',
        name: '魔弾',
        trigger: { kind: 'time', value: 2 },
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', amount: { kind: 'atkBased', atkScale: 0.85 } }],
      },
    },
  },
} as unknown as GameData;

describe('combatPosition', () => {
  it('enemyDeployOffScreenBattleX shifts right by speed-scaled deploy travel', () => {
    expect(enemyDeployOffScreenBattleX(360)).toBe(
      360 + resolvePartyDeployTravelPx(),
    );
  });

  it('resolveEnemyDeployTargets applies spawn offset and gap', () => {
    const positions = resolveEnemyDeployTargets([
      { id: 'a', spawnX: 120, isAlive: true },
      { id: 'b', spawnX: 160, isAlive: true },
    ]);
    expect(positions.get('a')).toBe(360);
    expect(positions.get('b')).toBe(400);
  });

  it('separateByGap spreads enemy spawns right to stay off-screen', () => {
    const separated = separateByGap(
      [
        { id: 'front', battleX: 580, isAlive: true },
        { id: 'mid', battleX: 600, isAlive: true },
        { id: 'ranged', battleX: 640, isAlive: true },
      ],
      SPRITE_GAP,
    );
    for (const id of ['front', 'mid', 'ranged']) {
      expect(separated.get(id)!).toBeGreaterThan(BATTLE_ENEMY_VISIBLE_MAX_X);
    }
    expect(separated.get('front')!).toBe(580);
  });

  it('detects enemy on screen', () => {
    const off = mockCombatant({ id: 'e1', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MAX_X + 1 });
    const on = mockCombatant({ id: 'e2', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MAX_X });
    expect(isEnemyVisibleOnScreen(off)).toBe(false);
    expect(isEnemyVisibleOnScreen(on)).toBe(true);
  });

  it('ranged approach stays behind melee front line', () => {
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: mockMeleeTraits(),
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: mockRangedTraits(),
      battleX: 240,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const rearCap = resolveRangedRearBattleXCap([melee, ranged], gameData);
    expect(rearCap).toBe(250 + enemyRangedRearGap());
  });

  it('ranged enemies approach attack range in either direction', () => {
    const enemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
      battleX: 300,
    });
    updateUnitApproach(enemy, 260, 10);
    expect(enemy.battleX).toBe(290);
    updateUnitApproach(enemy, 260, 100);
    expect(enemy.battleX).toBe(260);
    updateUnitApproach(enemy, 270, 5);
    expect(enemy.battleX).toBe(265);
  });

  it('resolves melee range 0 and spear range 30', () => {
    const sword = mockCombatant({ id: 'sword', cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }] });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveMaxEffectiveRangePx(sword, gameData)).toBe(0);
    expect(resolveMaxEffectiveRangePx(spear, gameData)).toBe(30);
  });

  it('resolves attack battleX from contact', () => {
    const contactX = 250;
    const sword = mockCombatant({ id: 'sword', cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }] });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    const bow = mockCombatant({
      id: 'bow',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      formationRow: 'back',
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveAttackBattleX(sword, contactX, gameData)).toBe(contactX);
    expect(resolveAttackBattleX(spear, contactX, gameData)).toBe(contactX - 30);
    expect(resolveAttackBattleX(bow, contactX, gameData)).toBe(150);
  });

  it('approach range follows skill effect range', () => {
    const bow = mockCombatant({
      id: 'bow',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveMaxEffectiveRangePx(bow, gameData)).toBe(100);
  });

  it('moves units toward standoff attack position in either direction', () => {
    const player = mockCombatant({
      id: 'player',
      battleX: 100,
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });
    updateUnitApproach(player, 200, 1000);
    expect(player.battleX).toBe(200);
    updateUnitApproach(player, 190, 5);
    expect(player.battleX).toBe(195);
    updateUnitApproach(player, 210, 5);
    expect(player.battleX).toBe(200);

    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 300,
      cooldowns: [],
    });
    updateUnitApproach(enemy, 200, 10);
    expect(enemy.battleX).toBe(290);
    updateUnitApproach(enemy, 200, 120);
    expect(enemy.battleX).toBe(200);
    updateUnitApproach(enemy, 210, 5);
    expect(enemy.battleX).toBe(205);
  });

  it('assigns initial player battleX by formation row', () => {
    const front = mockCombatant({ id: 'f', formationRow: 'front', role: 'defender' });
    const back = mockCombatant({
      id: 'b',
      formationRow: 'back',
      role: 'attacker',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    assignInitialPlayerBattleX([front, back]);
    expect(front.battleX).toBeGreaterThan(back.battleX);
  });

  it('assigns back-row battleX with shorter range further forward', () => {
    const cleric = mockCombatant({
      id: 'cleric',
      formationRow: 'back',
      role: 'supporter',
      traits: { rangePx: 40, damageType: 'magic', basicAttackVfx: { enabled: true } },
    });
    const ranger = mockCombatant({
      id: 'ranger',
      formationRow: 'back',
      role: 'attacker',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    assignInitialPlayerBattleX([cleric, ranger]);
    expect(cleric.battleX).toBeGreaterThan(ranger.battleX);
  });

  it('getEnemyContactX returns closest enemy to player', () => {
    const e1 = mockCombatant({ id: 'e1', isEnemy: true, battleX: 250 });
    const e2 = mockCombatant({ id: 'e2', isEnemy: true, battleX: 220 });
    expect(getEnemyContactX([e1, e2])).toBe(220);
  });

  it('getMeleeEnemyContactX ignores ranged enemies', () => {
    const melee = mockCombatant({
      id: 'm',
      isEnemy: true,
      battleX: 250,
      traits: mockMeleeTraits(),
    });
    const ranged = mockCombatant({
      id: 'r',
      isEnemy: true,
      battleX: 220,
      traits: mockRangedTraits(),
    });
    expect(getMeleeEnemyContactX([melee, ranged], gameData)).toBe(250);
    expect(getMeleeEnemyContactX([ranged], gameData)).toBeNull();
  });

  it('melee player and enemy converge to shared battleX within range 0', () => {
    const player = mockCombatant({
      id: 'paladin',
      formationRow: 'front',
      battleX: 250,
    });
    const enemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });

    for (let i = 0; i < 120; i++) {
      const meleeContact = getMeleeEnemyContactX([enemy], gameData)!;
      updateUnitApproach(
        player,
        resolveAttackBattleX(player, meleeContact, gameData),
        8,
      );
      updateUnitApproach(
        enemy,
        resolveAttackBattleX(enemy, getPlayerContactX([player])!, gameData),
        8,
      );
    }

    expect(enemy.battleX).toBeCloseTo(player.battleX, 0);
    expect(isWithinSkillRange(player, enemy, 0)).toBe(true);
    expect(isWithinSkillRange(enemy, player, 0)).toBe(true);
  });

  it('getPlayerContactX returns rightmost living ally battleX', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 180,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      battleX: 220,
    });
    expect(getPlayerContactX([guard, archer])).toBe(220);
  });

  it('resolveMoveBattleX engage and toAnchor offset', () => {
    const sword = mockCombatant({
      id: 'sword',
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    const enemy = mockCombatant({ id: 'e', isEnemy: true, battleX: 280 });

    expect(
      resolveMoveBattleX(
        sword,
        enemy,
        { type: 'move', target: { kind: "distance", side: "enemy", order: "nearest" }, moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(resolveAttackBattleX(sword, enemy.battleX, gameData));
    expect(
      resolveMoveBattleX(
        spear,
        enemy,
        { type: 'move', target: { kind: "distance", side: "enemy", order: "nearest" }, moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(resolveAttackBattleX(spear, enemy.battleX, gameData));
    expect(
      resolveMoveBattleX(
        sword,
        enemy,
        {
          type: 'move',
          target: { kind: "distance", side: "enemy", order: "nearest" },
          moveDurationSec: 0.2,
          moveMode: 'toAnchor',
          anchorOffsetPx: 20,
        },
        gameData,
      ),
    ).toBe(300);
  });

  it('resolveMoveBattleX caps hostile toAnchor at effect range (lancer lunge)', () => {
    const lancer = mockCombatant({
      id: 'lancer',
      battleX: 54,
      traits: {
        rangePx: 70,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const enemy = mockCombatant({ id: 'e', isEnemy: true, battleX: 338 });
    expect(
      resolveMoveBattleX(
        lancer,
        enemy,
        {
          type: 'move',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          moveDurationSec: 0.25,
          moveMode: 'toAnchor',
          anchorOffsetPx: -32,
        },
        gameData,
      ),
    ).toBe(124);
  });

  it('resolveMoveBattleX does not cap friendly toAnchor return moves', () => {
    const actor = mockCombatant({
      id: 'actor',
      battleX: 70,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const playerAnchor = mockCombatant({ id: 'playerAnchor', battleX: 210 });
    expect(
      resolveMoveBattleX(
        actor,
        playerAnchor,
        {
          type: 'move',
          target: { kind: 'distance', side: 'ally', order: 'nearest' },
          moveDurationSec: 0.1,
          moveMode: 'toAnchor',
        },
        gameData,
      ),
    ).toBe(210);
  });

  it('resolveApproachRangePx uses shorter equipped active range when ready', () => {
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      cooldowns: [
        { skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'short_magic', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    expect(resolveBasicAttackRangePx(mage, gameData)).toBe(200);
    expect(resolveMinEquippedActiveRangePx(mage, gameData)).toBe(50);
    expect(resolveMinReadyEquippedActiveRangePx(mage, gameData)).toBe(50);
    expect(resolveApproachRangePx(mage, gameData)).toBe(50);
  });

  it('resolveApproachRangePx uses basic range while shorter active is on cooldown', () => {
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      cooldowns: [
        { skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'short_magic', remaining: 8, slotKind: 'active', slotIndex: 0 },
      ],
    });
    expect(resolveMinReadyEquippedActiveRangePx(mage, gameData)).toBeNull();
    expect(resolveApproachRangePx(mage, gameData)).toBe(200);
  });

  it('resolveApproachRangePx falls back to basic when no actives', () => {
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveApproachRangePx(mage, gameData)).toBe(200);
    expect(resolveMinEquippedActiveRangePx(mage, gameData)).toBeNull();
  });

  it('resolveApproachAttackBattleX does not retreat when already closer', () => {
    const enemyX = 280;
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      battleX: enemyX - 40,
      cooldowns: [
        { skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'short_magic', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    expect(resolveApproachAttackBattleX(mage, enemyX, gameData)).toBe(enemyX - 40);
  });

  it('resolveApproachAttackBattleX advances to shorter active range when ready', () => {
    const enemyX = 280;
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      battleX: 40,
      cooldowns: [
        { skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'short_magic', remaining: 0, slotKind: 'active', slotIndex: 0 },
      ],
    });
    expect(resolveApproachAttackBattleX(mage, enemyX, gameData)).toBe(enemyX - 50);
  });

  it('resolveApproachAttackBattleX holds at basic range while shorter active is on cooldown', () => {
    const enemyX = 280;
    const mage = mockCombatant({
      id: 'mage',
      traits: { rangePx: 200, damageType: 'magic', basicAttackVfx: { enabled: true } },
      battleX: 40,
      cooldowns: [
        { skillId: 'sorcerer_basic', remaining: 0, slotKind: 'basic' },
        { skillId: 'short_magic', remaining: 8, slotKind: 'active', slotIndex: 0 },
      ],
    });
    expect(resolveApproachAttackBattleX(mage, enemyX, gameData)).toBe(enemyX - 200);
  });

  it('syncDeadEnemyCorpseBattleX keeps corpse battleX at death anchor', () => {
    const enemy = mockCombatant({
      id: 'dead',
      isEnemy: true,
      isAlive: false,
      hp: 0,
      battleX: 200,
      visualX: 200,
    });
    freezeEnemyCorpseScreenAnchor(enemy);
    expect(enemy.corpseScreenAnchorX).toBe(200);

    enemy.battleX = 150;
    syncDeadEnemyCorpseBattleX([enemy]);
    expect(enemy.battleX).toBe(200);
  });
});
