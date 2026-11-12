import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { findPath } from "./pathfinding.ts";
import { fromPicture } from "./testkit.ts";
import type { Command, Direction } from "./types.ts";

function search(rows: readonly string[]) {
  const { state, target } = fromPicture(rows);
  return findPath(state, "A", target);
}

function repeat(direction: Direction, count: number): Direction[] {
  return Array.from({ length: count }, () => direction);
}

// Раздел «Примеры: пути» из docs/mechanics/02-hero-movement.md.
describe("поиск пути: примеры из спецификации", () => {
  it("A. открытое поле", () => {
    expect(search([".......", ".S.....", ".......", ".....T.", "......."])).toEqual({
      found: true,
      steps: ["E", "E", "SE", "SE"],
      cost: 482,
      days: 1,
      stepsToday: 4,
      movementLeft: 518,
    });
  });

  it("B. стена с проходом снизу", () => {
    expect(search(["...#...", ".S.#.T.", "...#...", "......."])).toEqual({
      found: true,
      steps: ["SE", "SE", "NE", "NE"],
      cost: 564,
      days: 1,
      stepsToday: 4,
      movementLeft: 436,
    });
  });

  it("C. щель между преградами закрыта", () => {
    expect(search(["S#...", "#T...", "....."])).toEqual({ found: false });
  });

  it("D. угол одной преграды можно срезать", () => {
    expect(search(["S#...", ".T...", "....."])).toMatchObject({
      steps: ["SE"],
      cost: 141,
      movementLeft: 859,
    });
  });

  it("E. цель отрезана стеной", () => {
    expect(search(["S.#..", "..#.T", "..#.."])).toEqual({ found: false });
  });

  it("F. прямая диагональ", () => {
    expect(search(["S..", "...", "..T"])).toMatchObject({
      steps: ["SE", "SE"],
      cost: 282,
      movementLeft: 718,
    });
  });

  it("G. из нескольких самых дешёвых путей выбирается первый по порядку направлений", () => {
    expect(search(["S...", "...T"])).toMatchObject({ steps: ["E", "E", "SE"], cost: 341 });
  });

  it("H. путь на несколько дней", () => {
    const rows = ["S.............", "############..", "T............."];
    const steps = [...repeat("E", 11), "SE", "SW", ...repeat("W", 11)];
    expect(search(rows)).toEqual({
      found: true,
      steps,
      cost: 2482,
      days: 3,
      stepsToday: 10,
      movementLeft: 500,
    });
  });

  it("H. герой проходит этот путь за три дня, как в спецификации", () => {
    let { state } = fromPicture(["S.............", "############..", "T............."]);
    const steps = [...repeat("E", 11), "SE", "SW", ...repeat("W", 11)] as Direction[];
    // Сколько шагов и очков уходит в каждый день и сколько остаётся.
    const days = [
      { count: 10, left: 0 },
      { count: 9, left: 18 },
      { count: 5, left: 500 },
    ];
    let done = 0;
    for (const day of days) {
      const path = steps.slice(done, done + day.count);
      const moved = applyCommand(state, { type: "moveHero", player: 0, heroId: "A", path });
      if (!moved.ok) {
        throw new Error(moved.message);
      }
      expect(moved.state.heroes[0]?.movement).toBe(day.left);
      done += day.count;
      // Следующий шаг пути в этот день уже не сделать: очков не хватает.
      const extra = { type: "moveHero", player: 0, heroId: "A", path: steps.slice(done, done + 1) };
      expect(applyCommand(moved.state, extra as Command)).toMatchObject({
        ok: false,
        code: done < steps.length ? "NOT_ENOUGH_MOVEMENT" : "EMPTY_PATH",
      });
      const ended = applyCommand(moved.state, { type: "endTurn", player: 0 });
      if (!ended.ok) {
        throw new Error(ended.message);
      }
      state = ended.state;
    }
    expect(state.heroes[0]).toMatchObject({ x: 0, y: 2 });
  });
});

describe("поиск пути: правила", () => {
  it("путь в свою клетку пустой", () => {
    expect(search(["S..", "...", "..."])).toEqual({
      found: true,
      steps: [],
      cost: 0,
      days: 1,
      stepsToday: 0,
      movementLeft: 1000,
    });
  });

  it("другой герой на пути считается преградой", () => {
    expect(search(["SBT", "###", "..."])).toEqual({ found: false });
    expect(search(["SB.", "..T", "..."])).toMatchObject({ steps: ["SE", "E"] });
  });

  it("пути нет, если цель — преграда или клетка вне карты; к чужому герою путь есть", () => {
    const { state } = fromPicture(["S#.", "..B", "..."]);
    expect(findPath(state, "A", { x: 1, y: 0 })).toEqual({ found: false });
    // Клетка чужого героя — конец пути: это нападение (40-two-players.md).
    expect(findPath(state, "A", { x: 2, y: 1 })).toMatchObject({ found: true, steps: ["SE", "E"] });
    expect(findPath(state, "A", { x: -1, y: 0 })).toEqual({ found: false });
    expect(findPath(state, "A", { x: 0, y: 3 })).toEqual({ found: false });
  });

  it("пути нет для неизвестного героя", () => {
    const { state } = fromPicture(["S..", "...", "..."]);
    expect(findPath(state, "Z", { x: 1, y: 1 })).toEqual({ found: false });
  });

  it("запас хода не ограничивает поиск, но учитывается в днях", () => {
    const { state, target } = fromPicture(["S....T", "......", "......"]);
    const spent = applyCommand(state, {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: [...repeat("S", 2), ...repeat("N", 2), ...repeat("S", 2), ...repeat("N", 2)],
    });
    if (!spent.ok) {
      throw new Error(spent.message);
    }
    // Осталось 200 очков: сегодня два шага, остальные три — завтра.
    expect(findPath(spent.state, "A", target)).toMatchObject({
      cost: 500,
      days: 2,
      stepsToday: 2,
      movementLeft: 700,
    });
  });

  it("не меняет состояние", () => {
    const { state, target } = fromPicture(["S..", "...", "..T"]);
    const before = JSON.stringify(state);
    findPath(state, "A", target);
    expect(JSON.stringify(state)).toBe(before);
  });
});
