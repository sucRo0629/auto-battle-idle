# Combat

## Damage (physical)

1. baseDamage = floor(effectiveAtk * skill.powerMultiplier * passiveDamageMul)
2. afterSubtract = baseDamage - effectiveDef
3. if afterSubtract <= 0: 0 else floor(afterSubtract * 100 / (100 + effectiveDef))
4. final = max(1, floor(afterDefense * damageTakenMul))

## Damage (magic)

afterDefense = floor(baseDamage * 100 / (100 + effectiveReg))

## Heal

heal = floor((actor.atk + passiveHealBonus) * skill.powerMultiplier)

## Cooldowns

- Basic slot: fixed deltaTime
- Active slot: deltaTime * passive activeCooldownRate product
