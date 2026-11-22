// Седьмой уровень Чащи (docs/content/creatures.md, порция 64): у людей было семь уровней,
// у Чащи шесть. Зубр закрывает эту несимметричность — и только он, без правил и экранов.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { CREATURES, fromPicture } from "./testkit.ts";
import type { GameState, TownState } from "./types.ts";

const PICTURE = ["S...", "....", "....", "...."];
const RICH = { gold: 100_000, wood: 40, ore: 40, mercury: 20, sulfur: 20, crystal: 20, gems: 20 };

function glade(buildings: readonly string[]): GameState {
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
    faction: "glade",
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

describe("седьмой уровень Чащи", () => {
  it("зубр — существо седьмого уровня, загон требует вьюнова утёса", () => {
    const aurochs = CREATURES.find((creature) => creature.id === "aurochs");
    expect(aurochs?.level).toBe(7);
    expect(aurochs).toMatchObject({ attack: 15, defense: 16, health: 110, flying: false });
  });

  it("загон не строится без всей цепочки и строится с ней", () => {
    expect(build(glade(["tavern", "fort"]), "aurochs-pen").ok).toBe(false);
    const full = glade([
      "tavern",
      "fort",
      "kentaur-glade",
      "huntress-lodge",
      "eagle-aerie",
      "ent-grove",
      "warden-hall",
      "wyvern-cliff",
    ]);
    expect(build(full, "aurochs-pen").ok).toBe(true);
  });

  it("в городе Чащи семь уровней, как у людей", () => {
    const state = glade([
      "tavern",
      "fort",
      "kentaur-glade",
      "huntress-lodge",
      "eagle-aerie",
      "ent-grove",
      "warden-hall",
      "wyvern-cliff",
    ]);
    const built = build(state, "aurochs-pen");
    if (!built.ok) {
      throw new Error(built.message);
    }
    const town = built.state.objects[0];
    const dwellings = built.state.buildings.filter(
      (building) => building.faction === "glade" && building.dwelling !== undefined,
    );
    // Семь уровней у Чащи; улучшения (82-creature-upgrades.md) — второй жилец того же уровня.
    expect(
      dwellings
        .filter((building) => building.upgrade === undefined)
        .map((building) => building.dwelling)
        .toSorted(),
    ).toEqual(["aurochs", "eagle", "ent", "huntress", "kentaur", "warden", "wyvern"]);
    expect(town?.type === "town" ? town.buildings : []).toContain("aurochs-pen");
  });
});
