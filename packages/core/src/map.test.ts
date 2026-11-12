import { describe, expect, it } from "vitest";
import { createGame } from "./game.ts";
import { validateMap } from "./map.ts";
import type { MapDefinition } from "./types.ts";

function mapOf(changes: Partial<MapDefinition> = {}): MapDefinition {
  return {
    id: "test",
    name: "Проверочная",
    terrain: Array.from({ length: 8 }, () => "........"),
    players: [{ hero: { x: 1, y: 1 } }],
    ...changes,
  };
}

function rows(width: number, height: number): string[] {
  return Array.from({ length: height }, () => ".".repeat(width));
}

describe("проверка карты", () => {
  it("принимает верную карту", () => {
    expect(validateMap(mapOf())).toEqual([]);
  });

  it("принимает наименьший и наибольший размер", () => {
    expect(validateMap(mapOf({ terrain: rows(8, 8) }))).toEqual([]);
    expect(validateMap(mapOf({ terrain: rows(144, 144) }))).toEqual([]);
  });

  it.each([
    ["слишком узкую", rows(7, 8)],
    ["слишком низкую", rows(8, 7)],
    ["слишком широкую", rows(145, 8)],
    ["слишком высокую", rows(8, 145)],
    ["пустую", []],
  ])("отвергает %s карту", (_, terrain) => {
    expect(validateMap(mapOf({ terrain }))).toContainEqual(
      expect.objectContaining({ field: "terrain" }),
    );
  });

  it("отвергает строки разной длины и называет строку", () => {
    const terrain = rows(8, 8);
    terrain[3] = ".......";
    expect(validateMap(mapOf({ terrain }))).toEqual([
      { field: "terrain.3", message: expect.stringContaining("Строка 4") as string },
    ]);
  });

  it("отвергает неизвестный символ и называет строку и столбец", () => {
    const terrain = rows(8, 8);
    terrain[2] = "....~...";
    const errors = validateMap(mapOf({ terrain }));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("«~»");
    expect(errors[0]?.message).toContain("строка 3, столбец 5");
  });

  it("отвергает карту без игроков и с тремя игроками", () => {
    expect(validateMap(mapOf({ players: [] }))).toContainEqual(
      expect.objectContaining({ field: "players" }),
    );
    const players = [0, 1, 2].map((x) => ({ hero: { x, y: 0 } }));
    expect(validateMap(mapOf({ players }))).toContainEqual(
      expect.objectContaining({ field: "players" }),
    );
  });

  it.each([
    ["правее карты", { x: 8, y: 0 }],
    ["ниже карты", { x: 0, y: 8 }],
    ["левее карты", { x: -1, y: 0 }],
    ["в дробной клетке", { x: 1.5, y: 0 }],
  ])("отвергает героя %s", (_, hero) => {
    expect(validateMap(mapOf({ players: [{ hero }] }))).toEqual([
      { field: "players.0.hero", message: expect.stringContaining("вне карты") as string },
    ]);
  });

  it("отвергает героя на преграде", () => {
    const terrain = rows(8, 8);
    terrain[1] = ".#......";
    expect(validateMap(mapOf({ terrain }))).toEqual([
      { field: "players.0.hero", message: expect.stringContaining("не на земле") as string },
    ]);
  });

  it("отвергает двух героев в одной клетке", () => {
    const players = [{ hero: { x: 2, y: 2 } }, { hero: { x: 2, y: 2 } }];
    expect(validateMap(mapOf({ players }))).toEqual([
      { field: "players.1.hero", message: expect.stringContaining("другой герой") as string },
    ]);
  });

  it("принимает героя, окружённого преградами", () => {
    const terrain = rows(8, 8);
    terrain[0] = "###.....";
    terrain[1] = "#.#.....";
    terrain[2] = "###.....";
    expect(validateMap(mapOf({ terrain }))).toEqual([]);
  });
});

describe("создание партии", () => {
  it("создаёт состояние из карты и сида", () => {
    const players = [{ hero: { x: 1, y: 1 } }, { hero: { x: 6, y: 6 } }];
    expect(createGame(mapOf({ players }), 42)).toEqual({
      ok: true,
      state: {
        version: 2,
        rng: { s: 42 },
        map: {
          id: "test",
          name: "Проверочная",
          width: 8,
          height: 8,
          terrain: rows(8, 8),
          starts: [
            { x: 1, y: 1 },
            { x: 6, y: 6 },
          ],
        },
        players: [
          { id: 0, resources: { gold: 0, wood: 0, ore: 0 } },
          { id: 1, resources: { gold: 0, wood: 0, ore: 0 } },
        ],
        heroes: [
          { id: "A", owner: 0, x: 1, y: 1, movement: 1000 },
          { id: "B", owner: 1, x: 6, y: 6, movement: 1000 },
        ],
        objects: [],
        day: 1,
        currentPlayer: 0,
      },
    });
  });

  it("не создаёт партию на неверной карте и называет причину", () => {
    const result = createGame(mapOf({ players: [] }), 1);
    expect(result).toMatchObject({ ok: false, errors: [{ field: "players" }] });
  });

  it("не зависит от дальнейших изменений описания карты", () => {
    const terrain = rows(8, 8);
    const result = createGame(mapOf({ terrain }), 1);
    terrain[0] = "########";
    expect(result).toMatchObject({ ok: true, state: { map: { terrain: rows(8, 8) } } });
  });
});
