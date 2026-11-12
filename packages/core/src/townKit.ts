// Помощники тестов города: партия с городом и короткая запись команд.
import { applyCommand } from "./commands.ts";
import { gameWith } from "./testkit.ts";
import { townOf } from "./town.ts";
import type {
  Command,
  GameEvent,
  GameState,
  MapObjectDefinition,
  ResourceAmounts,
} from "./types.ts";

const ROWS = ["S.......", ...Array.from({ length: 7 }, () => "........")];
export const RICH = { gold: 20_000, wood: 20, ore: 20 };
export const START = ["tavern", "fort", "militia-yard"];

export function townGame(
  buildings: readonly string[] = START,
  resources: ResourceAmounts = RICH,
  extra: readonly MapObjectDefinition[] = [],
  army: readonly string[] = ["militia:10"],
): GameState {
  const definition = { type: "town", x: 1, y: 1, owner: 0, buildings } as const;
  return gameWith(ROWS, [definition, ...extra], { resources, army });
}

/** Применяет команды подряд; любая отклонённая — ошибка теста. */
export function run(state: GameState, ...commands: readonly TownStep[]): GameState {
  let current = state;
  for (const step of commands) {
    const result = applyCommand(current, toCommand(step));
    if (!result.ok) {
      throw new Error(`${JSON.stringify(step)}: ${result.code}`);
    }
    current = result.state;
  }
  return current;
}

export type TownStep =
  | "endTurn"
  | "enter"
  | { build: string }
  | { recruit: string; count: number }
  | { give: string; count: number }
  | { take: string; count: number };

export function toCommand(step: TownStep): Command {
  const base = { player: 0, townId: "o1" };
  if (step === "endTurn") {
    return { type: "endTurn", player: 0 };
  }
  if (step === "enter") {
    return { type: "moveHero", player: 0, heroId: "A", path: ["SE"] };
  }
  if ("build" in step) {
    return { type: "build", ...base, building: step.build };
  }
  if ("recruit" in step) {
    return { type: "recruit", ...base, creature: step.recruit, count: step.count };
  }
  const from = "give" in step ? "hero" : "garrison";
  const creature = "give" in step ? step.give : step.take;
  return { type: "transfer", ...base, from, creature, count: step.count };
}

export function codeOf(state: GameState, step: TownStep): string {
  const result = applyCommand(state, toCommand(step));
  return result.ok ? "ok" : result.code;
}

export function eventsOf(state: GameState, step: TownStep): readonly GameEvent[] {
  const result = applyCommand(state, toCommand(step));
  return result.ok ? result.events : [];
}

export const town = (state: GameState) => townOf(state, 0);
export const gold = (state: GameState) => state.players[0]?.resources.gold;
export const days = (count: number): TownStep[] => Array.from({ length: count }, () => "endTurn");

export const heroArmy = (state: GameState) => state.heroes[0]?.army;
