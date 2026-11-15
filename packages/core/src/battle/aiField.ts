/**
 * Компьютер и заклинания поля боя: «Землетрясение», «Телепорт», «Мины», «Зыбучие пески»; остальные он не колдует.
 * Спецификация: docs/mechanics/70-spells-field.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { isMelee, strikeOf, strongest } from "./aiControl.ts";
import type { SpellAim } from "./area.ts";
import { immuneTo } from "./effects.ts";
import { teleportCells } from "./field.ts";
import { distance } from "./hex.ts";
import { attackCells, isAlive } from "./queries.ts";
import { isMachine, SEGMENTS } from "./siege.ts";
import { trapDamage } from "./traps.ts";
import type { BattleHero, BattleSide, BattleState, StackState } from "./types.ts";

type Found = { aim: SpellAim; worth: number } | undefined;

/** Нападающий в осаде, стена ещё стоит, есть пешие: удар сильнейшего пешего × число ударов ÷ 2. */
function quakeCast(state: BattleState, side: BattleSide, spell: SpellDefinition): Found {
  const { siege } = state;
  if (siege === null || side !== 0 || !SEGMENTS.some((part) => siege.health[part] > 0)) {
    return undefined;
  }
  const foot = state.stacks.filter(
    (stack) => stack.side === side && isAlive(stack) && !isMachine(stack) && !stack.creature.flying,
  );
  const worth = Math.floor((strongest(foot) * spell.value) / 2);
  return worth > 0 ? { aim: {}, worth } : undefined;
}

/**
 * Отряд ближнего боя, который за этот ход не достаёт никого, переносится вплотную к вражескому
 * стрелку: польза — половина удара отряда. Из равных — отряд и стрелок раньше в армии, клетка с меньшим номером.
 */
function teleportCast(state: BattleState, side: BattleSide, spell: SpellDefinition): Found {
  const alive = state.stacks.filter((stack) => isAlive(stack) && !isMachine(stack));
  const foes = alive.filter((stack) => stack.side !== side);
  const shooters = foes.filter((stack) => !isMelee(stack));
  let best: Found;
  for (const mine of alive) {
    const stuck = (target: StackState): boolean => attackCells(state, mine, target).length === 0;
    if (mine.side !== side || !isMelee(mine) || immuneTo(mine, spell.level) || !foes.every(stuck)) {
      continue;
    }
    const worth = Math.floor(strikeOf(mine) / 2);
    const cells = teleportCells(state, mine, spell.value);
    const cell = cells.find((item) => shooters.some((shooter) => distance(item, shooter) === 1));
    if (cell !== undefined && worth > (best?.worth ?? 0)) {
      best = { aim: { target: mine.id, cell }, worth };
    }
  }
  return best;
}

/**
 * «Мины» и «Зыбучие пески»: у врага есть пешие отряды, не стоящие вплотную к нашим.
 * Мины — урон мины × число таких отрядов ÷ 4; пески — удар таких отрядов ближнего боя ÷ 4.
 * Второй раз, пока свои ловушки того же вида стоят, не колдует.
 */
function trapCast(
  state: BattleState,
  side: BattleSide,
  spell: SpellDefinition,
  hero: Pick<BattleHero, "spellPower" | "sorcery">,
): Found {
  const kind = spell.effect === "mine" ? "mine" : "quicksand";
  if (state.fields.some((field) => field.kind === kind && field.side === side)) {
    return undefined;
  }
  const alive = state.stacks.filter((stack) => isAlive(stack) && !isMachine(stack));
  const ours = alive.filter((stack) => stack.side === side);
  const walkers = alive.filter(
    (stack) =>
      stack.side !== side &&
      !stack.creature.flying &&
      !ours.some((mine) => distance(mine, stack) === 1),
  );
  const worth =
    kind === "mine"
      ? Math.floor((trapDamage(spell, hero) * walkers.length) / 4)
      : Math.floor(walkers.filter(isMelee).reduce((sum, stack) => sum + strikeOf(stack), 0) / 4);
  return worth > 0 ? { aim: {}, worth } : undefined;
}

/** Лучшая цель заклинания поля и её польза; `undefined` — колдовать незачем. */
export function bestFieldCast(state: BattleState, side: BattleSide, spell: SpellDefinition): Found {
  const { hero } = state.sides[side];
  if (hero !== null && (spell.effect === "mine" || spell.effect === "quicksand")) {
    return trapCast(state, side, spell, hero);
  }
  if (spell.effect === "earthquake") {
    return quakeCast(state, side, spell);
  }
  return spell.effect === "teleport" ? teleportCast(state, side, spell) : undefined;
}
