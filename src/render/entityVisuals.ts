import {
  resolvePlaceholderIconKey,
  resolvePlaceholderSpriteKey,
} from '../battle/classVisuals.ts';
import type { ClassPreset, EnemyTemplate } from '../battle/types.ts';
import { hasClassIconAsset } from './classIconAssets.ts';
import { hasEntitySpriteAsset } from './spriteAssets.ts';

/** クラススプライト: `{classId}.png` または `sheets/{classId}/` があれば classId、なければロール別プレースホルダー */
export function resolveClassSpriteKey(
  preset: Pick<ClassPreset, 'id' | 'role' | 'traits'>,
): string {
  if (hasEntitySpriteAsset(preset.id)) return preset.id;
  return resolvePlaceholderSpriteKey(
    preset.role,
    preset.traits.rangePx,
    preset.traits.damageType,
  );
}

/** クラスアイコン: `class-icons/{classId}.png` があれば classId、なければロール別プレースホルダー */
export function resolveClassIconKey(
  preset: Pick<ClassPreset, 'id' | 'role' | 'traits'>,
): string {
  if (hasClassIconAsset(preset.id)) return preset.id;
  return resolvePlaceholderIconKey(
    preset.role,
    preset.traits.rangePx,
    preset.traits.damageType,
  );
}

/** 敵スプライト: `{enemyId}.png` または `sheets/{enemyId}/` があれば enemyId、なければ攻撃者プレースホルダー */
export function resolveEnemySpriteKey(
  template: Pick<EnemyTemplate, 'id' | 'traits'>,
): string {
  if (hasEntitySpriteAsset(template.id)) return template.id;
  return resolvePlaceholderSpriteKey(
    'attacker',
    template.traits.rangePx,
    template.traits.damageType,
  );
}
