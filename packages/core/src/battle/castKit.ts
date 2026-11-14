/** Помощники тестов заклинаний в бою. В игре не используются. */
import { spell, SPELLS } from "../spellKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { army, startBattle, turnOf, withStacks } from "./testkit.ts";
import type { BattleEvent, BattleSide, BattleState } from "./types.ts";

/** Герой без атаки и защиты, знающий все двенадцать заклинаний. */
export function mage(spellPower: number, mana = 100) {
  return { attack: 0, defense: 0, spellPower, mana, spells: SPELLS };
}

/**
 * Бой: 20 ополченцев и 10 пращников против 20 ополченцев, у обеих сторон герой.
 * Первым ходит пращник нападающего (a2).
 */
export function magicBattle(spellPower = 2, mana = 100): BattleState {
  return startBattle(
    army(["militia:20", "slinger:10"], { hero: mage(spellPower, mana) }),
    army(["militia:20"], { hero: mage(1) }),
  ).state;
}

const FIRST = { 0: "a1", 1: "b1" } as const;

/** Код отказа или «принята»; ход на время проверки отдаётся отряду колдующей стороны. */
export function castCode(state: BattleState, side: BattleSide, id: string, target: string): string {
  const result = applyBattleCommand(turnOf(state, FIRST[side]), {
    type: "battleCast",
    side,
    spell: id,
    target,
  });
  return result.ok ? "принята" : result.code;
}

/**
 * Колдует в обход правила «одно заклинание в раунд»: тестам нужно несколько действий сразу.
 * Ход остаётся у того отряда, у кого был.
 */
export function conjure(
  state: BattleState,
  side: BattleSide,
  id: string,
  target: string,
): { state: BattleState; events: readonly BattleEvent[] } {
  const ready = {
    ...turnOf(state, FIRST[side]),
    sides: [
      { ...state.sides[0], cast: false },
      { ...state.sides[1], cast: false },
    ] as const,
  };
  const result = applyBattleCommand(ready, { type: "battleCast", side, spell: id, target });
  if (!result.ok) {
    throw new Error(`Отказ ${result.code}: ${result.message}`);
  }
  return { state: { ...result.state, activeStack: state.activeStack }, events: result.events };
}

/** Несколько заклинаний подряд: записи вида `[сторона, заклинание, цель]`. */
export function conjureAll(
  state: BattleState,
  ...casts: readonly (readonly [BattleSide, string, string])[]
): BattleState {
  return casts.reduce(
    (current, [side, id, target]) => conjure(current, side, id, target).state,
    state,
  );
}

/** Ополченцы сторон стоят вплотную посреди поля: a1 в (5, 5), b1 в (6, 5). */
export function faceToFace(state: BattleState): BattleState {
  return withStacks(state, { a1: { col: 5, row: 5 }, b1: { col: 6, row: 5 } });
}

export const costOf = (id: string): number => spell(id).cost;
