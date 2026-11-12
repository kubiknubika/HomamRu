import { describe, expect, it } from "vitest";
import { createBattle } from "./create.ts";
import { army, CREATURES, startBattle } from "./testkit.ts";

describe("расстановка — таблица из 10-battle-field.md", () => {
  it.each([
    [1, [5]],
    [2, [2, 8]],
    [3, [2, 5, 8]],
    [4, [0, 4, 6, 10]],
    [5, [0, 2, 5, 8, 10]],
    [6, [0, 2, 4, 6, 8, 10]],
    [7, [0, 2, 4, 5, 6, 8, 10]],
  ])("отрядов %i → ряды %j", (count, rows) => {
    const stacks = Array.from({ length: count }, () => "militia:1");
    const { state } = startBattle(army(stacks), army(stacks));
    const attackers = state.stacks.filter((s) => s.side === 0);
    const defenders = state.stacks.filter((s) => s.side === 1);
    expect(attackers.map((s) => [s.id, s.col, s.row])).toEqual(
      rows.map((row, i) => [`a${i + 1}`, 0, row]),
    );
    expect(defenders.map((s) => [s.id, s.col, s.row])).toEqual(
      rows.map((row, i) => [`b${i + 1}`, 14, row]),
    );
  });

  it("бой начинается с первого раунда и хода самого быстрого", () => {
    const { state, events } = startBattle(army(["militia:3"]), army(["falcon:2"]));
    expect(events).toEqual([
      { type: "roundStarted", round: 1 },
      { type: "stackTurn", stackId: "b1" },
    ]);
    expect(state).toMatchObject({ round: 1, activeStack: "b1", result: null });
    expect(state.stacks[1]).toMatchObject({ count: 2, initialCount: 2, firstHealth: 18, shots: 0 });
  });

  it("неверное описание боя отклоняется", () => {
    const base = { id: "t", name: "t", obstacles: [], attacker: army(["militia:1"]) };
    const bad = [
      { ...base, defender: army([]) },
      { ...base, defender: army(Array.from({ length: 8 }, () => "militia:1")) },
      { ...base, defender: army(["dragon:1"]) },
      { ...base, defender: army(["militia:0"]) },
      { ...base, defender: army(["militia:1"], { morale: 4 }) },
      { ...base, defender: army(["militia:1"], { luck: -1 }) },
      { ...base, defender: army(["militia:1"]), obstacles: [{ col: 0, row: 3 }] },
      { ...base, defender: army(["militia:1"]), obstacles: [{ col: 14, row: 3 }] },
      { ...base, defender: army(["militia:1"]), obstacles: [{ col: 5, row: 11 }] },
    ];
    for (const definition of bad) {
      expect(createBattle(definition, CREATURES, 1)).toMatchObject({ ok: false });
    }
  });
});
