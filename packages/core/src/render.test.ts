import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { cellsAlong } from "./map.ts";
import { formatEvent, renderState } from "./render.ts";
import { fromPicture, openField } from "./testkit.ts";

describe("текстовый вывод", () => {
  it("печатает дату, героев и карту", () => {
    const { state } = fromPicture(["........", ".S#.....", "..#.....", "......B."]);
    expect(renderState({ ...state, day: 9 })).toBe(
      [
        "День 9 (месяц 1, неделя 2, день 2). Ход игрока 1.",
        "Герой A: клетка (1, 1), запас хода 1000 из 1000.",
        "Герой B: клетка (6, 3), запас хода 1000 из 1000.",
        "",
        "   01234567",
        " 0 ........",
        " 1 .A#.....",
        " 2 ..#.....",
        " 3 ......B.",
        "",
        "Игрок 1: золото 0, дерево 0, руда 0.",
        "Игрок 2: золото 0, дерево 0, руда 0.",
      ].join("\n"),
    );
  });

  it("помечает клетки пути звёздочкой", () => {
    const { state } = fromPicture(["S...", "....", "...."]);
    const path = cellsAlong({ x: 0, y: 0 }, ["E", "SE", "S"]);
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(renderState(state, path).split("\n").slice(-5, -2)).toEqual([
      " 0 A*..",
      " 1 ..*.",
      " 2 ..*.",
    ]);
  });

  it("на широкой карте пишет в шапке последнюю цифру столбца", () => {
    const lines = renderState(openField(12)).split("\n");
    expect(lines[3]).toBe("   012345678901");
    expect(lines.at(-3)).toBe("11 ............");
  });

  it("не меняет состояние", () => {
    const state = openField(8);
    const before = JSON.stringify(state);
    renderState(state, [{ x: 3, y: 3 }]);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("печать событий", () => {
  it("печатает шаг героя, конец хода и начало дня", () => {
    const moved = applyCommand(fromPicture([".S.", "...", "..."]).state, {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E"],
    });
    const ended = applyCommand(openField(8), { type: "endTurn", player: 0 });
    if (!moved.ok || !ended.ok) {
      throw new Error("команды должны быть приняты");
    }
    expect([...moved.events, ...ended.events].map(formatEvent)).toEqual([
      "Герой A: шаг (1, 0) → (2, 0), потрачено 100, осталось 900",
      "Игрок 1 закончил ход",
      "Начался день 2 (месяц 1, неделя 1, день 2)",
    ]);
  });
});
