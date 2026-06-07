import type { BattleEventListener } from '../events.ts';
import {
  getPassiveDefs,
  resolveDamage,
  resolveHeal,
} from '../combatMath.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  SkillCooldown,
  SkillEffectDef,
  StatusEffect,
} from '../types.ts';
import { asStatusEffectStatList } from '../types.ts';
import { pickTarget, resolveTargetRule } from './targeting.ts';

export class SkillExecutor {
  constructor(
    private readonly gameData: GameData,
    private readonly emit: BattleEventListener,
  ) {}

  tryExecute(
    actor: CombatantState,
    cd: SkillCooldown,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): void {
    if (!actor.isAlive || cd.remaining > 0) return;

    const skill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!skill || skill.effect.length === 0) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );

    let appliedAny = false;
    for (const effectDef of skill.effect) {
      const targetRule = resolveTargetRule(passives, effectDef.targetRule);
      const target = pickTarget(targetRule, actor, allies, enemies);
      if (!target) continue;

      if (this.applyEffect(actor, target, skill, effectDef, cd)) {
        appliedAny = true;
      }
    }

    if (appliedAny) {
      cd.remaining = skill.interval;
    }
  }

  private applyEffect(
    actor: CombatantState,
    target: CombatantState,
    skill: ActiveSkillDef,
    effectDef: SkillEffectDef,
    cd: SkillCooldown,
  ): boolean {
    if (effectDef.type === 'damage') {
      const amount = resolveDamage(
        actor,
        target,
        effectDef,
        this.gameData.skillRegistry.passives,
      );
      target.hp = Math.max(0, target.hp - amount);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'damage',
        amount,
        range: effectDef.range,
      });
      this.emit({ type: 'hurt', targetId: target.id });
      if (target.hp <= 0) {
        target.isAlive = false;
        this.emit({ type: 'death', targetId: target.id });
      }
      return true;
    }

    if (effectDef.type === 'heal') {
      const amount = resolveHeal(
        actor,
        effectDef,
        this.gameData.skillRegistry.passives,
      );
      target.hp = Math.min(target.maxHp, target.hp + amount);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'heal',
        amount,
        range: effectDef.range,
      });
      return true;
    }

    if (effectDef.type === 'buff' || effectDef.type === 'debuff') {
      const isBuff = effectDef.type === 'buff';
      const stats = asStatusEffectStatList(
        isBuff ? effectDef.buffStat : effectDef.debuffStat,
      );
      const multiplier = isBuff
        ? effectDef.buffMultiplier
        : effectDef.debuffMultiplier;
      const flatBonus = isBuff
        ? effectDef.buffFlatBonus
        : effectDef.debuffFlatBonus;
      const duration = isBuff
        ? effectDef.buffDurationSec
        : effectDef.debuffDurationSec;
      if (
        stats.length === 0 ||
        (multiplier === undefined && flatBonus === undefined)
      ) {
        return false;
      }

      const statusLabels: string[] = [];
      const appliedAt = Date.now();

      for (let i = 0; i < stats.length; i++) {
        const stat = stats[i]!;
        const effect: StatusEffect = {
          id: `${skill.id}_${stat}_${appliedAt}_${i}`,
          kind: isBuff ? 'buff' : 'debuff',
          stat,
          multiplier: multiplier ?? 1,
          durationSec: duration,
          remainingSec: duration,
          ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
        };
        target.statusEffects.push(effect);
        statusLabels.push(formatStatusLabel(stat, multiplier, flatBonus));
      }

      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: effectDef.type,
        statusLabel: statusLabels.join(', '),
        range: effectDef.range,
      });
      return true;
    }

    if (effectDef.type === 'hot' || effectDef.type === 'dot') {
      const overlay = effectDef.type;
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_${overlay}_${appliedAt}`,
        kind: overlay === 'hot' ? 'buff' : 'debuff',
        overlay,
        multiplier: 1,
        durationSec: effectDef.durationSec,
        remainingSec: effectDef.durationSec,
        powerMultiplier: effectDef.powerMultiplier,
        sourceId: actor.id,
        skillId: skill.id,
        ...(overlay === 'dot'
          ? { damageType: effectDef.damageType ?? 'physical' }
          : {}),
        tickSec: 1,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: effectDef.type,
        statusLabel: overlay,
        range: effectDef.range,
      });
      return true;
    }

    return false;
  }
}

function formatStatusLabel(
  stat: NonNullable<StatusEffect['stat']>,
  multiplier: number | undefined,
  flatBonus: number | undefined,
): string {
  const parts: string[] = [stat];
  if (multiplier !== undefined && multiplier !== 1) {
    parts.push(`x${multiplier}`);
  }
  if (flatBonus !== undefined) {
    parts.push(`+${Math.abs(flatBonus)}`);
  }
  return parts.join(' ');
}
