/**
 * Компьютер и заклинания по площади: урон чужим минус урон своим.
 * Спецификация: docs/mechanics/68-spells-area.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { aimsAtCell, areaVictims } from "./area.ts";
import type { SpellAim } from "./area.ts";
import { canTarget, spellDamageTo } from "./cast.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH } from "./hex.ts";
import { isMachine } from "./siege.ts";
import type { BattleHero, BattleSide, StackState } from "./types.ts";

/**
 * Польза считается в целых числах: одно очко здоровья — 80 единиц.
 * Так проценты (7,5 %, 15 %, 30 %) и средний урон не дают дробей.
 */
export const HEALTH = 80;

function healthOf(stack: StackState): number {
  return (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/** Урон сверх здоровья отряда не считается; катапульта не в счёт. */
function areaBenefit(
  alive: readonly StackState[],
  side: BattleSide,
  hero: BattleHero,
  spell: SpellDefinition,
  aim: SpellAim,
): number {
  return areaVictims(alive, spell, aim).reduce((total, { stack, divisor }) => {
    if (isMachine(stack)) {
      return total;
    }
    const lost = Math.min(spellDamageTo(spell, hero, stack, divisor), healthOf(stack)) * HEALTH;
    return stack.side === side ? total - lost : total + lost;
  }, 0);
}

/** Куда можно направить заклинание: все клетки поля, вражеские отряды или никуда. */
function areaAims(
  alive: readonly StackState[],
  side: BattleSide,
  spell: SpellDefinition,
): SpellAim[] {
  if (spell.area === "all") {
    return [{}];
  }
  if (!aimsAtCell(spell)) {
    return alive
      .filter((stack) => canTarget(spell, side, stack))
      .map((stack) => ({ target: stack.id }));
  }
  const cells: SpellAim[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      cells.push({ cell: { col, row } });
    }
  }
  return cells;
}

/**
 * Лучшая цель заклинания по площади и её польза; `undefined` — пользы нет нигде.
 * При равной пользе — клетка с меньшим номером, отряд — раньше в армии.
 */
export function bestAreaCast(
  alive: readonly StackState[],
  side: BattleSide,
  hero: BattleHero,
  spell: SpellDefinition,
): { aim: SpellAim; worth: number } | undefined {
  let best: { aim: SpellAim; worth: number } | undefined;
  for (const aim of areaAims(alive, side, spell)) {
    const worth = areaBenefit(alive, side, hero, spell, aim);
    if (worth > 0 && (best === undefined || worth > best.worth)) {
      best = { aim, worth };
    }
  }
  return best;
}
