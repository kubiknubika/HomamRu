/**
 * Путь отряда на экране: по каким клеткам он видимо идёт (docs/mechanics/16-battle-screen.md).
 * Правило одно: экран показывает ровно пройденное, а не записанный маршрут целиком.
 */
import type { BattleState, Cell } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { routeOf, shownRoute } from "./battleRoute.ts";

function cell(col: number, row: number): Cell {
  return { col, row };
}

describe("обрыв пути на экране", () => {
  it("отряд дошёл — идёт по всему маршруту", () => {
    const route = [cell(1, 0), cell(2, 0), cell(3, 0)];
    expect(shownRoute(route, cell(3, 0))).toEqual(route);
  });

  /** Главное свойство: увяз или погиб — экран не дорисовывает остаток пути. */
  it("отряд встал раньше — путь кончается там, где он встал", () => {
    const route = [cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)];
    expect(shownRoute(route, cell(2, 0))).toEqual([cell(1, 0), cell(2, 0)]);
  });

  it("клетки нет в маршруте — ведём по прямой, одной клеткой", () => {
    const route = [cell(1, 0), cell(2, 0)];
    expect(shownRoute(route, cell(5, 5))).toEqual([cell(5, 5)]);
  });

  it("пустой маршрут — одна клетка, а не пусто", () => {
    expect(shownRoute([], cell(2, 1))).toEqual([cell(2, 1)]);
  });

  /** Путь не длиннее записанного и всегда кончается там, куда отряд встал. */
  it("свойства на сотне случайных маршрутов", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const length = (seed % 7) + 1;
      const route: Cell[] = Array.from({ length }, (_, index) => cell(index + 1, seed % 5));
      for (const stop of route) {
        const shown = shownRoute(route, stop);
        expect(shown.length).toBeLessThanOrEqual(route.length);
        expect(shown.at(-1)).toEqual(stop);
        // Показанное — начало маршрута, а не переставленные клетки.
        expect(shown).toEqual(route.slice(0, shown.length));
      }
    }
  });
});

describe("маршрут команды", () => {
  it("команда без перемещения даёт пустой путь", () => {
    const state = { stacks: [], active: undefined } as unknown as BattleState;
    expect(routeOf(state, { type: "battleWait", side: 0 })).toEqual([]);
  });
});
