/** Путь отряда по клеткам — чтобы экран показал, как отряд дошёл, а не перенёс его по прямой. */
import { activeStackOf, walkRoute } from "@homamru/core";
import type { BattleCommand, BattleState, Cell } from "@homamru/core";

function destinationOf(command: BattleCommand): Cell | undefined {
  if (command.type === "battleMove") {
    return command.to;
  }
  return command.type === "battleAttack" ? command.from : undefined;
}

/**
 * Клетки, по которым пройдёт отряд, чей сейчас ход, выполняя команду: от первой после
 * своей до конечной. Летающий летит по прямой — в пути одна конечная клетка.
 * Путь строит ядро — тот же, каким отряд пойдёт (70-spells-field.md).
 * Команда без перемещения или путь не найден — пустой список.
 */
export function routeOf(state: BattleState, command: BattleCommand): Cell[] {
  const mover = activeStackOf(state);
  const to = destinationOf(command);
  if (mover === undefined || to === undefined) {
    return [];
  }
  if (to.col === mover.col && to.row === mover.row) {
    return [];
  }
  return walkRoute(state, mover, to);
}
