import { describe, expect, it } from "vitest";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex, distance, neighbours } from "./hex.ts";
import type { Cell } from "./hex.ts";

function cell(col: number, row: number): Cell {
  return { col, row };
}

function sorted(cells: readonly Cell[]): [number, number][] {
  return cells
    .map((c): [number, number] => [c.col, c.row])
    .toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function allCells(): Cell[] {
  const all: Cell[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      all.push(cell(col, row));
    }
  }
  return all;
}

describe("соседи — таблица из 10-battle-field.md", () => {
  it.each<[number, number, [number, number][]]>([
    [
      3,
      4,
      [
        [2, 4],
        [3, 3],
        [3, 5],
        [4, 3],
        [4, 4],
        [4, 5],
      ],
    ],
    [
      3,
      5,
      [
        [2, 4],
        [2, 5],
        [2, 6],
        [3, 4],
        [3, 6],
        [4, 5],
      ],
    ],
    [
      0,
      0,
      [
        [0, 1],
        [1, 0],
        [1, 1],
      ],
    ],
    [
      14,
      10,
      [
        [13, 10],
        [14, 9],
      ],
    ],
    [
      0,
      5,
      [
        [0, 4],
        [0, 6],
        [1, 5],
      ],
    ],
    [
      14,
      5,
      [
        [13, 4],
        [13, 5],
        [13, 6],
        [14, 4],
        [14, 6],
      ],
    ],
  ])("клетка (%i, %i)", (col, row, expected) => {
    expect(sorted(neighbours(cell(col, row)))).toEqual(expected);
  });
});

describe("расстояния — таблица из 10-battle-field.md", () => {
  it.each<[[number, number], [number, number], number]>([
    [[0, 0], [14, 0], 14],
    [[0, 0], [0, 10], 10],
    [[0, 0], [14, 10], 19],
    [[0, 5], [14, 5], 14],
    [[3, 4], [4, 5], 1],
    [[3, 5], [4, 6], 2],
    [[3, 5], [3, 6], 1],
    [[2, 3], [7, 8], 8],
    [[0, 5], [10, 5], 10],
    [[0, 5], [11, 5], 11],
    [[0, 0], [9, 10], 14],
  ])("от %j до %j", (from, to, expected) => {
    expect(distance(cell(...from), cell(...to))).toBe(expected);
  });
});

describe("свойства поля", () => {
  const all = allCells();

  it("расстояние между соседями равно 1, и соседство взаимно", () => {
    for (const a of all) {
      for (const b of neighbours(a)) {
        expect(distance(a, b)).toBe(1);
        expect(neighbours(b).map(cellIndex)).toContain(cellIndex(a));
      }
    }
  });

  it("расстояние симметрично и равно длине кратчайшего пути по соседям", () => {
    // Поиск в ширину от клетки: независимый от формулы способ посчитать расстояния.
    for (const start of [cell(0, 0), cell(7, 5), cell(14, 10), cell(3, 4)]) {
      const steps = new Map([[cellIndex(start), 0]]);
      let wave = [start];
      while (wave.length > 0) {
        const next: Cell[] = [];
        for (const current of wave) {
          for (const neighbour of neighbours(current)) {
            if (!steps.has(cellIndex(neighbour))) {
              steps.set(cellIndex(neighbour), (steps.get(cellIndex(current)) ?? 0) + 1);
              next.push(neighbour);
            }
          }
        }
        wave = next;
      }
      for (const target of all) {
        expect(distance(start, target)).toBe(steps.get(cellIndex(target)));
        expect(distance(target, start)).toBe(distance(start, target));
      }
    }
  });
});
