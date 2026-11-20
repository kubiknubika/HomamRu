// Второй замок: docs/mechanics/74-second-castle.md и 30-town.md. Город строит только
// здания своего замка; чужая постройка в файле карты — ошибка до начала партии.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { townErrors } from "./townContent.ts";
import { BUILDINGS, CREATURES, fromPicture } from "./testkit.ts";
import type { GameState, MapDefinition, TownState } from "./types.ts";

const PICTURE = ["S...", "....", "....", "...."];

function game(faction: string | undefined, buildings: readonly string[]): GameState {
  const map: MapDefinition = {
    id: "faction",
    name: "Замки",
    terrain: PICTURE.map(() => "...."),
    players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] } }],
    objects: [
      {
        type: "town",
        x: 1,
        y: 1,
        owner: 0,
        buildings: [...buildings],
        ...(faction === undefined ? {} : { faction }),
      },
    ],
  };
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
    faction: faction ?? "castle",
    buildings: [...buildings],
    builtToday: false,
    available: [],
    garrison: [],
    spells: [],
  };
  expect(map.objects).toHaveLength(1);
  return {
    ...state,
    buildings: [...BUILDINGS],
    creatures: [...CREATURES],
    objects: [town],
    players: [
      {
        ...player,
        resources: { gold: 20000, wood: 20, ore: 20, mercury: 0, sulfur: 0, crystal: 0, gems: 0 },
      },
    ],
  };
}

function build(state: GameState, building: string) {
  const town = state.objects[0];
  if (town?.type !== "town") {
    throw new Error("нет города");
  }
  return applyCommand(state, { type: "build", player: 0, townId: town.id, building });
}

describe("второй замок", () => {
  it("город без поля faction — замок людей", () => {
    expect(game(undefined, ["tavern", "fort"]).objects[0]).toMatchObject({ faction: "castle" });
  });

  it("город людей строит своё жилище и не строит жилище Чащи", () => {
    const state = game("castle", ["tavern", "fort"]);
    expect(build(state, "militia-yard").ok).toBe(true);
    const wrong = build(state, "kentaur-glade");
    expect(wrong.ok).toBe(false);
    expect(wrong.ok ? "" : wrong.code).toBe("WRONG_FACTION");
  });

  it("город Чащи строит своё жилище и не строит жилище людей", () => {
    const state = game("glade", ["tavern", "fort"]);
    expect(build(state, "kentaur-glade").ok).toBe(true);
    const wrong = build(state, "militia-yard");
    expect(wrong.ok ? "" : wrong.code).toBe("WRONG_FACTION");
  });

  it("общие постройки строят оба замка", () => {
    expect(build(game("castle", ["tavern"]), "town-hall").ok).toBe(true);
    expect(build(game("glade", ["tavern"]), "town-hall").ok).toBe(true);
  });

  it("чужая постройка в файле карты — ошибка до партии", () => {
    const map: MapDefinition = {
      id: "bad",
      name: "Плохая",
      terrain: PICTURE.map(() => "...."),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] } }],
      objects: [
        {
          type: "town",
          x: 1,
          y: 1,
          owner: 0,
          faction: "glade",
          buildings: ["tavern", "fort", "militia-yard"],
        },
      ],
    };
    const errors = townErrors(map, CREATURES, BUILDINGS);
    expect(errors.map((error) => error.message).join("\n")).toContain("другого замка");
  });
});
