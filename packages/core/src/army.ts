/**
 * Армия героя и гарнизона: один отряд на каждый вид существ (31-recruitment.md).
 */
import type { ArmyStack } from "./types.ts";

/** Сколько существ этого вида в армии. */
export function countIn(army: readonly ArmyStack[], creature: string): number {
  return army.find((stack) => stack.creature === creature)?.count ?? 0;
}

/** Добавляет существ: к своему отряду, а если его нет — новым отрядом в конец. */
export function addToArmy(
  army: readonly ArmyStack[],
  creature: string,
  count: number,
): ArmyStack[] {
  if (!army.some((stack) => stack.creature === creature)) {
    return [...army, { creature, count }];
  }
  return army.map((stack) =>
    stack.creature === creature ? { creature, count: stack.count + count } : stack,
  );
}

/** Убирает существ; опустевший отряд исчезает. Больше, чем есть, убрать нельзя — проверяет вызывающий. */
export function removeFromArmy(
  army: readonly ArmyStack[],
  creature: string,
  count: number,
): ArmyStack[] {
  return army
    .map((stack) =>
      stack.creature === creature ? { creature, count: stack.count - count } : stack,
    )
    .filter((stack) => stack.count > 0);
}

/** Сливает отряды одного вида; порядок — по первому появлению. */
export function mergeArmy(army: readonly ArmyStack[]): ArmyStack[] {
  let merged: ArmyStack[] = [];
  for (const stack of army) {
    merged = addToArmy(merged, stack.creature, stack.count);
  }
  return merged;
}
