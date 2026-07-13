import {
  resolvePlaceholderIconKey,
  resolvePlaceholderSpriteKey,
} from '../battle/classVisuals.ts';
import { resolvePresetBasicAttackMethod } from '../battle/data/resolveUnitAttackMethod.ts';
import type { ClassPreset, EnemyTemplate, GameData } from '../battle/types.ts';
import { hasClassIconAsset } from './classIconAssets.ts';
import { hasEntitySpriteAsset } from './spriteAssets.ts';

/** クラススプライト: `{classId}.png` または `sheets/{classId}/` があれば classId、なければロール別プレースホルダー */
export function resolveClassSpriteKey(
  preset: Pick<ClassPreset, 'id' | 'role' | 'traits' | 'basicAttackSkillId'>,
  skillRegistry?: Pick<GameData['skillRegistry'], 'actives'>,
): string {
  if (hasEntitySpriteAsset(preset.id)) return preset.id;
  const attackMethod = skillRegistry
    ? resolvePresetBasicAttackMethod(preset, skillRegistry)
    : undefined;
  return resolvePlaceholderSpriteKey(
    preset.role,
    attackMethod,
    preset.traits.damageType,
  );
}

/** クラスアイコン: `class-icons/{classId}.png` があれば classId、なければロール別プレースホルダー */
export function resolveClassIconKey(
  preset: Pick<ClassPreset, 'id' | 'role' | 'traits' | 'basicAttackSkillId'>,
  skillRegistry?: Pick<GameData['skillRegistry'], 'actives'>,
): string {
  if (hasClassIconAsset(preset.id)) return preset.id;
  const attackMethod = skillRegistry
    ? resolvePresetBasicAttackMethod(preset, skillRegistry)
    : undefined;
  return resolvePlaceholderIconKey(
    preset.role,
    attackMethod,
    preset.traits.damageType,
  );
}

/** 敵スプライト: `{enemyId}.png` または `sheets/{enemyId}/` があれば enemyId、なければ攻撃者プレースホルダー */
export function resolveEnemySpriteKey(
  template: Pick<EnemyTemplate, 'id' | 'traits' | 'basicAttackSkillId'>,
  skillRegistry?: Pick<GameData['skillRegistry'], 'actives'>,
): string {
  if (hasEntitySpriteAsset(template.id)) return template.id;
  const attackMethod = skillRegistry
    ? resolvePresetBasicAttackMethod(template, skillRegistry)
    : undefined;
  return resolvePlaceholderSpriteKey(
    'attacker',
    attackMethod,
    template.traits.damageType,
  );
}
