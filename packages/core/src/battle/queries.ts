/**
 * Запросы к состоянию боя: кто где стоит, куда можно пойти. Ничего не меняют.
 * Спецификация: docs/mechanics/12-battle-actions.md.
 */
import { commanderOf, forgotShooting, isBerserk, speedOf } from "./effects.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex, distance, neighbours, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { isMachine, isMoat, siegeBlocked } from "./siege.ts";
import type { BattleSide, BattleState, StackState } from "./types.ts";

/** Поле боя: что на нём стоит. Запросам хватает этого, без очереди ходов и итога. */
export type BattleField = Pick<BattleState, "obstacles" | "fields" | "siege" | "stacks">;

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

/** Сторона, которая сейчас даёт команду: под гипнозом отрядом командует чужая (69-spells-control.md). */
export function commandingSide(state: BattleState): BattleSide | undefined {
  const active = activeStackOf(state);
  return active === undefined ? undefined : commanderOf(active);
}

/**
 * Номера клеток, на которые отряду стороны `side` нельзя встать: препятствия, живые отряды, стена,
 * силовое поле.
 */
export function blockedCells(state: BattleField, side: BattleSide): Set<number> {
  const blocked = new Set(state.obstacles.map(cellIndex));
  for (const field of state.fields) {
    if (field.kind === "forceField") {
      for (const cell of field.cells) {
        blocked.add(cellIndex(cell));
      }
    }
  }
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
 * Ловушки, о которых знает тот, кто командует отрядом, и которые отряду вредят: стена огня,
 * видимые пески (пешему), видимые мины врага. Скрытых ловушек врага для него нет.
 */
function knownTraps(state: BattleField, stack: StackState): Set<number> {
  const known = new Set<number>();
  for (const field of state.fields) {
    const seen = field.hidden !== true || field.side === commanderOf(stack);
    const harms =
      field.kind === "fireWall" ||
      (field.kind === "quicksand" && !stack.creature.flying) ||
      (field.kind === "mine" && field.side !== stack.side);
    if (seen && harms) {
      for (const cell of field.cells) {
        known.add(cellIndex(cell));
      }
    }
  }
  return known;
}

interface WalkNode {
  readonly cell: Cell;
  /** Номер клетки, из которой сюда пришли; у клетки отряда — `null`. */
  prev: number | null;
  readonly steps: number;
  /** Сколько известных ловушек на пути сюда. */
  traps: number;
}

/**
 * Куда пеший отряд дойдёт за ход и каким путём: путь кратчайший, из равных — с меньшим числом
 * известных ловушек, из равных — найденный первым (70-spells-field.md). Клетка отряда — в ответе.
 */
function walkTree(state: BattleField, stack: StackState): Map<number, WalkNode> {
  const blocked = blockedCells(state, stack.side);
  const known = knownTraps(state, stack);
  const start = { col: stack.col, row: stack.row };
  const nodes = new Map<number, WalkNode>([
    [cellIndex(start), { cell: start, prev: null, steps: 0, traps: 0 }],
  ]);
  // Поиск в ширину: волна за волной, не дальше скорости.
  let wave: Cell[] = [start];
  for (let step = 1; step <= speedOf(stack); step += 1) {
    const next: Cell[] = [];
    for (const cell of wave) {
      const from = cellIndex(cell);
      // Вошедший в ров дальше не идёт; стоящий во рву с начала хода выходит свободно.
      if (step > 1 && isMoat(state.siege, cell)) {
        continue;
      }
      const traps = nodes.get(from)?.traps ?? 0;
      for (const neighbour of neighbours(cell)) {
        const index = cellIndex(neighbour);
        if (blocked.has(index)) {
          continue;
        }
        const cost = traps + (known.has(index) ? 1 : 0);
        const old = nodes.get(index);
        if (old === undefined) {
          nodes.set(index, { cell: neighbour, prev: from, steps: step, traps: cost });
          next.push(neighbour);
        } else if (old.steps === step && cost < old.traps) {
          old.prev = from;
          old.traps = cost;
        }
      }
    }
    wave = next;
  }
  return nodes;
}

/**
 * Клетки, по которым отряд пойдёт в клетку `to`: от первой после своей до `to`.
 * Летающий летит по прямой — в пути одна клетка. Дойти нельзя — пустой список.
 */
export function walkRoute(state: BattleField, stack: StackState, to: Cell): Cell[] {
  if (sameCell(stack, to)) {
    return [];
  }
  if (stack.creature.flying) {
    return [{ col: to.col, row: to.row }];
  }
  const nodes = walkTree(state, stack);
  const route: Cell[] = [];
  let node = nodes.get(cellIndex(to));
  while (node !== undefined && node.prev !== null) {
    route.unshift(node.cell);
    node = nodes.get(node.prev);
  }
  return route;
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
        if (!blocked.has(cellIndex(cell)) && distance(stack, cell) <= speedOf(stack)) {
          reachable.set(cellIndex(cell), cell);
        }
      }
    }
    return reachable;
  }
  for (const [index, node] of walkTree(state, stack)) {
    if (node.prev !== null) {
      reachable.set(index, node.cell);
    }
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

/** Стоит ли рядом с отрядом живой враг. Под гипнозом враги — прежние товарищи; в берсерке — все. */
export function hasAdjacentEnemy(state: BattleField, stack: StackState): boolean {
  const mine = commanderOf(stack);
  return state.stacks.some(
    (other) =>
      isAlive(other) &&
      other.id !== stack.id &&
      (isBerserk(stack) || commanderOf(other) !== mine) &&
      distance(stack, other) === 1,
  );
}

/** Может ли отряд сейчас стрелять. */
export function canShoot(state: BattleField, stack: StackState): boolean {
  if (forgotShooting(stack)) {
    return false;
  }
  return stack.creature.shots > 0 && stack.shots > 0 && !hasAdjacentEnemy(state, stack);
}

/** Клетки, с которых отряд может ударить цель в этот ход: своя и достижимые, соседние с целью. */
export function attackCells(state: BattleField, stack: StackState, target: StackState): Cell[] {
  const reachable = reachableCells(state, stack);
  // Из известных песков не ударить: вошедший в них пеший отряд теряет ход (70-spells-field.md).
  const sands = new Set<number>();
  for (const field of state.fields) {
    const seen = field.hidden !== true || field.side === commanderOf(stack);
    if (field.kind === "quicksand" && seen && !stack.creature.flying) {
      for (const cell of field.cells) {
        sands.add(cellIndex(cell));
      }
    }
  }
  return neighbours(target).filter(
    (cell) =>
      sameCell(cell, stack) || (reachable.has(cellIndex(cell)) && !sands.has(cellIndex(cell))),
  );
}
