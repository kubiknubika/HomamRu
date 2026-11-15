/**
 * Удар, выстрел и ответный удар. Спецификации: docs/mechanics/12-battle-actions.md, 13-battle-damage.md.
 */
import { burn, takeRetaliation, wake } from "./control.ts";
import {
  applyDamage,
  attackOf,
  computeDamage,
  defenseOf,
  GOOD_DICE,
  halvingsOf,
  rollBaseDamage,
} from "./damage.ts";
import { rollChance } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { blindRetaliation, fixedDamage, luckOf, strikePercent } from "./effects.ts";
import { isMachine } from "./siege.ts";
import type { StrikeKind } from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

/**
 * Один удар: жребий удачи, броски урона, потери цели. Возвращает нанесённый урон.
 * `share` — доля урона в процентах: ответ ослеплённого отряда слабее.
 */
export function strike(
  draft: BattleDraft,
  attacker: DraftStack,
  target: DraftStack,
  kind: StrikeKind,
  share = 100,
): number {
  const luck = luckOf(draft, attacker);
  const lucky = luck > 0 && rollChance(draft, luck, GOOD_DICE);
  const base = rollBaseDamage(draft.rng, attacker.creature, attacker.count, fixedDamage(attacker));
  draft.rng = base.rng;

  const damage = computeDamage(
    base.value,
    attackOf(draft, attacker, kind),
    defenseOf(draft, target),
    lucky,
    halvingsOf(draft, kind, attacker, target),
    (strikePercent(attacker, target, kind) * share) / 100,
  );

  const losses = applyDamage(target.count, target.firstHealth, target.creature.health, damage);
  target.count = losses.count;
  target.firstHealth = losses.firstHealth;
  draft.events.push({
    type: "strike",
    kind,
    attackerId: attacker.id,
    targetId: target.id,
    damage,
    killed: losses.killed,
    left: losses.count,
    lucky,
  });
  // Любой урон снимает слепоту (69-spells-control.md).
  wake(draft, target);
  if (losses.count === 0) {
    target.turn = "done";
    draft.events.push({ type: "stackDied", stackId: target.id });
  }
  return damage;
}

/**
 * Удар ближнего боя с ответом: удар, «Огненный щит» цели, ответный удар, «Огненный щит» ударившего.
 * Отвечают только выжившие; катапульта не отвечает; ослеплённый отвечает слабее или не отвечает.
 */
export function exchange(draft: BattleDraft, stack: DraftStack, victim: DraftStack): void {
  const dazed = blindRetaliation(victim);
  burn(draft, victim, stack, strike(draft, stack, victim, "melee"));
  if (victim.count === 0 || stack.count === 0 || isMachine(victim) || dazed === 0) {
    return;
  }
  if (takeRetaliation(victim)) {
    burn(draft, stack, victim, strike(draft, victim, stack, "retaliation", dazed ?? 100));
  }
}
