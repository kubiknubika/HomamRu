/**
 * Карта приключений: местность, шаги, проверка описания карты.
 * Спецификации: docs/mechanics/01-adventure-map.md и 02-hero-movement.md.
 */
import type { CreatureDefinition } from "./battle/types.ts";
import { contentErrors } from "./mapContent.ts";
import { townErrors } from "./townContent.ts";
import type { BuildingDefinition, Direction, MapDefinition, MapState, Position } from "./types.ts";

export const TERRAIN_LAND = ".";
export const TERRAIN_OBSTACLE = "#";

const MIN_MAP_SIZE = 8;
const MAX_MAP_SIZE = 144;
export const MAX_PLAYERS = 2;

const STRAIGHT_STEP_COST = 100;
const DIAGONAL_STEP_COST = 141;

interface Delta {
  readonly dx: number;
  readonly dy: number;
}

const DELTAS: Readonly<Record<Direction, Delta>> = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 1, dy: -1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: 1 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -1, dy: 1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 },
};

/** Смещение шага; для неизвестного направления — `undefined`. */
export function deltaOf(direction: string): Delta | undefined {
  return Object.hasOwn(DELTAS, direction) ? DELTAS[direction as Direction] : undefined;
}

export function stepCost(delta: Delta): number {
  return delta.dx !== 0 && delta.dy !== 0 ? DIAGONAL_STEP_COST : STRAIGHT_STEP_COST;
}

/** Клетка на карте, и в ней земля. */
export function isLand(map: MapState, x: number, y: number): boolean {
  return (
    x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y]?.[x] === TERRAIN_LAND
  );
}

/**
 * Пускает ли местность шаг из клетки (x, y) по смещению.
 * Герои здесь не учитываются.
 */
export function terrainAllowsStep(map: MapState, x: number, y: number, delta: Delta): boolean {
  if (!isLand(map, x + delta.dx, y + delta.dy)) {
    return false;
  }
  if (delta.dx !== 0 && delta.dy !== 0) {
    // Нельзя протиснуться по диагонали между двумя преградами.
    return isLand(map, x + delta.dx, y) || isLand(map, x, y + delta.dy);
  }
  return true;
}

/** Ошибка в описании карты: какое поле и что не так. */
export interface MapError {
  readonly field: string;
  readonly message: string;
}

function terrainErrors(terrain: readonly string[]): MapError[] {
  const errors: MapError[] = [];
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  if (
    height < MIN_MAP_SIZE ||
    height > MAX_MAP_SIZE ||
    width < MIN_MAP_SIZE ||
    width > MAX_MAP_SIZE
  ) {
    errors.push({
      field: "terrain",
      message: `Размер карты ${width}×${height}; допустимо от ${MIN_MAP_SIZE}×${MIN_MAP_SIZE} до ${MAX_MAP_SIZE}×${MAX_MAP_SIZE}.`,
    });
  }
  terrain.forEach((row, y) => {
    if (row.length !== width) {
      errors.push({
        field: `terrain.${y}`,
        message: `Строка ${y + 1} длиной ${row.length}, а первая строка длиной ${width}.`,
      });
    }
    [...row].forEach((symbol, x) => {
      if (symbol !== TERRAIN_LAND && symbol !== TERRAIN_OBSTACLE) {
        errors.push({
          field: `terrain.${y}`,
          message: `Неизвестный символ «${symbol}»: строка ${y + 1}, столбец ${x + 1}.`,
        });
      }
    });
  });
  return errors;
}

/** Проверяет карту по смыслу. Пустой список — карта верна. */
export function validateMap(
  map: MapDefinition,
  creatures: readonly CreatureDefinition[],
  buildings: readonly BuildingDefinition[] = [],
): MapError[] {
  const errors = terrainErrors(map.terrain);
  if (map.players.length < 1 || map.players.length > MAX_PLAYERS) {
    errors.push({
      field: "players",
      message: `Игроков ${map.players.length}; допустимо от 1 до ${MAX_PLAYERS}.`,
    });
  }
  const taken = new Set<string>();
  map.players.forEach((player, index) => {
    const { x, y } = player.hero;
    const field = `players.${index}.hero`;
    const symbol = map.terrain[y]?.[x];
    if (!Number.isInteger(x) || !Number.isInteger(y) || symbol === undefined) {
      errors.push({ field, message: `Герой стоит вне карты: клетка (${x}, ${y}).` });
      return;
    }
    if (symbol !== TERRAIN_LAND) {
      errors.push({ field, message: `Герой стоит не на земле: клетка (${x}, ${y}).` });
    }
    const key = `${x},${y}`;
    if (taken.has(key)) {
      errors.push({ field, message: `В клетке (${x}, ${y}) уже стоит другой герой.` });
    }
    taken.add(key);
  });
  errors.push(
    ...objectErrors(map, taken),
    ...contentErrors(map, creatures),
    ...townErrors(map, creatures, buildings),
  );
  return errors;
}

/** Проверяет объекты карты: место и числа (20-map-objects.md). `taken` — клетки героев. */
function objectErrors(map: MapDefinition, taken: Set<string>): MapError[] {
  const errors: MapError[] = [];
  (map.objects ?? []).forEach((object, index) => {
    const { x, y } = object;
    const field = `objects.${index}`;
    const symbol = map.terrain[y]?.[x];
    if (!Number.isInteger(x) || !Number.isInteger(y) || symbol === undefined) {
      errors.push({ field, message: `Объект стоит вне карты: клетка (${x}, ${y}).` });
      return;
    }
    if (symbol !== TERRAIN_LAND) {
      errors.push({ field, message: `Объект стоит не на земле: клетка (${x}, ${y}).` });
    }
    const key = `${x},${y}`;
    if (taken.has(key)) {
      errors.push({ field, message: `Клетка (${x}, ${y}) уже занята героем или другим объектом.` });
    }
    taken.add(key);
    if (object.type === "pile" && object.amount !== undefined) {
      if (!Number.isInteger(object.amount) || object.amount < 1) {
        errors.push({
          field,
          message: `Количество в кучке ${object.amount}; должно быть целым, не меньше 1.`,
        });
      }
    }
  });
  map.players.forEach((player, index) => {
    for (const [resource, amount] of Object.entries(player.resources ?? {})) {
      if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
        errors.push({
          field: `players.${index}.resources.${resource}`,
          message: `Запас ${amount}; должен быть целым, не меньше 0.`,
        });
      }
    }
  });
  return errors;
}

/** Клетки, через которые проходит путь из клетки `from` (сама она не входит). */
export function cellsAlong(from: Position, steps: readonly Direction[]): Position[] {
  const cells: Position[] = [];
  let { x, y } = from;
  for (const direction of steps) {
    const delta = DELTAS[direction];
    x += delta.dx;
    y += delta.dy;
    cells.push({ x, y });
  }
  return cells;
}
