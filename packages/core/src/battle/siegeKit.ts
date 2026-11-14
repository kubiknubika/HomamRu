/** Помощники тестов осады. */
import { cellIndex } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { reachableCells } from "./queries.ts";
import type { Fortification } from "./siege.ts";
import { act, army, stack, startBattle } from "./testkit.ts";
import type { BattleEvent, BattleState } from "./types.ts";

export function siege(
  fortification: Fortification,
  attacker: readonly string[] = ["militia:20"],
  defender: readonly string[] = ["militia:20"],
  buildings = 0,
) {
  return startBattle(army(attacker), army(defender), { siege: { fortification, buildings } });
}

export function canReach(state: BattleState, id: string, cell: Cell): boolean {
  return reachableCells(state, stack(state, id)).has(cellIndex(cell));
}

export function healthOf(state: BattleState, id: string): number {
  const { count, creature, firstHealth } = stack(state, id);
  return (count - 1) * creature.health + firstHealth;
}

/** Состояние с другой прочностью частей. */
export function withHealth(
  state: BattleState,
  health: Partial<Record<string, number>>,
): BattleState {
  const { siege: current } = state;
  if (current === null) {
    throw new Error("Бой не осада.");
  }
  return { ...state, siege: { ...current, health: { ...current.health, ...health } } };
}

/** Все отряды защищаются до начала следующего раунда; возвращает события этого времени. */
export function untilNextRound(initial: BattleState): BattleEvent[] {
  let current = initial;
  const seen: BattleEvent[] = [];
  while (current.round === initial.round && current.result === null) {
    const next = act(current, { type: "battleDefend" });
    seen.push(...next.events);
    current = next.state;
  }
  return seen;
}

/** Куда целилась катапульта в начале следующего раунда — по 20 боям с такой прочностью частей. */
export function catapultAims(health: Partial<Record<string, number>>): string[] {
  const aimed = new Set<string>();
  for (let seed = 1; seed <= 20; seed += 1) {
    const start = startBattle(army(["militia:20"]), army(["militia:20"]), {
      seed,
      siege: { fortification: "citadel", buildings: 0 },
    });
    for (const event of untilNextRound(withHealth(start.state, health))) {
      if (event.type === "catapultShot") {
        aimed.add(event.aimed);
      }
    }
  }
  return [...aimed];
}
