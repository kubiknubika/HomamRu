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

/**
 * Клетки, по которым отряд дойдёт до `to`: путь обрывается там, где отряд встал.
 * Отряд мог не дойти — увяз в песках, погиб на ловушке, — и тогда конец пути в `to`
 * не совпадает с концом записанного маршрута. Клетки `to` нет в маршруте вовсе —
 * ведём по прямой, одной клеткой. Спецификация: docs/mechanics/16-battle-screen.md.
 */
export function shownRoute(route: readonly Cell[], to: Cell): readonly Cell[] {
  const end = route.findIndex((cell) => cell.col === to.col && cell.row === to.row);
  return end === -1 ? [to] : route.slice(0, end + 1);
}
