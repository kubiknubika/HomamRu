/**
 * Поиск пути героя. Это запрос: он ничего не меняет.
 * Спецификация: docs/mechanics/02-hero-movement.md, раздел «Поиск пути».
 */
import { DAILY_MOVEMENT } from "./game.ts";
import { MinHeap } from "./heap.ts";
import { deltaOf, isLand, stepCost, terrainAllowsStep } from "./map.ts";
import { DIRECTIONS } from "./types.ts";
import type { Direction, GameState, MapState, Position } from "./types.ts";

interface PathFound {
  readonly found: true;
  /** Шаги по порядку; пустой список, если герой уже стоит в цели. */
  readonly steps: readonly Direction[];
  readonly cost: number;
  /** Сколько дней займёт путь, считая сегодняшний. */
  readonly days: number;
  /** Сколько первых шагов герой пройдёт сегодня. */
  readonly stepsToday: number;
  /** Остаток запаса хода в день, когда герой дойдёт до цели. */
  readonly movementLeft: number;
}

export type PathResult = PathFound | { readonly found: false };

const NOT_FOUND: PathResult = { found: false };
const UNREACHED = 0x7fff_ffff;

const STEPS = DIRECTIONS.flatMap((direction) => {
  const delta = deltaOf(direction);
  return delta === undefined ? [] : [{ direction, delta, cost: stepCost(delta) }];
});

/**
 * Клетки, куда нельзя встать: 1 — не земля или занята другим героем;
 * 2 — объект или зона охранника: такая клетка может быть только концом пути
 * (20-map-objects.md, 21-guards.md).
 */
const BLOCKED = 1;
const END_ONLY = 2;

function blockedCells(state: GameState, heroId: string): Uint8Array {
  const { map } = state;
  const blocked = new Uint8Array(map.width * map.height);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (!isLand(map, x, y)) {
        blocked[y * map.width + x] = BLOCKED;
      }
    }
  }
  for (const object of state.objects) {
    blocked[object.y * map.width + object.x] = END_ONLY;
    if (object.type === "guard") {
      for (const cell of zoneCells(map, object)) {
        blocked[cell] ||= END_ONLY;
      }
    }
  }
  for (const other of state.heroes) {
    if (other.id !== heroId) {
      blocked[other.y * map.width + other.x] = BLOCKED;
    }
  }
  return blocked;
}

/** Номера клеток карты вокруг клетки: её соседи по прямой и по диагонали. */
function zoneCells(map: MapState, center: Position): number[] {
  const cells: number[] = [];
  for (const step of STEPS) {
    const x = center.x + step.delta.dx;
    const y = center.y + step.delta.dy;
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) {
      cells.push(y * map.width + x);
    }
  }
  return cells;
}

/**
 * Клетки, которыми может кончиться путь к цели. Обычно это сама цель. Цель — охранник,
 * а герой не рядом: путь кончается на клетке его зоны, там и начнётся бой (21-guards.md).
 */
function endsFor(state: GameState, blocked: Uint8Array, start: number, target: Position): number[] {
  const { map } = state;
  const goal = target.y * map.width + target.x;
  const guard = state.objects.find(
    (object) => object.type === "guard" && object.x === target.x && object.y === target.y,
  );
  if (guard === undefined) {
    return [goal];
  }
  const zone = zoneCells(map, guard);
  if (zone.includes(start)) {
    return [goal];
  }
  // В зоне можно встать на землю и на шахту; на кучку и на другого охранника — нельзя.
  return zone.filter(
    (cell) =>
      blocked[cell] !== BLOCKED &&
      !state.objects.some(
        (object) => object.type !== "mine" && object.y * map.width + object.x === cell,
      ),
  );
}

/**
 * Стоимость самого дешёвого пути от каждой клетки до ближайшей из целей.
 * Поиск идёт от цели назад и останавливается, когда дошёл до старта.
 */
function costsToTarget(
  map: MapState,
  blocked: Uint8Array,
  start: number,
  targets: readonly number[],
): Int32Array {
  const cells = map.width * map.height;
  const costs = new Int32Array(cells).fill(UNREACHED);
  const heap = new MinHeap();
  for (const target of targets) {
    costs[target] = 0;
    heap.push(target);
  }
  for (let entry = heap.pop(); entry !== undefined; entry = heap.pop()) {
    const cell = entry % cells;
    const cost = (entry - cell) / cells;
    if (cost > (costs[cell] ?? UNREACHED)) {
      continue;
    }
    if (cell === start) {
      break;
    }
    const x = cell % map.width;
    const y = (cell - x) / map.width;
    for (const step of STEPS) {
      // Идём назад: из клетки (px, py) в текущую шагом step.
      const px = x - step.delta.dx;
      const py = y - step.delta.dy;
      if (px < 0 || py < 0 || px >= map.width || py >= map.height) {
        continue;
      }
      const previous = py * map.width + px;
      // Сквозь объект пути нет; но герой может стоять на шахте в начале пути.
      const closed =
        blocked[previous] === BLOCKED || (blocked[previous] === END_ONLY && previous !== start);
      if (closed || !terrainAllowsStep(map, px, py, step.delta)) {
        continue;
      }
      const total = cost + step.cost;
      if (total < (costs[previous] ?? UNREACHED)) {
        costs[previous] = total;
        heap.push(total * cells + previous);
      }
    }
  }
  return costs;
}

/** Считает, как путь ляжет на дни при заданном остатке запаса хода. */
function schedule(steps: readonly Direction[], movement: number) {
  let left = movement;
  let days = 1;
  let stepsToday = 0;
  for (const direction of steps) {
    const delta = deltaOf(direction);
    const cost = delta === undefined ? 0 : stepCost(delta);
    if (left < cost) {
      days += 1;
      left = DAILY_MOVEMENT;
    }
    left -= cost;
    if (days === 1) {
      stepsToday += 1;
    }
  }
  return { days, stepsToday, movementLeft: left };
}

/**
 * Самый дешёвый путь героя до клетки. При равной стоимости выбирается путь,
 * у которого раньше встречается направление, стоящее раньше в списке DIRECTIONS.
 */
export function findPath(state: GameState, heroId: string, target: Position): PathResult {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  const { map } = state;
  if (hero === undefined || !isLand(map, target.x, target.y)) {
    return NOT_FOUND;
  }
  const blocked = blockedCells(state, heroId);
  const start = hero.y * map.width + hero.x;
  if (blocked[target.y * map.width + target.x] === BLOCKED) {
    return NOT_FOUND;
  }
  const ends = endsFor(state, blocked, start, target);
  const costs = costsToTarget(map, blocked, start, ends);
  const cost = costs[start] ?? UNREACHED;
  if (cost === UNREACHED) {
    return NOT_FOUND;
  }

  const steps: Direction[] = [];
  let x = hero.x;
  let y = hero.y;
  let left = cost;
  while (left > 0) {
    const next = STEPS.find((step) => {
      const cell = (y + step.delta.dy) * map.width + (x + step.delta.dx);
      return (
        terrainAllowsStep(map, x, y, step.delta) &&
        blocked[cell] !== BLOCKED &&
        (blocked[cell] !== END_ONLY || ends.includes(cell)) &&
        costs[cell] === left - step.cost
      );
    });
    if (next === undefined) {
      throw new Error(`Поиск пути: путь оборвался в клетке (${x}, ${y}).`);
    }
    steps.push(next.direction);
    x += next.delta.dx;
    y += next.delta.dy;
    left -= next.cost;
  }
  return { found: true, steps, cost, ...schedule(steps, hero.movement) };
}
