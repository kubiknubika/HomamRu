// Проверка городов карты: docs/mechanics/30-town.md, «Файл карты».
import { describe, expect, it } from "vitest";
import { CREATURES } from "./battle/testkit.ts";
import { validateMap } from "./map.ts";
import { BUILDINGS, TEST_ARMY } from "./testkit.ts";
import type { MapDefinition, MapObjectDefinition } from "./types.ts";

type Town = Extract<MapObjectDefinition, { type: "town" }>;

const TOWN: Town = { type: "town", x: 3, y: 3, owner: 0, buildings: ["tavern"] };

function errorsOf(towns: readonly Partial<Town>[], players = 1): string[] {
  const map: MapDefinition = {
    id: "test",
    name: "Проверочная",
    terrain: Array.from({ length: 8 }, () => "........"),
    players: Array.from({ length: players }, (_, index) => ({
      hero: { x: index * 7, y: 0, army: TEST_ARMY },
    })),
    objects: towns.map((town, index) => ({ ...TOWN, x: 3 + index, ...town })),
  };
  return validateMap(map, CREATURES, BUILDINGS).map((error) => `${error.field}: ${error.message}`);
}

describe("город в файле карты", () => {
  it("город с таверной, зданиями по порядку требований и гарнизоном принимается", () => {
    const buildings = ["tavern", "fort", "militia-yard", "smithy", "barracks"];
    const garrison = [
      { creature: "militia", count: 5 },
      { creature: "armsman", count: 1 },
    ];
    expect(errorsOf([{ buildings, garrison }])).toEqual([]);
    expect(errorsOf([{}, { owner: 1 }], 2)).toEqual([]);
  });

  it.each([
    ["нет таверны", { buildings: ["fort"] }, "objects.0.buildings: В городе нет здания «tavern»."],
    [
      "зданий не записано",
      { buildings: undefined },
      "objects.0.buildings: В городе нет здания «tavern».",
    ],
    ["владельца нет", { owner: 1 }, "objects.0.owner: Игрока с номером 1 на карте нет."],
    ["владелец — не номер", { owner: -1 }, "objects.0.owner: Игрока с номером -1 на карте нет."],
    [
      "здание неизвестно",
      { buildings: ["tavern", "wizard-tower"] },
      "objects.0.buildings.1: Здания «wizard-tower» нет.",
    ],
    [
      "здание дважды",
      { buildings: ["tavern", "fort", "fort"] },
      "objects.0.buildings.2: Здание «fort» записано дважды.",
    ],
    [
      "нет нужного здания",
      { buildings: ["tavern", "militia-yard"] },
      "objects.0.buildings.1: Зданию «militia-yard» нужно «fort», а его в городе нет.",
    ],
    [
      "неизвестное существо в гарнизоне",
      { garrison: [{ creature: "dragon", count: 1 }] },
      "objects.0.garrison.0: Существа «dragon» нет.",
    ],
    [
      "в гарнизоне ноль существ",
      { garrison: [{ creature: "militia", count: 0 }] },
      "objects.0.garrison.0: Существ 0; должно быть целое, не меньше 1.",
    ],
    [
      "один вид существ дважды",
      {
        garrison: [
          { creature: "militia", count: 1 },
          { creature: "militia", count: 2 },
        ],
      },
      "objects.0.garrison.1: Существо «militia» записано дважды.",
    ],
  ] as const)("карта отвергается: %s", (_, town, message) => {
    expect(errorsOf([town as Partial<Town>])).toEqual([message]);
  });

  it("у игрока не больше одного города", () => {
    expect(errorsOf([{}, {}])).toEqual(["objects.1.owner: У игрока 1 уже есть город."]);
  });

  it("город, как любой объект, стоит на свободной клетке земли", () => {
    expect(errorsOf([{ x: 0, y: 0 }])).toEqual([
      "objects.0: Клетка (0, 0) уже занята героем или другим объектом.",
    ]);
  });
});
