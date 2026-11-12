/** Общие заготовки для тестов экрана боя. */
import { createBattle } from "@homamru/core";
import type { BattleDefinition, BattleState, CreatureDefinition } from "@homamru/core";
import { createBattleSession } from "./battleSession.ts";
import type { BattleSession } from "./battleSession.ts";

const MILITIA: CreatureDefinition = {
  id: "militia",
  name: "Ополченец",
  attack: 5,
  defense: 5,
  damageMin: 2,
  damageMax: 3,
  health: 12,
  speed: 4,
  flying: false,
  shots: 0,
};
const SLINGER: CreatureDefinition = {
  ...MILITIA,
  id: "slinger",
  name: "Пращник",
  defense: 3,
  damageMin: 1,
  damageMax: 4,
  health: 9,
  speed: 5,
  shots: 10,
};
const FALCON: CreatureDefinition = {
  ...MILITIA,
  id: "falcon",
  name: "Сокол",
  attack: 7,
  damageMin: 3,
  damageMax: 5,
  health: 18,
  speed: 8,
  flying: true,
};

function army(stacks: string[], withHero: boolean) {
  return {
    hero: withHero ? { attack: 0, defense: 0 } : undefined,
    morale: 0,
    luck: 0,
    army: stacks.map((entry) => {
      const [creature = "", count = "1"] = entry.split(":");
      return { creature, count: Number(count) };
    }),
  };
}

export function battle(attacker: string[], defender: string[], hero = false): BattleState {
  const definition: BattleDefinition = {
    id: "t",
    name: "t",
    obstacles: [],
    attacker: army(attacker, hero),
    defender: army(defender, false),
  };
  const created = createBattle(definition, [MILITIA, SLINGER, FALCON], 1);
  if (!created.ok) {
    throw new Error("бой не создан");
  }
  return created.state;
}

/** Сессия, в которой экран уже всё показал и ход у игрока. */
export function ready(state: BattleState): BattleSession {
  const session = createBattleSession(state);
  session.animationDone();
  return session;
}

/** Ставит отряды в нужные клетки. */
export function place(state: BattleState, cells: Record<string, [number, number]>): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((stack) => {
      const cell = cells[stack.id];
      return cell === undefined ? stack : { ...stack, col: cell[0], row: cell[1] };
    }),
  };
}
