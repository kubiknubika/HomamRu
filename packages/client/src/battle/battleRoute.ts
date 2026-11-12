/** Путь отряда по клеткам — чтобы экран показал, как отряд дошёл, а не перенёс его по прямой. */
import { activeStackOf, BATTLE_WIDTH, neighbours, walkSteps } from "@homamru/core";
import type { BattleCommand, BattleState, Cell } from "@homamru/core";

/** Номер клетки — тот же ключ, что в ядре. */
function key(cell: Cell): number {
  return cell.row * BATTLE_WIDTH + cell.col;
}

function destinationOf(command: BattleCommand): Cell | undefined {
  if (command.type === "battleMove") {
    return command.to;
  }
  return command.type === "battleAttack" ? command.from : undefined;
}

/**
 * Клетки, по которым пройдёт отряд, чей сейчас ход, выполняя команду: от первой после
 * своей до конечной. Летающий летит по прямой — в пути одна конечная клетка.
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
  if (mover.creature.flying) {
    return [to];
  }
  // Число шагов до конечной клетки от каждой клетки; идём от отряда туда, где шагов меньше.
  const steps = walkSteps(state, to, mover);
  const route: Cell[] = [];
  let current: Cell = { col: mover.col, row: mover.row };
  let left = steps.get(key(current));
  while (left !== undefined && left > 0) {
    const wanted = left - 1;
    const next = neighbours(current).find((cell) => steps.get(key(cell)) === wanted);
    if (next === undefined) {
      return [];
    }
    route.push(next);
    current = next;
    left = wanted;
  }
  return route;
}
