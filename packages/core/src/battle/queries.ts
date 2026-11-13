/**
 * Запросы к состоянию боя: кто где стоит, куда можно пойти. Ничего не меняют.
 * Спецификация: docs/mechanics/12-battle-actions.md.
 */
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex, distance, neighbours, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { isMachine, isMoat, siegeBlocked } from "./siege.ts";
import type { BattleSide, BattleState, StackState } from "./types.ts";

/** Поле боя: что на нём стоит. Запросам хватает этого, без очереди ходов и итога. */
export type BattleField = Pick<BattleState, "obstacles" | "siege" | "stacks">;

export function isAlive(stack: StackState): boolean {
  return stack.count > 0;
}

export function findStack(state: BattleState, id: string): StackState | undefined {
  return state.stacks.find((stack) => stack.id === id);
}

/** Отряд, чей сейчас ход. */
export function activeStackOf(state: BattleState): StackState | undefined {
  return state.activeStack === null ? undefined : findStack(state, state.activeStack);
}

/** Номера клеток, на которые отряду стороны `side` нельзя встать: препятствия, живые отряды, стена. */
function blockedCells(state: BattleField, side: BattleSide): Set<number> {
  const blocked = new Set(state.obstacles.map(cellIndex));
  if (state.siege !== null) {
    for (const cell of siegeBlocked(state.siege, state.stacks, side)) {
      blocked.add(cellIndex(cell));
    }
  }
  for (const stack of state.stacks) {
    if (isAlive(stack)) {
      blocked.add(cellIndex(stack));
    }
  }
  return blocked;
}

/**
 * Клетки, куда отряд может переместиться за ход.
 * Пеший идёт по свободным клеткам, во рву останавливается; летающий садится на любую свободную в пределах скорости.
 * Клетки самого отряда в ответе нет.
 */
export function reachableCells(state: BattleField, stack: StackState): Map<number, Cell> {
  const blocked = blockedCells(state, stack.side);
  const reachable = new Map<number, Cell>();
  if (isMachine(stack)) {
    // Катапульта не ходит.
    return reachable;
  }
  if (stack.creature.flying) {
    for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
      for (let col = 0; col < BATTLE_WIDTH; col += 1) {
        const cell = { col, row };
        if (!blocked.has(cellIndex(cell)) && distance(stack, cell) <= stack.creature.speed) {
          reachable.set(cellIndex(cell), cell);
        }
      }
    }
    return reachable;
  }
  // Поиск в ширину: волна за волной, не дальше скорости.
  let wave: Cell[] = [{ col: stack.col, row: stack.row }];
  for (let step = 0; step < stack.creature.speed; step += 1) {
    const next: Cell[] = [];
    for (const cell of wave) {
      // Вошедший в ров дальше не идёт; стоящий во рву с начала хода выходит свободно.
      if (step > 0 && isMoat(state.siege, cell)) {
        continue;
      }
      for (const neighbour of neighbours(cell)) {
        const index = cellIndex(neighbour);
        if (!blocked.has(index) && !reachable.has(index)) {
          reachable.set(index, neighbour);
          next.push(neighbour);
        }
      }
    }
    wave = next;
  }
  return reachable;
}

/**
 * Число шагов пешком от клетки `from` до каждой свободной клетки, в обход препятствий и отрядов.
 * Клетка отряда `mover` считается свободной: это он идёт. Сама `from` может быть занята.
 */
export function walkSteps(state: BattleField, from: Cell, mover: StackState): Map<number, number> {
  const blocked = blockedCells(state, mover.side);
  blocked.delete(cellIndex(mover));
  const steps = new Map<number, number>([[cellIndex(from), 0]]);
  let wave: Cell[] = [from];
  for (let step = 1; wave.length > 0; step += 1) {
    const next: Cell[] = [];
    for (const cell of wave) {
      for (const neighbour of neighbours(cell)) {
        const index = cellIndex(neighbour);
        if (!blocked.has(index) && !steps.has(index)) {
          steps.set(index, step);
          next.push(neighbour);
        }
      }
    }
    wave = next;
  }
  return steps;
}

/** Стоит ли рядом с отрядом живой враг. */
export function hasAdjacentEnemy(state: BattleField, stack: StackState): boolean {
  return state.stacks.some(
    (other) => isAlive(other) && other.side !== stack.side && distance(stack, other) === 1,
  );
}

/** Может ли отряд сейчас стрелять. */
export function canShoot(state: BattleField, stack: StackState): boolean {
  return stack.creature.shots > 0 && stack.shots > 0 && !hasAdjacentEnemy(state, stack);
}

/** Клетки, с которых отряд может ударить цель в этот ход: своя и достижимые, соседние с целью. */
export function attackCells(state: BattleField, stack: StackState, target: StackState): Cell[] {
  const reachable = reachableCells(state, stack);
  return neighbours(target).filter(
    (cell) => sameCell(cell, stack) || reachable.has(cellIndex(cell)),
  );
}
