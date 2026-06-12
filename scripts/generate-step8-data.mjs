import fs from 'fs';

const meleeHit = (scale = 1, extra = {}) => ({
  targetRule: 'frontEnemy',
  type: 'damage',
  damageType: 'physical',
  amount: { kind: 'atkBased', atkScale: scale },
  ...extra,
});

const rangedHit = (scale = 1, extra = {}) => ({
  targetRule: 'frontEnemy',
  type: 'damage',
  damageType: 'physical',
  amount: { kind: 'atkBased', atkScale: scale },
  range: 50,
  vfx: { preset: 'arrow', arc: true },
  ...extra,
});

const magicHit = (scale = 1, extra = {}) => ({
  targetRule: 'frontEnemy',
  type: 'damage',
  damageType: 'magic',
  amount: { kind: 'atkBased', atkScale: scale },
  range: 50,
  vfx: { preset: 'orb' },
  ...extra,
});

const passives = [
  { id: 'passive_target_highest_atk', name: '脅威の標的', effect: 'targetRuleOverride', targetRuleOverride: 'highestAtkEnemy' },
  { id: 'passive_damage_taken_heal', name: '聖なる吸収', effect: 'buff', buffSubKind: 'damageTakenToHeal', ratio: 0.12, buffTargetRule: { kind: 'self' } },
  { id: 'passive_self_low_hp_dmg', name: '背水の刃', effect: 'selfHpRatioBuff', buffStat: 'atk', buffMultiplierMax: 2, maxBuffAtHpRatio: 0 },
  { id: 'passive_target_lowest_hp', name: '仕留めの眼', effect: 'targetRuleOverride', targetRuleOverride: 'lowestHpEnemy' },
  { id: 'passive_evasion', name: '影歩', effect: 'evasionChance', evasionChance: 0.18 },
  { id: 'passive_target_highest_hp', name: '巨体穿ち', effect: 'targetRuleOverride', targetRuleOverride: 'highestHpEnemy' },
  { id: 'passive_target_ranged_attacking', name: '射手排除', effect: 'targetRuleOverride', targetRuleOverride: 'rangedAttackingEnemy' },
  { id: 'passive_target_farthest', name: '遠点狙い', effect: 'targetRuleOverride', targetRuleOverride: 'farthestEnemy' },
  { id: 'passive_damage_vs_dot', name: '追い狩り', effect: 'damageIncrease', damageIncrease: { scale: 1.3, conditions: [{ kind: 'debuff', tags: ['dot'], selfAppliedOnly: true }] } },
  { id: 'passive_target_lowest_reg', name: '魔角狙い', effect: 'targetRuleOverride', targetRuleOverride: 'lowestRegEnemy' },
  { id: 'passive_target_lowest_def', name: '脆き穿ち', effect: 'targetRuleOverride', targetRuleOverride: 'lowestDefEnemy' },
  { id: 'passive_aoe_crowd_bonus', name: '密集爆破', effect: 'aoeCrowdBonus', perExtraTargetScale: 0.1, maxExtraTargets: 4 },
  { id: 'passive_heal_barrier', name: '結界付与', effect: 'excessHealToBarrier', barrierScale: 0.5 },
  { id: 'passive_alchemist_hot', name: '薬草の香り', effect: 'hot', hotTargetRule: 'mostDamagedAlly', hotAmount: { kind: 'flat', flatAmount: 1 } },
];

const actives = [];

function addBasic(id, name, effect, interval = 2) {
  actives.push({ id, name, interval, effect: Array.isArray(effect) ? effect : [effect] });
}

function addActive(id, name, trigger, effect, vfx) {
  actives.push({
    id,
    name,
    trigger,
    effect: Array.isArray(effect) ? effect : [effect],
    ...(vfx ? { vfx } : {}),
  });
}

const classes = [
  { id: 'df_guardian', displayName: '鉄衛士', epithetEn: 'Guardian', role: 'defender', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'somewhatSlow', maxHp: 235, atk: 11, def: 26, reg: 0, growthTier: { maxHp: 3, atk: 1, def: 3 }, passiveIds: ['passive_target_highest_atk'] },
  { id: 'df_paladin', displayName: '護法士', epithetEn: 'Paladin', role: 'defender', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'normal', maxHp: 200, atk: 13, def: 20, reg: 15, growthTier: { maxHp: 2, atk: 1, def: 2 }, passiveIds: ['passive_damage_taken_heal'] },
  { id: 'df_duelist', displayName: '闘技士', epithetEn: 'Gladiator', role: 'defender', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'fast', maxHp: 190, atk: 26, def: 12, reg: 0, growthTier: { maxHp: 2, atk: 3, def: 1 }, passiveIds: ['passive_self_low_hp_dmg'] },
  { id: 'at_warrior', displayName: '剣術士', epithetEn: 'Swordsman', role: 'attacker', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'normal', maxHp: 165, atk: 30, def: 14, reg: 0, growthTier: { maxHp: 2, atk: 3, def: 2 }, passiveIds: [] },
  { id: 'at_assassin', displayName: '双刃士', epithetEn: 'Assassin', role: 'attacker', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'fast', maxHp: 100, atk: 32, def: 8, reg: 0, growthTier: { maxHp: 1, atk: 3, def: 1 }, passiveIds: ['passive_target_lowest_hp', 'passive_evasion'] },
  { id: 'at_lancer', displayName: '槍術士', epithetEn: 'Lancer', role: 'attacker', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'somewhatSlow', maxHp: 150, atk: 24, def: 14, reg: 0, growthTier: { maxHp: 2, atk: 2, def: 2 }, passiveIds: ['passive_target_highest_hp'] },
  { id: 'at_ranger', displayName: '弓術士', epithetEn: 'Ranger', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'fast', maxHp: 92, atk: 20, def: 6, reg: 0, growthTier: { maxHp: 1, atk: 2, def: 1 }, passiveIds: ['passive_target_ranged_attacking'] },
  { id: 'at_sniper', displayName: '狙撃士', epithetEn: 'Sniper', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'slow', maxHp: 88, atk: 28, def: 5, reg: 0, growthTier: { maxHp: 1, atk: 3, def: 1 }, passiveIds: ['passive_target_farthest'] },
  { id: 'at_hunter', displayName: '狩猟士', epithetEn: 'Hunter', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'normal', maxHp: 96, atk: 18, def: 8, reg: 0, growthTier: { maxHp: 2, atk: 2, def: 1 }, passiveIds: ['passive_damage_vs_dot'] },
  { id: 'at_sorcerer', displayName: '魔術士', epithetEn: 'Sorcerer', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'somewhatSlow', maxHp: 80, atk: 26, def: 5, reg: 20, growthPresetKey: 'caster', growthTier: { maxHp: 2, atk: 3, def: 1 }, passiveIds: ['passive_target_lowest_reg'] },
  { id: 'at_enchanter', displayName: '符術士', epithetEn: 'Enchanter', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'normal', maxHp: 78, atk: 22, def: 6, reg: 15, growthPresetKey: 'caster', growthTier: { maxHp: 2, atk: 2, def: 1 }, passiveIds: ['passive_target_lowest_def'] },
  { id: 'at_geomancer', displayName: '法陣師', epithetEn: 'Geomancer', role: 'attacker', formationRow: 'back', attackRange: 'ranged', attackSpeedTier: 'somewhatSlow', maxHp: 72, atk: 24, def: 4, reg: 10, growthPresetKey: 'caster', growthTier: { maxHp: 1, atk: 3, def: 1 }, passiveIds: ['passive_aoe_crowd_bonus'] },
  { id: 'sp_cleric', displayName: '療養師', epithetEn: 'Cleric', role: 'supporter', formationRow: 'front', attackRange: 'melee', attackSpeedTier: 'slow', maxHp: 105, atk: 12, def: 11, reg: 10, growthTier: { maxHp: 2, atk: 1, def: 2 }, passiveIds: [] },
  { id: 'sp_abjurer', displayName: '結界師', epithetEn: 'Abjurer', role: 'supporter', formationRow: 'middle', attackRange: 'melee', attackSpeedTier: 'normal', maxHp: 95, atk: 10, def: 12, reg: 10, growthTier: { maxHp: 2, atk: 1, def: 2 }, passiveIds: ['passive_heal_barrier'] },
  { id: 'sp_alchemist', displayName: '薬草師', epithetEn: 'Herbalist', role: 'supporter', formationRow: 'middle', attackRange: 'melee', attackSpeedTier: 'normal', maxHp: 98, atk: 14, def: 9, reg: 10, growthTier: { maxHp: 2, atk: 2, def: 1 }, passiveIds: ['passive_alchemist_hot'] },
];

const magicClassIds = new Set(['at_sorcerer', 'at_enchanter', 'at_geomancer']);

for (const cls of classes) {
  const prefix = cls.id;
  if (cls.attackRange === 'ranged') {
    const effect = magicClassIds.has(cls.id) ? magicHit(0.85) : rangedHit(1);
    addBasic(`${prefix}_basic_attack`, magicClassIds.has(cls.id) ? '魔弾' : '射撃', effect);
  } else {
    addBasic(`${prefix}_basic_attack`, '打撃', meleeHit(1), cls.role === 'supporter' ? 2.2 : 2);
  }
}

addActive('df_guardian_active_1', 'シールドバッシュ', { kind: 'time', value: 9 }, [
  meleeHit(1.1, { targetShape: 'single' }),
  { targetRule: 'frontEnemy', type: 'stun', durationSec: 1, targetShape: 'single' },
]);
addActive('df_guardian_active_2', '威圧', { kind: 'time', value: 12 }, [
  { targetRule: 'frontEnemy', type: 'debuff', debuffStat: 'atk', debuffMultiplier: 0.75, debuffDurationSec: 5, targetShape: 'single' },
]);

addActive('df_paladin_active_1', '手当', { kind: 'time', value: 8 }, [
  { targetRule: 'mostDamagedAlly', type: 'heal', amount: { kind: 'atkBased', atkScale: 1.1 }, vfx: { preset: 'healRise' } },
]);
addActive('df_paladin_active_2', '聖盾', { kind: 'time', value: 11 }, [
  { targetRule: 'self', type: 'buff', buffStat: 'def', buffMultiplier: 1.25, buffDurationSec: 6 },
]);

addActive('df_duelist_active_1', '砂かけ', { kind: 'time', value: 8 }, [
  { targetRule: 'frontEnemy', type: 'debuff', debuffStat: 'atk', debuffMultiplier: 0.8, debuffDurationSec: 5, targetShape: 'single' },
  { targetRule: 'frontEnemy', type: 'stun', durationSec: 1.2, targetShape: 'single' },
]);
addActive('df_duelist_active_2', '隙撃ち', { kind: 'time', value: 10 }, [
  meleeHit(1.8, { targetShape: 'single' }),
]);

addActive('at_warrior_active_1', '剣閃', { kind: 'basicAttackCount', value: 4 }, [
  meleeHit(2.1, { targetShape: 'single' }),
]);
addActive('at_warrior_active_2', '薙ぎ払い', { kind: 'time', value: 11 }, [
  { targetRule: 'frontEnemy', targetShape: 'aoe', aoeRadiusPx: 50, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 0.9 } },
]);

addActive('at_assassin_active_1', '背刺', { kind: 'time', value: 9 }, [
  { type: 'move', targetRule: 'frontEnemy', moveMode: 'toAnchor', anchorOffsetPx: 32, moveDurationSec: 0.3, anim: 'dash' },
  { targetRule: 'frontEnemy', targetShape: 'multiLock', hitCount: 3, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 0.7 } },
]);
addActive('at_assassin_active_2', '仕留め', { kind: 'time', value: 10 }, [
  meleeHit(2.2, { targetShape: 'single' }),
]);

addActive('at_lancer_active_1', '貫突', { kind: 'time', value: 9 }, [
  { targetRule: 'frontEnemy', targetShape: 'pierce', type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1.1 }, pierceDurationSec: 0.2 },
]);
addActive('at_lancer_active_2', '突き刺し', { kind: 'time', value: 11 }, [
  meleeHit(1.6, { targetShape: 'single' }),
]);

addActive('at_ranger_active_1', '速射', { kind: 'basicAttackCount', value: 4 }, [
  { targetRule: 'frontEnemy', targetShape: 'multiLock', hitCount: 2, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 0.65, atkOffset: 5 }, range: 50, vfx: { preset: 'arrow' } },
]);
addActive('at_ranger_active_2', '貫矢', { kind: 'time', value: 10 }, [
  rangedHit(1.3, { targetShape: 'single' }),
]);

addActive('at_sniper_active_1', '精密射', { kind: 'time', value: 10 }, [
  rangedHit(2, { targetShape: 'single' }),
]);
addActive('at_sniper_active_2', '貫通矢', { kind: 'time', value: 12 }, [
  { targetRule: 'frontEnemy', targetShape: 'pierce', type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1.2 }, range: 50, pierceDurationSec: 0.15, vfx: { preset: 'impale' } },
]);

const scatterBase = (extra = {}) => ({
  targetRule: 'frontEnemy',
  targetShape: 'scatter',
  scatterRadiusPx: 70,
  scatterSpreadRadiusPx: 90,
  scatterHitCount: 3,
  scatterDurationSec: 0.6,
  scatterSpreadRate: 0.4,
  range: 50,
  ...extra,
});

addActive('at_hunter_active_1', '毒罠', { kind: 'time', value: 9 }, [
  { ...scatterBase(), type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 0.35 } },
  { ...scatterBase(), type: 'dot', durationSec: 6, powerMultiplier: 0.18, damageType: 'physical' },
]);
addActive('at_hunter_active_2', '拘束罠', { kind: 'time', value: 11 }, [
  { ...scatterBase(), type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 0.25 } },
  { ...scatterBase(), type: 'stun', durationSec: 1 },
  { ...scatterBase(), type: 'debuff', debuffStat: 'atk', debuffMultiplier: 0.85, debuffDurationSec: 4 },
]);

addActive('at_sorcerer_active_1', '魔弾', { kind: 'time', value: 8 }, [
  magicHit(1.4, { targetShape: 'single' }),
]);
addActive('at_sorcerer_active_2', '集中砲', { kind: 'time', value: 11 }, [
  magicHit(1.1, { targetShape: 'multiLock', hitCount: 2 }),
]);

addActive('at_enchanter_active_1', '連符', { kind: 'time', value: 9 }, [
  { targetRule: 'frontEnemy', targetShape: 'chain', chainCount: 3, chainMaxDistancePx: 80, type: 'damage', damageType: 'magic', amount: { kind: 'atkBased', atkScale: 0.75 }, range: 50, vfx: { preset: 'chainLightning' } },
]);
addActive('at_enchanter_active_2', '爆符', { kind: 'time', value: 11 }, [
  magicHit(1.2, { targetShape: 'aoe', aoeRadiusPx: 55 }),
]);

addActive('at_geomancer_active_1', '大法陣', { kind: 'time', value: 10 }, [
  magicHit(1.1, { targetShape: 'aoe', aoeRadiusPx: 90 }),
]);
addActive('at_geomancer_active_2', '小法陣', { kind: 'time', value: 8 }, [
  magicHit(0.7, { targetShape: 'scatter', scatterRadiusPx: 60, scatterHitCount: 2, scatterDurationSec: 0.4, scatterSpreadRate: 0.3 }),
]);

addActive('sp_cleric_active_1', '癒しの手', { kind: 'time', value: 8 }, [
  { targetRule: 'mostDamagedAlly', type: 'heal', amount: { kind: 'atkBased', atkScale: 1.2 }, vfx: { preset: 'healRise' } },
]);
addActive('sp_cleric_active_2', '鼓舞', { kind: 'time', value: 10 }, [
  { targetRule: 'mostDamagedAlly', type: 'buff', buffStat: 'atk', buffMultiplier: 1.2, buffDurationSec: 6 },
]);

addActive('sp_abjurer_active_1', '結界', { kind: 'time', value: 9 }, [
  { targetRule: 'mostDamagedAlly', type: 'barrier', amount: { kind: 'atkBased', atkScale: 1.5 } },
]);

addActive('sp_alchemist_active_1', '攻性薬', { kind: 'time', value: 9 }, [
  { targetRule: 'mostDamagedAlly', type: 'buff', buffStat: 'atk', buffMultiplier: 1.15, buffDurationSec: 8 },
]);

const legacy = JSON.parse(fs.readFileSync('data/skills.json', 'utf8')).actives.filter(
  (s) => s.id.startsWith('test_') || s.id.startsWith('stage1_'),
);
for (const s of legacy) actives.push(s);

const classesJson = classes.map((cls) => ({
  id: cls.id,
  role: cls.role,
  displayName: cls.displayName,
  epithetEn: cls.epithetEn,
  formationRow: cls.formationRow,
  traits: { attackRange: cls.attackRange },
  maxHp: cls.maxHp,
  atk: cls.atk,
  def: cls.def,
  reg: cls.reg,
  jobTier: 1,
  attackSpeedTier: cls.attackSpeedTier,
  basicAttackSkillId: `${cls.id}_basic_attack`,
  passiveIds: cls.passiveIds,
  skills: [{ level: 0, skillIds: [`${cls.id}_active_1`, `${cls.id}_active_2`] }],
  growthTier: cls.growthTier,
  ...(cls.growthPresetKey ? { growthPresetKey: cls.growthPresetKey } : {}),
}));

fs.writeFileSync('data/skills.json', `${JSON.stringify({ passives, actives }, null, 2)}\n`);
fs.writeFileSync('data/classes.json', `${JSON.stringify(classesJson, null, 2)}\n`);
console.log('passives', passives.length, 'actives', actives.length, 'classes', classesJson.length);
