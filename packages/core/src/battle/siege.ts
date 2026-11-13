/**
 * Осада: стена, ворота, ров, башни — что где стоит и что из этого следует.
 * Спецификация: docs/mechanics/50-siege.md.
 */
import { cellIndex, distance, neighbours, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import type { BattleSide, CreatureDefinition, StackState } from "./types.ts";

export const WALL_PARTS = [
  "wall1",
  "wall2",
  "wall3",
  "wall4",
  "gate",
  "keep",
  "upperTower",
  "lowerTower",
] as const;

/** Что можно разрушить: четыре участка стены, ворота, главная и две малые башни. */
export type WallPart = (typeof WALL_PARTS)[number];

export const SEGMENTS = ["wall1", "wall2", "wall3", "wall4"] as const;
/** Башни в порядке стрельбы. */
export const TOWERS = ["keep", "upperTower", "lowerTower"] as const;
export type Tower = (typeof TOWERS)[number];

export const FORTIFICATIONS = ["fort", "citadel", "castle"] as const;
/** Старшее укрепление города. */
export type Fortification = (typeof FORTIFICATIONS)[number];

export interface SiegeState {
  /** Прочность каждой части; 0 — разрушена или не построена. */
  readonly health: Readonly<Record<WallPart, number>>;
  readonly moat: boolean;
  /** Наименьший урон главной башни; наибольший — вдвое больше. */
  readonly keepDamage: number;
  /** Наименьший урон малой башни. */
  readonly towerDamage: number;
}

/** Столбец стены в каждом ряду. */
const WALL_COL = [11, 11, 10, 10, 9, 10, 9, 10, 10, 11, 11] as const;
const SEGMENT_ROWS = { wall1: 1, wall2: 4, wall3: 7, wall4: 10 } as const;
const ETERNAL_ROWS = [0, 2, 3, 6, 8, 9] as const;
const GATE_ROW = 5;

export const GATE_BRIDGE: Cell = { col: 8, row: GATE_ROW };
export const GATE_OUTER: Cell = { col: 9, row: GATE_ROW };
export const GATE_INNER: Cell = { col: 10, row: GATE_ROW };

const MOAT_ROWS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10] as const;
export const MOAT_DAMAGE = 70;
export const MOAT_DEFENSE = 3;

const WALL_HEALTH = { fort: 2, citadel: 2, castle: 3 } as const;
const PART_HEALTH = 2;
const KEEP_BASE = 10;
const TOWER_BASE = 6;
const PER_BUILDING = 2;

/**
 * Катапульта нападающего: отряд из одной машины. Не ходит, не бьёт, стреляет по стене сама.
 * Урон и скорость у неё не используются; единицы стоят потому, что сохранение не принимает нулей.
 */
export const CATAPULT: CreatureDefinition = {
  id: "catapult",
  name: "Катапульта",
  attack: 0,
  defense: 10,
  damageMin: 1,
  damageMax: 1,
  health: 1000,
  speed: 1,
  flying: false,
  shots: 24,
  price: 0,
  growth: 0,
};
export const CATAPULT_CELL: Cell = { col: 0, row: 7 };

export function isMachine(stack: Pick<StackState, "creature">): boolean {
  return stack.creature.id === CATAPULT.id;
}

/** Осада города с таким укреплением; `buildings` — здания города без форта, цитадели и замка. */
export function createSiege(fortification: Fortification, buildings: number): SiegeState {
  const wall = WALL_HEALTH[fortification];
  const keep = fortification === "fort" ? 0 : PART_HEALTH;
  const tower = fortification === "castle" ? PART_HEALTH : 0;
  return {
    health: {
      wall1: wall,
      wall2: wall,
      wall3: wall,
      wall4: wall,
      gate: PART_HEALTH,
      keep,
      upperTower: tower,
      lowerTower: tower,
    },
    moat: fortification !== "fort",
    keepDamage: KEEP_BASE + PER_BUILDING * buildings,
    towerDamage: TOWER_BASE + PER_BUILDING * Math.floor(buildings / 2),
  };
}

function segmentCell(part: (typeof SEGMENTS)[number]): Cell {
  const row = SEGMENT_ROWS[part];
  return { col: WALL_COL[row] ?? 0, row };
}

/** Внутри стен: правее стены в своём ряду. Клетка самой стены — тоже внутри. */
export function isInside(cell: Cell): boolean {
  return cell.col >= (WALL_COL[cell.row] ?? 0);
}

export function isMoat(siege: SiegeState | null, cell: Cell): boolean {
  return (
    siege !== null &&
    siege.moat &&
    cell.row !== GATE_ROW &&
    MOAT_ROWS.includes(cell.row as (typeof MOAT_ROWS)[number]) &&
    cell.col === (WALL_COL[cell.row] ?? 0) - 1
  );
}

/** Клетки стены, которая стоит: вечная и целые участки. */
export function wallCells(siege: SiegeState): Cell[] {
  const cells: Cell[] = ETERNAL_ROWS.map((row) => ({ col: WALL_COL[row] ?? 0, row }));
  for (const part of SEGMENTS) {
    if (siege.health[part] > 0) {
      cells.push(segmentCell(part));
    }
  }
  return cells;
}

type Standing = Pick<StackState, "col" | "row" | "count">;

function occupied(stacks: readonly Standing[], cell: Cell): boolean {
  return stacks.some((stack) => stack.count > 0 && sameCell(stack, cell));
}

/** Ворота открыты, пока целы и на проёме или створе кто-то стоит. */
export function gateOpen(siege: SiegeState, stacks: readonly Standing[]): boolean {
  return siege.health.gate > 0 && (occupied(stacks, GATE_OUTER) || occupied(stacks, GATE_INNER));
}

/** Клетки, закрытые осадой для отряда стороны `side`: стена и, если не пройти, ворота. */
export function siegeBlocked(
  siege: SiegeState,
  stacks: readonly Standing[],
  side: BattleSide,
): Cell[] {
  const cells = wallCells(siege);
  if (siege.health.gate === 0 || gateOpen(siege, stacks)) {
    return cells;
  }
  // Закрытые ворота: нападающему — стена; обороняющийся откроет их, если мост свободен.
  if (side === 0 || occupied(stacks, GATE_BRIDGE)) {
    cells.push(GATE_OUTER, GATE_INNER);
  }
  return cells;
}

/**
 * Прямой путь выстрела: от стрелка к цели, каждый шаг — на соседнюю клетку, ближайшую к цели.
 * Из равных — та, что дальше по ходу выстрела, затем та, чей ряд ближе к ряду цели.
 * Клеток стрелка и цели в ответе нет.
 */
function shotPath(from: Cell, to: Cell): Cell[] {
  const path: Cell[] = [];
  const forward = from.col > to.col ? -1 : 1;
  let current = from;
  while (!sameCell(current, to)) {
    let best: Cell | undefined;
    for (const cell of neighbours(current)) {
      if (best === undefined) {
        best = cell;
        continue;
      }
      const far = distance(cell, to) - distance(best, to);
      const ahead = (cell.col - best.col) * forward;
      const rows = Math.abs(cell.row - to.row) - Math.abs(best.row - to.row);
      if (far < 0 || (far === 0 && (ahead > 0 || (ahead === 0 && rows < 0)))) {
        best = cell;
      }
    }
    if (best === undefined) {
      break;
    }
    current = best;
    path.push(current);
  }
  path.pop();
  return path;
}

/** Убавка «через стену»: стрелок снаружи, цель по другую сторону, на прямом пути стена или целые ворота. */
export function hasWallPenalty(siege: SiegeState | null, from: Cell, to: Cell): boolean {
  if (siege === null || isInside(from) || !isInside(to)) {
    return false;
  }
  const walls = new Set(wallCells(siege).map(cellIndex));
  if (siege.health.gate > 0) {
    walls.add(cellIndex(GATE_INNER));
  }
  return shotPath(from, to).some((cell) => walls.has(cellIndex(cell)));
}
