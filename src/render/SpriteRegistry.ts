export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death';

export interface SpriteAnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export const SPRITE_COLORS: Record<string, string> = {
  defender_bulwark: '#4a90d9',
  attacker_berserker: '#e67e22',
  supporter_cleric: '#2ecc71',
  attacker_hawkeye: '#e74c3c',
  slime: '#9b59b6',
};

export const ANIM_DEFS: Record<AnimState, SpriteAnimDef> = {
  idle: { frames: 4, fps: 6, loop: true },
  attack: { frames: 4, fps: 12, loop: false },
  heal: { frames: 3, fps: 10, loop: false },
  hurt: { frames: 2, fps: 10, loop: false },
  death: { frames: 3, fps: 8, loop: false },
};

export function getSpriteColor(spriteKey: string): string {
  return SPRITE_COLORS[spriteKey] ?? '#888888';
}
