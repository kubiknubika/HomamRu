// Пятый замок «Подземелье» (77-fifth-castle.md, docs/content/towns.md): семь существ, семь жилищ.
// Механика та же, что у Чащи, Башни и Инферно, — новый замок это только данные и наборы.
import { describe, expect, it } from "vitest";
import { DUNGEON_CREATURES } from "./battle/dungeonKit.ts";
import { applyCommand } from "./commands.ts";
import { fromPicture } from "./testkit.ts";
import type { GameState, TownState } from "./types.ts";

const PICTURE = ["S...", "....", "....", "...."];
const RICH = { gold: 500_000, wood: 80, ore: 80, mercury: 40, sulfur: 40, crystal: 40, gems: 40 };
const DWELLINGS = [
  "troglodyte-cave",
  "harpy-nest",
  "eye-tower",
  "medusa-temple",
  "minotaur-labyrinth",
  "manticore-den",
  "dragon-lair",
];

function dungeon(buildings: readonly string[]): GameState {
  const { state } = fromPicture(PICTURE);
  const player = state.players[0];
  if (player === undefined) {
    throw new Error("в рисунке нет игрока");
  }
  const town: TownState = {
    id: "o1",
    type: "town",
    x: 1,
    y: 1,
    owner: 0,
    faction: "dungeon",
    buildings: [...buildings],
    builtToday: false,
    available: [],
    garrison: [],
    spells: [],
  };
  return { ...state, objects: [town], players: [{ ...player, resources: RICH }] };
}

function build(state: GameState, building: string) {
  return applyCommand(state, { type: "build", player: 0, townId: "o1", building });
}

describe("пятый замок «Подземелье»", () => {
  it("семь существ, по одному на уровень", () => {
    expect(
      DUNGEON_CREATURES.map((creature) => creature.level ?? 0).toSorted((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DUNGEON_CREATURES.map((creature) => creature.id).toSorted()).toEqual([
      "blackdragon",
      "eye",
      "harpy",
      "manticore",
      "medusa",
      "minotaur",
      "troglodyte",
    ]);
  });

  it("цепочка жилищ строится только целиком и только в городе Подземелья", () => {
    let state = dungeon(["tavern", "fort"]);
    for (const [index, building] of DWELLINGS.entries()) {
      const built = build(state, building);
      expect(built.ok, `жилище ${building} не построилось: ${built.ok ? "" : built.message}`).toBe(
        true,
      );
      if (!built.ok) {
        return;
      }
      // Правило игры — одно здание в день; для цепочки сбрасываем отметку напрямую.
      const town = built.state.objects[0];
      if (town?.type !== "town") {
        throw new Error("город пропал");
      }
      const player = built.state.players[0];
      if (player === undefined) {
        throw new Error("игрок пропал");
      }
      state = {
        ...built.state,
        players: [{ ...player, resources: RICH }],
        objects: [{ ...town, builtToday: false }],
      };
      // Жилище следующего уровня без предыдущего не строится — проверяем на свежем городе.
      const fresh = dungeon(["tavern", "fort"]);
      expect(build(fresh, DWELLINGS[index + 1] ?? "dragon-lair").ok).toBe(false);
    }
  });

  it("в городе людей жилища Подземелья не строятся", () => {
    const castle = dungeon(["tavern", "fort"]);
    const castleTown = castle.objects[0];
    if (castleTown?.type !== "town") {
      throw new Error("города нет");
    }
    const people: GameState = {
      ...castle,
      objects: [{ ...castleTown, faction: "castle" }],
    };
    const built = build(people, "troglodyte-cave");
    expect(built.ok).toBe(false);
    expect(built.ok ? "" : built.code).toBe("WRONG_FACTION");
  });
});
