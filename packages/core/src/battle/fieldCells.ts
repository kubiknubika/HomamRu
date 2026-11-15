/**
 * Клетки построек: форма силового поля и стены огня, годится ли клетка под постройку.
 * Спецификация: docs/mechanics/70-spells-field.md.
 */
import { inField, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import type { BattleField } from "./queries.ts";
import { GATE_BRIDGE, GATE_INNER, GATE_OUTER, isMoat, wallCells } from "./siege.ts";
import type { BattleSide } from "./types.ts";

/** Клетка выше: правее (`right`) или левее. Чётные ряды сдвинуты вправо. */
function above(cell: Cell, right: boolean): Cell {
  const even = cell.row % 2 === 0;
  const shift = right ? (even ? 1 : 0) : even ? 0 : -1;
  return { col: cell.col + shift, row: cell.row - 1 };
}

/**
 * Клетки силового поля или стены огня, поставленных в `cell`: сама клетка, клетка выше
 * (у нападающего — правее, у обороняющегося — левее) и, если клеток три, клетка над ними.
 */
export function forceFieldCells(side: BattleSide, cell: Cell, count: number): Cell[] {
  const second = above(cell, side === 0);
  return [cell, second, above(second, side !== 0)].slice(0, count);
}

/** Постройка в клетке, о которой сторона `side` знает: своя или уже открытая. */
export function seenFieldAt(state: BattleField, cell: Cell, side: BattleSide) {
  return state.fields.find(
    (field) =>
      (field.hidden !== true || field.side === side) &&
      field.cells.some((item) => sameCell(item, cell)),
  );
}

/**
 * Можно ли стороне `side` поставить постройку на клетку: свободна, не стена города, не ров, не ворота.
 * Скрытая ловушка врага не мешает: о ней не знают, новая постройка её заменит.
 */
export function buildable(state: BattleField, cell: Cell, side: BattleSide): boolean {
  if (!inField(cell) || state.obstacles.some((item) => sameCell(item, cell))) {
    return false;
  }
  if (state.stacks.some((stack) => stack.count > 0 && sameCell(stack, cell))) {
    return false;
  }
  if (seenFieldAt(state, cell, side) !== undefined) {
    return false;
  }
  const { siege } = state;
  if (siege === null) {
    return true;
  }
  const taken = [...wallCells(siege), GATE_BRIDGE, GATE_OUTER, GATE_INNER];
  return !isMoat(siege, cell) && !taken.some((item) => sameCell(item, cell));
}
