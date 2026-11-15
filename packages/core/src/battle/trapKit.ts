/** Помощники тестов ловушек: бой с полной книгой, готовые постройки. */
import { ALL_SPELLS } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { mage } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import type { Cell } from "./hex.ts";
import { army, startBattle, turnOf, withStacks } from "./testkit.ts";
import type { BattleEvent, BattleState, FieldObject } from "./types.ts";

/** Бой: оба героя знают всю книгу на уровне `mastery`, сила магии 2; первым ходит a1. */
export function battle(
  mastery = 0,
  armies: [string[], string[]] = [["militia:20"], ["militia:20"]],
) {
  const spells = ALL_SPELLS.map((item) => spellAtMastery(item, mastery));
  const { state } = startBattle(
    army(armies[0], { hero: mage(2, 200, spells) }),
    army(armies[1], { hero: mage(2, 200, spells) }),
  );
  return turnOf(state, "a1");
}

type Aim = { readonly target?: string; readonly cell?: Cell };

/** Герой стороны `side` колдует; правило «раз в раунд» снято. */
export function cast(state: BattleState, id: string, aim: Aim = {}, side: 0 | 1 = 0) {
  const fresh = { ...state.sides[side], cast: false };
  const sides =
    side === 0 ? ([fresh, state.sides[1]] as const) : ([state.sides[0], fresh] as const);
  const result = applyBattleCommand(
    { ...state, sides },
    { type: "battleCast", side, spell: id, ...aim },
  );
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result;
}

export function withFields(state: BattleState, fields: FieldObject[]): BattleState {
  return { ...state, fields };
}

export const sand = (cell: Cell, side: 0 | 1, hidden = true): FieldObject =>
  hidden
    ? { kind: "quicksand", cells: [cell], side, rounds: 0, hidden: true }
    : { kind: "quicksand", cells: [cell], side, rounds: 0 };

export const mine = (cell: Cell, side: 0 | 1, damage = 45): FieldObject => ({
  kind: "mine",
  cells: [cell],
  side,
  rounds: 0,
  hidden: true,
  damage,
  level: 3,
});

export const wall = (cells: Cell[], side: 0 | 1, damage = 30): FieldObject => ({
  kind: "fireWall",
  cells,
  side,
  rounds: 2,
  damage,
  level: 2,
});

export const typesOf = (events: readonly BattleEvent[]): string[] =>
  events.map((event) => event.type);

/** a1 стоит в (2, 5): ряд нечётный, сосед справа — (3, 5), дальше (4, 5). */
export function lined(mastery = 0, armies?: [string[], string[]]): BattleState {
  return withStacks(battle(mastery, armies), { a1: { col: 2, row: 5 }, b1: { col: 12, row: 5 } });
}
