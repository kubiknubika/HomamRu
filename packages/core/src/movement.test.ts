import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { fromPicture, openField } from "./testkit.ts";
import type { Direction, GameState } from "./types.ts";

function move(state: GameState, path: readonly Direction[], heroId = "A", player = 0) {
  return applyCommand(state, { type: "moveHero", player, heroId, path });
}

function repeat(direction: Direction, count: number): Direction[] {
  return Array.from({ length: count }, () => direction);
}

describe("запас хода", () => {
  // Таблица «Примеры: запас хода» из docs/mechanics/02-hero-movement.md.
  const table: readonly [string, Direction[], number, number, boolean, boolean][] = [
    ["3 шага прямо", repeat("E", 3), 300, 700, true, true],
    ["3 шага по диагонали", repeat("SE", 3), 423, 577, true, true],
    ["9 шагов прямо", repeat("E", 9), 900, 100, true, false],
    ["10 шагов прямо", repeat("E", 10), 1000, 0, false, false],
    ["7 шагов по диагонали", repeat("SE", 7), 987, 13, false, false],
    ["4 прямо и 4 по диагонали", [...repeat("E", 4), ...repeat("SE", 4)], 964, 36, false, false],
  ];

  it.each(table)("%s", (_, path, spent, left, straight, diagonal) => {
    const result = move(openField(16), path);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.state.heroes[0]?.movement).toBe(left);
    expect(result.events.reduce((sum, event) => sum + ("cost" in event ? event.cost : 0), 0)).toBe(
      spent,
    );
    const tired = { ok: false, code: "NOT_ENOUGH_MOVEMENT" };
    expect(move(result.state, ["S"])).toMatchObject(straight ? { ok: true } : tired);
    expect(move(result.state, ["SE"])).toMatchObject(diagonal ? { ok: true } : tired);
  });

  it("за день не пройти 11 клеток прямо или 8 по диагонали", () => {
    expect(move(openField(16), repeat("E", 11))).toMatchObject({ code: "NOT_ENOUGH_MOVEMENT" });
    expect(move(openField(16), repeat("SE", 8))).toMatchObject({ code: "NOT_ENOUGH_MOVEMENT" });
  });
});

describe("команда «переместить героя»", () => {
  it("ведёт героя по пути и сообщает о каждом шаге", () => {
    const result = move(openField(8), ["E", "SE"]);
    expect(result).toMatchObject({
      ok: true,
      state: { heroes: [{ id: "A", x: 2, y: 1, movement: 759 }] },
      events: [
        {
          type: "heroStepped",
          heroId: "A",
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          cost: 100,
          movementLeft: 900,
        },
        {
          type: "heroStepped",
          heroId: "A",
          from: { x: 1, y: 0 },
          to: { x: 2, y: 1 },
          cost: 141,
          movementLeft: 759,
        },
      ],
    });
  });

  it("не меняет переданное состояние", () => {
    const state = openField(8);
    const before = JSON.stringify(state);
    move(state, ["E", "E"]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("отклоняет неизвестного героя", () => {
    expect(move(openField(8), ["E"], "Z")).toMatchObject({ ok: false, code: "UNKNOWN_HERO" });
  });

  it("отклоняет чужого героя", () => {
    const { state } = fromPicture(["S..", "...", "..B"]);
    expect(move(state, ["N"], "B")).toMatchObject({ ok: false, code: "NOT_OWNER" });
  });

  it("отклоняет пустой путь", () => {
    expect(move(openField(8), [])).toMatchObject({ ok: false, code: "EMPTY_PATH" });
  });

  it.each([
    ["за край карты", ["S..", "...", "..."], ["N"]],
    ["на преграду", ["S#.", "...", "..."], ["E"]],
    ["в щель между преградами", ["S#.", "#..", "..."], ["SE"]],
  ] as const)("отклоняет шаг %s", (_, rows, path) => {
    expect(move(fromPicture(rows).state, path)).toMatchObject({ ok: false, code: "STEP_BLOCKED" });
  });

  it("разрешает срезать угол одной преграды", () => {
    expect(move(fromPicture(["S#.", "...", "..."]).state, ["SE"]).ok).toBe(true);
    expect(move(fromPicture(["S..", "#..", "..."]).state, ["SE"]).ok).toBe(true);
  });

  it("отклоняет неизвестное направление как невозможный шаг", () => {
    const path = ["UP"] as unknown as Direction[];
    expect(move(openField(8), path)).toMatchObject({ ok: false, code: "STEP_BLOCKED" });
  });

  it("отклоняет путь целиком и называет номер шага", () => {
    const { state } = fromPicture(["S.#", "...", "..."]);
    const result = move(state, ["E", "E"]);
    expect(result).toMatchObject({ ok: false, code: "STEP_BLOCKED" });
    expect(result.ok ? "" : result.message).toContain("Шаг 2");
  });

  it("разрешает пройти через одну клетку дважды", () => {
    expect(move(openField(8), ["E", "W", "E"])).toMatchObject({
      ok: true,
      state: { heroes: [{ x: 1, y: 0, movement: 700 }] },
    });
  });

  it("отклоняет любой шаг героя, окружённого преградами", () => {
    const { state } = fromPicture(["S#.", "##.", "..."]);
    for (const direction of ["E", "SE", "S"] as const) {
      expect(move(state, [direction])).toMatchObject({ ok: false, code: "STEP_BLOCKED" });
    }
  });
});
