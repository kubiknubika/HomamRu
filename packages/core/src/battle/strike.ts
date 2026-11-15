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
import { sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { walkRoute } from "./queries.ts";
import { isMachine, isMoat, MOAT_DAMAGE } from "./siege.ts";
import { springTrap } from "./traps.ts";
import type { StrikeKind } from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

/**
 * Ведёт отряд в клетку `to` по пути из `walkRoute`: в каждой клетке пути срабатывают ловушки
 * (70-spells-field.md); вставший в ров получает урон. Ответ — дошёл ли отряд живым и не увяз ли:
 * увязший в песках или погибший по дороге не бьёт.
 */
export function moveTo(draft: BattleDraft, stack: DraftStack, to: Cell): boolean {
  if (sameCell(stack, to)) {
    return true;
  }
  const from = { col: stack.col, row: stack.row };
  // Событие о переходе встаёт перед событиями ловушек: сначала отряд идёт, потом видно, что случилось.
  const mark = draft.events.length;
  let stuck = false;
  for (const cell of walkRoute(draft, stack, to)) {
    stack.col = cell.col;
    stack.row = cell.row;
    stuck = springTrap(draft, stack);
    if (stuck || stack.count === 0) {
      break;
    }
  }
  draft.events.splice(mark, 0, {
    type: "stackMoved",
    stackId: stack.id,
    from,
    to: { col: stack.col, row: stack.row },
  });
  if (stack.count > 0) {
    enterMoat(draft, stack);
  }
  return !stuck && stack.count > 0 && sameCell(stack, to);
}

/** Отряд встал в клетку: во рву он получает урон. */
export function enterMoat(draft: BattleDraft, stack: DraftStack): void {
  if (isMoat(draft.siege, stack)) {
    const losses = applyDamage(stack.count, stack.firstHealth, stack.creature.health, MOAT_DAMAGE);
    stack.count = losses.count;
    stack.firstHealth = losses.firstHealth;
    draft.events.push({
      type: "moatDamage",
      stackId: stack.id,
      damage: MOAT_DAMAGE,
      killed: losses.killed,
      left: losses.count,
    });
    if (losses.count === 0) {
      stack.turn = "done";
      draft.events.push({ type: "stackDied", stackId: stack.id });
    }
  }
}

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
