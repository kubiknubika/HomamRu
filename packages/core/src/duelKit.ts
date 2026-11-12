// Помощники тестов этапа 5: партия на двоих и короткая запись команд.
import { chooseBattleCommand } from "./battle/ai.ts";
import { activeStackOf } from "./battle/queries.ts";
import { applyCommand } from "./commands.ts";
import { createGame } from "./game.ts";
import { formatEvent } from "./render.ts";
import { CONTENT } from "./testkit.ts";
import type { ArmyStack, Command, Direction, GameState, MapObjectDefinition } from "./types.ts";

const ROWS = Array.from({ length: 8 }, () => "........");
export const START = ["tavern", "fort", "militia-yard"];
export const HOME: MapObjectDefinition = { type: "town", x: 0, y: 4, owner: 0, buildings: START };

export function army(...entries: string[]): ArmyStack[] {
  return entries.map((entry) => {
    const [creature = "", count = "1"] = entry.split(":");
    return { creature, count: Number(count) };
  });
}

export function enemyTown(garrison: ArmyStack[] = []): MapObjectDefinition {
  return { type: "town", x: 4, y: 4, owner: 1, buildings: START, garrison };
}

/** Партия на двоих: герой A в (0, 0), герой B в (4, 0) — в 4 клетках по прямой. */
export function duel(
  objects: MapObjectDefinition[],
  mine: ArmyStack[] = army("militia:100"),
  theirs: ArmyStack[] = army("militia:10"),
): GameState {
  const created = createGame(
    {
      id: "duel",
      name: "Двое",
      terrain: ROWS,
      players: [
        { hero: { x: 0, y: 0, attack: 0, defense: 0, army: mine }, resources: { gold: 20_000 } },
        {
          hero: { x: 4, y: 0, attack: 0, defense: 0, army: theirs },
          kind: "computer",
          resources: { gold: 20_000, wood: 20, ore: 20 },
        },
      ],
      objects,
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("; "));
  }
  return created.state;
}

export function run(state: GameState, ...commands: Command[]): GameState {
  let current = state;
  for (const command of commands) {
    const result = applyCommand(current, command);
    if (!result.ok) {
      throw new Error(`${command.type}: ${result.code}: ${result.message}`);
    }
    current = result.state;
  }
  return current;
}

export function lines(state: GameState, command: Command): string[] {
  const result = applyCommand(state, command);
  if (!result.ok) {
    return [result.code];
  }
  return result.events.filter((event) => event.type !== "battle").map(formatEvent);
}

export function move(player: number, ...path: Direction[]): Command {
  return { type: "moveHero", player, heroId: player === 0 ? "A" : "B", path };
}

export const end = (player: number): Command => ({ type: "endTurn", player });

/** Ставит героя в клетку в обход правил. */
export function put(state: GameState, heroId: string, x: number, y: number): GameState {
  return {
    ...state,
    heroes: state.heroes.map((hero) => (hero.id === heroId ? { ...hero, x, y } : hero)),
  };
}

export function withoutHero(state: GameState, heroId: string): GameState {
  return { ...state, heroes: state.heroes.filter((hero) => hero.id !== heroId) };
}

/** Проходит дни: оба игрока по очереди кончают ход; останавливается, если партия кончилась. */
export function passDays(initial: GameState, count: number): GameState {
  let state = initial;
  for (let turn = 0; turn < count * 2 && state.outcome === null; turn += 1) {
    state = run(state, end(state.currentPlayer));
  }
  return state;
}

/** Бой идёт компьютером, пока ход не перейдёт к отряду данной стороны. */
export function untilTurnOf(initial: GameState, side: 0 | 1): GameState {
  let state = initial;
  while (state.battle !== null && activeStackOf(state.battle.state)?.side !== side) {
    const command = chooseBattleCommand(state.battle.state);
    if (command === undefined) {
      break;
    }
    state = run(state, command);
  }
  return state;
}

export const TO_HERO = move(0, "E", "E", "E", "E");
/** Из (3, 3) в город противника (4, 4). */
export const TO_TOWN = move(0, "SE");

/** Город противника захвачен без боя в первый день. */
export function captured(): GameState {
  return run(put(duel([HOME, enemyTown()]), "A", 3, 3), TO_TOWN);
}
