export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death';

export interface CombatantLayout {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  hp: number;
  maxHp: number;
  isEnemy: boolean;
  isAlive: boolean;
  anim: AnimState;
  animFrame: number;
}

export interface IBattleRenderer {
  mount(container: HTMLElement): void;
  setCombatants(layout: CombatantLayout[]): void;
  setWorldOffset(offsetX: number): void;
  playAnim(combatantId: string, state: AnimState): void;
  tick(deltaMs: number): void;
  destroy(): void;
}
