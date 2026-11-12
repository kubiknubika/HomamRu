/**
 * Что подсветить на поле боя: клетки и обводки отрядов. Только решает, что показать;
 * рисует сцена. Без Phaser, чтобы проверять тестами.
 * Спецификация: docs/mechanics/16-battle-screen.md.
 */
import { activeStackOf, findStack, reachableCells } from "@homamru/core";
import type { Cell, StackState } from "@homamru/core";
import { attackableTargets, playerStack } from "./battleSession.ts";
import type { BattleSnapshot } from "./battleSession.ts";

type CellMark =
  /** Сюда может пойти отряд игрока. */
  | "reach"
  /** Сюда может пойти отряд, который игрок рассматривает. */
  | "otherReach"
  /** Сюда могут пойти оба. */
  | "overlap"
  /** Клетка, выбранная для хода. */
  | "moveChoice"
  /** Клетка, с которой можно ударить выбранного врага. */
  | "attackCell"
  /** Клетка, выбранная для удара. */
  | "attackChoice";

type RingMark =
  /** Отряд, чей ход. */
  | "active"
  /** Враг, которого можно ударить или обстрелять. */
  | "attackable"
  /** Выбранный враг. */
  | "target"
  /** Отряд, который игрок рассматривает. */
  | "inspected";

export interface Highlights {
  readonly cells: readonly { readonly cell: Cell; readonly mark: CellMark }[];
  readonly rings: readonly { readonly stack: StackState; readonly mark: RingMark }[];
}

function keyOf(cell: Cell): string {
  return `${cell.col},${cell.row}`;
}

export function highlightsOf(snapshot: BattleSnapshot): Highlights {
  const { state, selection } = snapshot;
  const marks = new Map<string, { cell: Cell; mark: CellMark }>();
  const rings: { stack: StackState; mark: RingMark }[] = [];
  const put = (cell: Cell, mark: CellMark): void => {
    marks.set(keyOf(cell), { cell, mark });
  };

  const active = activeStackOf(state);
  if (active !== undefined) {
    rings.push({ stack: active, mark: "active" });
  }
  const me = playerStack(snapshot);
  if (me !== undefined) {
    for (const cell of reachableCells(state, me).values()) {
      put(cell, "reach");
    }
  }
  const inspected = snapshot.inspected === null ? undefined : findStack(state, snapshot.inspected);
  if (inspected !== undefined && inspected.count > 0 && inspected.id !== me?.id) {
    rings.push({ stack: inspected, mark: "inspected" });
    for (const cell of reachableCells(state, inspected).values()) {
      put(cell, marks.has(keyOf(cell)) ? "overlap" : "otherReach");
    }
  }
  for (const enemy of attackableTargets(snapshot)) {
    rings.push({ stack: enemy, mark: "attackable" });
  }
  if (me === undefined || selection === null) {
    return { cells: [...marks.values()], rings };
  }
  if (selection.kind === "move") {
    put(selection.cell, "moveChoice");
    return { cells: [...marks.values()], rings };
  }
  const target = findStack(state, selection.targetId);
  if (target !== undefined) {
    rings.push({ stack: target, mark: "target" });
  }
  if (selection.kind === "attack") {
    for (const cell of selection.cells) {
      put(cell, "attackCell");
    }
    if (selection.from !== null) {
      put(selection.from, "attackChoice");
    }
  }
  return { cells: [...marks.values()], rings };
}
