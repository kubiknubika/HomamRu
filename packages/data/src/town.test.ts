// Город в файлах и в сохранении: docs/mechanics/30-town.md, 04-save.md.
import { applyCommand } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { BUILDINGS, CREATURES } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { parseBuildingsFile } from "./battle.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { FULL_STATE, parseTestMap, readTestState, TEST_DEFAULTS } from "./testkit.ts";

const FILE = "data/buildings.yaml";
const TAVERN = "- { id: tavern, name: Таверна, cost: { gold: 500 }, tavern: true }";

function buildingErrors(text: string): string[] {
  const parsed = parseBuildingsFile(FILE, text, CREATURES);
  return parsed.ok ? [] : parsed.errors.map((error) => `${error.field}: ${error.message}`);
}

const map = (town: string) =>
  [
    "id: test",
    "name: Проверка",
    `terrain: [${Array.from({ length: 8 }, () => '"........"').join(", ")}]`,
    "players:",
    "  - hero: { x: 1, y: 1, army: [{ creature: militia, count: 10 }] }",
    "objects:",
    `  - ${town}`,
  ].join("\n");

const townOf = (raw: unknown) => readTestState(raw)?.objects.find((o) => o.type === "town");

describe("файл зданий", () => {
  it("читается; требований нет — пустой список", () => {
    const text = `${TAVERN}\n- { id: yard, name: Двор, cost: { ore: 1 }, requires: [tavern], dwelling: militia }`;
    expect(parseBuildingsFile(FILE, text, CREATURES)).toEqual({
      ok: true,
      value: [
        { id: "tavern", name: "Таверна", cost: { gold: 500 }, requires: [], tavern: true },
        { id: "yard", name: "Двор", cost: { ore: 1 }, requires: ["tavern"], dwelling: "militia" },
      ],
    });
  });

  it.each([
    [
      "повтор",
      `${TAVERN}\n- { id: tavern, name: Ещё, cost: {} }`,
      "1.id: Здание «tavern» уже есть.",
    ],
    [
      "нужное здание ниже или отсутствует",
      `${TAVERN}\n- { id: a, name: А, cost: {}, requires: [b] }\n- { id: b, name: Б, cost: {} }`,
      "1.requires: Здания «b» выше в файле нет.",
    ],
    [
      "неизвестное существо",
      `${TAVERN}\n- { id: a, name: А, cost: {}, dwelling: dragon }`,
      "1.dwelling: Существа «dragon» нет.",
    ],
    ["нет таверны", "- { id: a, name: А, cost: {} }", "tavern: Таверна должна быть ровно одна."],
  ])("отвергается: %s", (_, text, message) => {
    expect(buildingErrors(text)).toEqual([message]);
  });

  it("незнакомое поле и цена меньше 1 — ошибка схемы", () => {
    expect(buildingErrors(`${TAVERN.replace("tavern: true", "walls: 2")}`)).not.toEqual([]);
    expect(buildingErrors(`${TAVERN.replace("500", "0")}`)).not.toEqual([]);
  });
});

describe("город в файле карты", () => {
  it("читается с постройками и гарнизоном", () => {
    const town =
      "{ type: town, x: 3, y: 3, owner: 0, buildings: [tavern], garrison: [{ creature: falcon, count: 2 }] }";
    expect(parseTestMap("data/maps/test.yaml", map(town))).toMatchObject({ ok: true });
  });

  it("ошибка по смыслу называет файл и место", () => {
    const parsed = parseTestMap("data/maps/test.yaml", map("{ type: town, x: 3, y: 3, owner: 0 }"));
    expect(parsed).toEqual({
      ok: false,
      errors: [
        {
          file: "data/maps/test.yaml",
          field: "objects.0.buildings",
          message: "В городе нет здания «tavern».",
        },
      ],
    });
  });

  it("незнакомое поле города — ошибка схемы", () => {
    const town = "{ type: town, x: 3, y: 3, owner: 0, buildings: [tavern], walls: 3 }";
    expect(parseTestMap("data/maps/test.yaml", map(town))).toMatchObject({ ok: false });
  });
});

describe("город в сохранении", () => {
  const TOWN = FULL_STATE.objects[3];
  it("запись с городом и командами города загружается без изменений", () => {
    const commands = [
      { type: "build", player: 1, townId: "o5", building: "citadel" },
      { type: "recruit", player: 1, townId: "o5", creature: "militia", count: 4 },
      { type: "transfer", player: 1, townId: "o5", from: "hero", creature: "falcon", count: 2 },
    ] as const;
    const body = { gameVersion: "test", initial: FULL_STATE, commands, state: FULL_STATE };
    expect(decodeSave(encodeSave(body, 3), TEST_DEFAULTS)).toEqual({
      kind: "ok",
      record: { ...body, seq: 3, adapted: false },
    });
  });

  it("чего в записи города нет — начальное: построек нет, не строили, никто не ждёт, гарнизон пуст", () => {
    const bare = { id: "o5", type: "town", x: 2, y: 2, owner: 1 };
    expect(townOf({ ...FULL_STATE, objects: [bare] })).toEqual({
      ...bare,
      buildings: [],
      builtToday: false,
      available: [],
      garrison: [],
    });
  });

  it("незнакомые и повторные здания и существа убираются; одинаковые отряды сливаются", () => {
    const town = {
      ...TOWN,
      buildings: ["tavern", "wizard-tower", "fort", "tavern", "militia-yard"],
      available: [
        { creature: "militia", count: 3 },
        { creature: "falcon", count: 5 },
        { creature: "militia", count: 0 },
      ],
      garrison: [
        { creature: "dragon", count: 1 },
        { creature: "militia", count: 2 },
        { creature: "militia", count: 3 },
      ],
    };
    expect(townOf({ ...FULL_STATE, objects: [town] })).toMatchObject({
      buildings: ["tavern", "fort", "militia-yard"],
      // Соколиной башни нет — соколы ждать найма не могут.
      available: [{ creature: "militia", count: 3 }],
      garrison: [{ creature: "militia", count: 5 }],
    });
  });

  it("город без владельца убирается; второй город того же игрока остаётся — он захвачен", () => {
    const second = { ...TOWN, id: "o6", x: 3, y: 3 };
    const ownerless = { ...TOWN, id: "o7", x: 1, y: 2, owner: null };
    const objects = readTestState({ ...FULL_STATE, objects: [TOWN, second, ownerless] })?.objects;
    expect(objects?.map((object) => object.id)).toEqual(["o5", "o6"]);
  });

  it("владелец города, которого нет в списке игроков, добавляется в него", () => {
    const state = readTestState({ ...FULL_STATE, players: [FULL_STATE.players[0]], heroes: [] });
    expect(state?.players).toHaveLength(2);
  });

  it("списка зданий партии нет — здания игры; записанные остаются как записаны", () => {
    expect(readTestState({ ...FULL_STATE, buildings: undefined })?.buildings).toEqual(BUILDINGS);
    const dear = { ...BUILDINGS[0], cost: { gold: 9000 }, colour: "red" };
    const state = readTestState({ ...FULL_STATE, buildings: [dear, { id: 5 }] });
    expect(state?.buildings[0]).toEqual({ ...BUILDINGS[0], cost: { gold: 9000 } });
    expect(state?.buildings.map((building) => building.id)).toEqual(BUILDINGS.map((b) => b.id));
  });

  it("идущий бой из записи до этапа 4 сохраняется: цена и прирост существ дописываются", () => {
    const guard = {
      id: "o4",
      type: "guard",
      x: 3,
      y: 1,
      creature: "falcon",
      count: 1,
      power: 1000,
    };
    const hero = { ...FULL_STATE.heroes[0], x: 3, y: 3, movement: 1000 };
    const before = {
      ...FULL_STATE,
      currentPlayer: 0,
      players: FULL_STATE.players.map((player) => ({ ...player, tavern: [] })),
      heroes: [hero],
      objects: [guard],
    } as GameState;
    const fight = applyCommand(before, { type: "moveHero", player: 0, heroId: "A", path: ["N"] });
    const fighting = fight.ok ? fight.state : before;
    expect(fighting.battle).not.toBeNull();
    const old = JSON.parse(
      JSON.stringify(fighting, (key, value: unknown) =>
        key === "price" || key === "growth" ? undefined : value,
      ),
    ) as unknown;
    expect(readTestState(old)).toEqual(fighting);
  });

  it("у существа из записи до этапа 4 нет цены и прироста — берутся у существа игры", () => {
    const old = CREATURES.map(({ price: _price, growth: _growth, ...rest }) => ({ ...rest }));
    const slow = old.map((creature) => ({ ...creature, speed: 1 }));
    const state = readTestState({ ...FULL_STATE, creatures: slow });
    expect(state?.creatures).toEqual(CREATURES.map((creature) => ({ ...creature, speed: 1 })));
    // Существа, которого игра не знает, без цены оставить нельзя.
    const alien = { ...old[0], id: "dragon" };
    const ids = readTestState({ ...FULL_STATE, creatures: [alien] })?.creatures.map((c) => c.id);
    expect(ids).toEqual(CREATURES.map((creature) => creature.id));
  });
});
