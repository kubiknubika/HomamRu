/**
 * Заклинания по площади: какие клетки и отряды они задевают.
 * Спецификация: docs/mechanics/68-spells-area.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { immuneTo } from "./effects.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, distance, neighbours, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import type { StackState } from "./types.ts";

/** Куда направлено заклинание: в отряд, в клетку или никуда («Армагеддон»). */
export interface SpellAim {
  readonly target?: string | undefined;
  readonly cell?: Cell | undefined;
  /** «Жертва»: отряд, который отдают (71-spells-life.md). */
  readonly victim?: string | undefined;
}

/** Целью заклинания служит клетка, а не отряд. */
export function aimsAtCell(spell: SpellDefinition): boolean {
  return (
    spell.area === "ball" ||
    spell.area === "ring" ||
    spell.area === "inferno" ||
    spell.area === "radius"
  );
}

/** Клетки, которые накроет заклинание, наколдованное в клетку `cell`. */
export function areaCells(spell: SpellDefinition, cell: Cell): Cell[] {
  switch (spell.area) {
    case "ball":
      return [cell, ...neighbours(cell)];
    case "ring":
      return neighbours(cell);
    case "radius":
    case "inferno": {
      const reach = spell.area === "inferno" ? 2 : spell.value;
      const cells: Cell[] = [];
      for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
        for (let col = 0; col < BATTLE_WIDTH; col += 1) {
          if (distance(cell, { col, row }) <= reach) {
            cells.push({ col, row });
          }
        }
      }
      return cells;
    }
    default:
      return [];
  }
}

/** Задетый отряд и то, во сколько раз урон по нему меньше полного (цепная молния: 1, 2, 4…). */
export interface Victim<T> {
  readonly stack: T;
  readonly divisor: number;
}

/** Цепь: первая цель, потом каждый раз ближайший ещё не задетый отряд; при равенстве — раньше в списке. */
function chainOf<T extends StackState>(
  stacks: readonly T[],
  first: T,
  length: number,
): Victim<T>[] {
  const chain: Victim<T>[] = [{ stack: first, divisor: 1 }];
  let last = first;
  while (chain.length < length) {
    let next: T | undefined;
    for (const stack of stacks) {
      const hit = chain.some((victim) => victim.stack.id === stack.id);
      if (!hit && (next === undefined || distance(last, stack) < distance(last, next))) {
        next = stack;
      }
    }
    if (next === undefined) {
      break;
    }
    chain.push({ stack: next, divisor: 2 ** chain.length });
    last = next;
  }
  return chain;
}

/**
 * Отряды, которые заденет заклинание по площади; свои и чужие — одинаково.
 * `stacks` — живые отряды в порядке армий. Команда уже проверена.
 * Отряд под «Антимагией» не задет, цепь идёт мимо него (69-spells-control.md).
 */
export function areaVictims<T extends StackState>(
  everyone: readonly T[],
  spell: SpellDefinition,
  aim: SpellAim,
): Victim<T>[] {
  const stacks = everyone.filter((stack) => !immuneTo(stack, spell.level));
  if (spell.area === "all") {
    return stacks.map((stack) => ({ stack, divisor: 1 }));
  }
  if (spell.area === "chain") {
    const first = stacks.find((stack) => stack.id === aim.target);
    return first === undefined
      ? []
      : chainOf(stacks, first, spell.chainLength ?? spell.chain?.[0] ?? 1);
  }
  const { cell } = aim;
  if (cell === undefined) {
    return [];
  }
  const cells = areaCells(spell, cell);
  return stacks
    .filter((stack) => cells.some((covered) => sameCell(covered, stack)))
    .map((stack) => ({ stack, divisor: 1 }));
}
