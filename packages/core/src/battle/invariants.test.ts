import { describe, expect, it } from "vitest";
import { battleProblems, eventProblems } from "./invariants.ts";
import { army, startBattle, withStacks } from "./testkit.ts";

describe("проверка свойств боя сама ловит нарушения", () => {
  const { state } = startBattle(army(["militia:5", "slinger:5"]), army(["militia:5"]), {
    obstacles: [{ col: 3, row: 3 }],
  });

  it("исправное состояние — без замечаний", () => {
    expect(battleProblems(state)).toEqual([]);
  });

  it.each([
    ["два отряда в одной клетке", { a2: { col: 0, row: 2 } }],
    ["a1 стоит на препятствии", { a1: { col: 3, row: 3 } }],
    ["a1 вне поля", { a1: { col: 15, row: 2 } }],
    ["a1: здоровье первого 13", { a1: { firstHealth: 13 } }],
    ["a1: существ стало больше, чем было", { a1: { count: 6 } }],
    ["a2: выстрелов 11", { a2: { shots: 11 } }],
    ["сторона уничтожена, а бой не окончен", { b1: { count: 0 } }],
  ])("%s", (problem, changes) => {
    expect(battleProblems(withStacks(state, changes))).toContain(problem);
  });

  it("ходит погибший отряд; итог боя не сходится с полем", () => {
    const active = state.activeStack ?? "";
    expect(battleProblems(withStacks(state, { [active]: { count: 0 } }))).toContain(
      "ходит погибший или несуществующий отряд",
    );
    const over = {
      ...state,
      result: { winner: 0 as const, reason: "destroyed" as const, losses: [] },
    };
    expect(battleProblems(over)).toEqual([
      "бой окончен, а ход кому-то отдан",
      "проигравший не уничтожен",
    ]);
  });

  it("события: шаг дальше скорости, нулевой урон, два ответа", () => {
    const strike = {
      type: "strike" as const,
      kind: "retaliation" as const,
      attackerId: "b1",
      targetId: "a1",
      damage: 0,
      killed: 0,
      left: 5,
      lucky: false,
    };
    const moved = {
      type: "stackMoved" as const,
      stackId: "a1",
      from: { col: 0, row: 2 },
      to: { col: 5, row: 2 },
    };
    expect(eventProblems(state, [moved, strike, strike])).toEqual([
      "a1 прошёл дальше своей скорости",
      "удар b1 с уроном меньше 1",
      "удар b1 с уроном меньше 1",
      "два ответных удара за одну команду",
    ]);
  });
});
