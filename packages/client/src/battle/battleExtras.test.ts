import { applyBattleCommand, findStack } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { highlightsOf } from "./battleHighlights.ts";
import { describeStack, lostCount } from "./battleLog.ts";
import { routeOf } from "./battleRoute.ts";
import { attackableTargets, HISTORY_LENGTH, playerStack } from "./battleSession.ts";
import { battle, place, ready } from "./testkit.ts";

function marksOf(session: ReturnType<typeof ready>, mark: string): string[] {
  return highlightsOf(session.getSnapshot())
    .cells.filter((entry) => entry.mark === mark)
    .map((entry) => `${entry.cell.col},${entry.cell.row}`)
    .toSorted();
}

function ringsOf(session: ReturnType<typeof ready>, mark: string): string[] {
  return highlightsOf(session.getSnapshot())
    .rings.filter((entry) => entry.mark === mark)
    .map((entry) => entry.stack.id);
}

describe("подсветка поля", () => {
  it("удержание на враге показывает его клетки хода; общие с моими — отдельно", () => {
    // Ополченцы стоят в одном ряду через 5 клеток: скорость 4, общие клетки есть посередине.
    const session = ready(place(battle(["militia:5"], ["militia:5"]), { a1: [2, 5], b1: [7, 5] }));
    session.inspectCell({ col: 7, row: 5 });
    expect(ringsOf(session, "inspected")).toEqual(["b1"]);
    const overlap = marksOf(session, "overlap");
    const other = marksOf(session, "otherReach");
    const mine = marksOf(session, "reach");
    expect(overlap).toContain("4,5");
    expect(overlap).toContain("5,5");
    expect(other).toContain("10,5");
    expect(mine).toContain("0,5");
    // Каждая клетка помечена один раз.
    expect(new Set([...overlap, ...other, ...mine]).size).toBe(
      overlap.length + other.length + mine.length,
    );
    // Касание поля убирает показ.
    session.tapCell({ col: 14, row: 0 });
    expect(marksOf(session, "otherReach")).toEqual([]);
    expect(marksOf(session, "overlap")).toEqual([]);
  });

  it("стрелку обведены все враги, пешему — только те, до кого он достаёт", () => {
    const shooter = ready(battle(["slinger:5"], ["militia:5", "militia:5"]));
    expect(ringsOf(shooter, "attackable")).toEqual(["b1", "b2"]);
    const walker = ready(place(battle(["militia:5"], ["militia:5", "militia:5"]), { b1: [3, 5] }));
    expect(attackableTargets(walker.getSnapshot()).map((stack) => stack.id)).toEqual(["b1"]);
    // Стрелок, к которому подошли вплотную, стрелять не может — обведён только сосед.
    const pinned = ready(
      place(battle(["slinger:5"], ["militia:5", "militia:5"]), { a1: [5, 5], b1: [6, 5] }),
    );
    expect(ringsOf(pinned, "attackable")).toEqual(["b1"]);
  });

  it("клетки удара красные, выбранная — оранжевая", () => {
    const session = ready(place(battle(["falcon:5"], ["militia:30"]), { b1: [5, 5] }));
    session.tapCell({ col: 5, row: 5 });
    expect(marksOf(session, "attackCell")).toHaveLength(6);
    expect(marksOf(session, "attackChoice")).toEqual([]);
    session.tapCell({ col: 4, row: 5 });
    expect(marksOf(session, "attackCell")).toHaveLength(5);
    expect(marksOf(session, "attackChoice")).toEqual(["4,5"]);
    expect(ringsOf(session, "target")).toEqual(["b1"]);
  });

  it("пока идёт показ или ходит компьютер, клеток хода игрока нет", () => {
    const session = ready(battle(["falcon:5"], ["militia:5"]));
    session.wait();
    expect(marksOf(session, "reach")).toEqual([]);
    expect(ringsOf(session, "attackable")).toEqual([]);
    expect(ringsOf(session, "active")).toEqual(["b1"]);
  });
});

describe("путь отряда", () => {
  it("пеший идёт по соседним клеткам в обход препятствия и не выходит за поле", () => {
    const base = place(battle(["militia:5"], ["militia:5"]), { a1: [0, 0] });
    const state = { ...base, obstacles: [{ col: 1, row: 0 }] };
    const route = routeOf(state, { type: "battleMove", side: 0, to: { col: 2, row: 0 } });
    expect(route.at(-1)).toEqual({ col: 2, row: 0 });
    expect(route).toHaveLength(3);
    expect(
      route.every((cell) => cell.col >= 0 && cell.col < 15 && cell.row >= 0 && cell.row < 11),
    ).toBe(true);
    expect(route).not.toContainEqual({ col: 1, row: 0 });
    // Путь той же длины, что и принятый ядром ход.
    expect(
      applyBattleCommand(state, { type: "battleMove", side: 0, to: { col: 2, row: 0 } }).ok,
    ).toBe(true);
  });

  it("летающий летит прямо; команда без перемещения пути не даёт", () => {
    const state = battle(["falcon:5"], ["militia:5"]);
    expect(routeOf(state, { type: "battleMove", side: 0, to: { col: 6, row: 2 } })).toEqual([
      { col: 6, row: 2 },
    ]);
    expect(routeOf(state, { type: "battleDefend", side: 0 })).toEqual([]);
  });

  it("экран получает путь вместе с событиями", () => {
    const session = ready(battle(["militia:5"], ["militia:5"]));
    const routes: number[] = [];
    session.subscribe((_, events, route) => {
      if (events.length > 0) {
        routes.push(route.length);
      }
    });
    session.tapCell({ col: 3, row: 5 });
    session.tapCell({ col: 3, row: 5 });
    expect(routes).toEqual([3]);
  });
});

describe("журнал, потери, характеристики", () => {
  it("журнал хранит по строке на ход, не больше 20 последних", () => {
    const session = ready(battle(["militia:200"], ["militia:200"]));
    for (let i = 0; i < 60 && session.getSnapshot().state.result === null; i += 1) {
      if (playerStack(session.getSnapshot()) === undefined) {
        session.animationDone();
      } else {
        session.defend();
      }
    }
    const { history, log } = session.getSnapshot();
    expect(HISTORY_LENGTH).toBe(20);
    expect(history).toHaveLength(20);
    expect(history.at(-1)).toBe(log);
  });

  it("бежавший теряет всю армию; победитель — только погибших", () => {
    const session = ready(battle(["falcon:5", "militia:7"], ["militia:5"], true));
    session.flee();
    const { state } = session.getSnapshot();
    expect(state.stacks.map((stack) => lostCount(state, stack))).toEqual([5, 7, 0]);
  });

  it("без бегства потери — погибшие существа", () => {
    const state = battle(["falcon:5"], ["militia:5"]);
    const hurt = { ...state, stacks: state.stacks.map((stack) => ({ ...stack, count: 3 })) };
    expect(hurt.stacks.map((stack) => lostCount(hurt, stack))).toEqual([2, 2]);
  });

  it("характеристики отряда одной строкой, у стрелка — выстрелы", () => {
    const state = battle(["slinger:12"], ["falcon:4"], true);
    const slinger = findStack(state, "a1");
    const falcon = findStack(state, "b1");
    expect(slinger === undefined ? "" : describeStack(state, slinger)).toBe(
      "Пращник: 12 из 12 · атака 5 · защита 3 · урон 1–4 · здоровье 9 из 9 · скорость 5 · стрелок, выстрелов 10 из 10",
    );
    expect(falcon === undefined ? "" : describeStack(state, falcon)).toContain(
      "скорость 8 · летает",
    );
  });
});
