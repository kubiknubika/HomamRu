import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { fromPicture, openField } from "./testkit.ts";
import { calendarOf } from "./time.ts";
import type { GameState } from "./types.ts";

function endTurn(state: GameState, player = state.currentPlayer) {
  const result = applyCommand(state, { type: "endTurn", player });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

describe("календарь", () => {
  // Таблица из docs/mechanics/03-time.md: день партии, месяц, неделя, день недели.
  it.each([
    [1, 1, 1, 1],
    [2, 1, 1, 2],
    [7, 1, 1, 7],
    [8, 1, 2, 1],
    [14, 1, 2, 7],
    [15, 1, 3, 1],
    [28, 1, 4, 7],
    [29, 2, 1, 1],
    [56, 2, 4, 7],
    [57, 3, 1, 1],
    [365, 14, 1, 1],
  ])("день %i — месяц %i, неделя %i, день недели %i", (day, month, week, weekday) => {
    expect(calendarOf(day)).toEqual({ month, week, weekday });
  });

  it("день недели всегда от 1 до 7, неделя от 1 до 4, месяц не меньше 1", () => {
    for (let day = 1; day <= 2000; day += 1) {
      const date = calendarOf(day);
      expect(date.weekday).toBeGreaterThanOrEqual(1);
      expect(date.weekday).toBeLessThanOrEqual(7);
      expect(date.week).toBeGreaterThanOrEqual(1);
      expect(date.week).toBeLessThanOrEqual(4);
      expect(date.month).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("команда «закончить ход»", () => {
  it("при одном игроке начинает новый день и восстанавливает запас хода", () => {
    const moved = applyCommand(openField(8), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E", "E", "E"],
    });
    if (!moved.ok) {
      throw new Error(moved.message);
    }
    expect(moved.state.heroes[0]?.movement).toBe(700);
    const ended = endTurn(moved.state);
    expect(ended.state).toMatchObject({ day: 2, currentPlayer: 0, heroes: [{ movement: 1000 }] });
    expect(ended.events).toEqual([
      { type: "turnEnded", player: 0 },
      { type: "dayStarted", day: 2, month: 1, week: 1, weekday: 2 },
    ]);
  });

  it("ход не заканчивается сам, когда запас хода кончился", () => {
    const path = Array.from({ length: 10 }, () => "E" as const);
    const moved = applyCommand(openField(16), { type: "moveHero", player: 0, heroId: "A", path });
    expect(moved).toMatchObject({ ok: true, state: { day: 1, currentPlayer: 0 } });
  });

  it("можно закончить ход, ничего не сделав", () => {
    expect(endTurn(openField(8)).state.day).toBe(2);
  });

  it("после седьмого дня начинается вторая неделя", () => {
    let state = openField(8);
    for (let i = 0; i < 6; i += 1) {
      state = endTurn(state).state;
    }
    expect(state.day).toBe(7);
    expect(endTurn(state).events).toContainEqual({
      type: "dayStarted",
      day: 8,
      month: 1,
      week: 2,
      weekday: 1,
    });
  });

  it("при двух игроках день меняется только после хода последнего", () => {
    const { state } = fromPicture(["S..", "...", "..B"]);
    const first = endTurn(state);
    expect(first.state).toMatchObject({ day: 1, currentPlayer: 1 });
    expect(first.events).toEqual([{ type: "turnEnded", player: 0 }]);

    const stepped = applyCommand(first.state, {
      type: "moveHero",
      player: 1,
      heroId: "B",
      path: ["N"],
    });
    if (!stepped.ok) {
      throw new Error(stepped.message);
    }
    const second = endTurn(stepped.state);
    expect(second.state).toMatchObject({
      day: 2,
      currentPlayer: 0,
      heroes: [{ movement: 1000 }, { movement: 1000 }],
    });
    expect(second.events).toEqual([
      { type: "turnEnded", player: 1 },
      { type: "dayStarted", day: 2, month: 1, week: 1, weekday: 2 },
    ]);
  });

  it("номер дня либо не меняется, либо растёт ровно на 1", () => {
    let state = fromPicture(["S..", "...", "..B"]).state;
    for (let i = 0; i < 20; i += 1) {
      const next = endTurn(state).state;
      expect([0, 1]).toContain(next.day - state.day);
      state = next;
    }
    expect(state.day).toBe(11);
  });
});
