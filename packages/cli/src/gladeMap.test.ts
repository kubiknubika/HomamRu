// Карта второго замка «Чаща» на настоящих данных: docs/mechanics/74-second-castle.md.
// Проверяется не правило (оно в ядре), а то, что данные и карта с ним согласны.
import { applyCommand, createGame } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { loadDefaults, loadMap } from "./files.ts";

const MAP = new URL("../../../data/maps/test-glade.yaml", import.meta.url).pathname;

function start() {
  const created = createGame(loadMap(MAP), 1, loadDefaults());
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.field).join(", "));
  }
  return created.state;
}

describe("карта с Чащей", () => {
  it("город Чащи, и в нём ждут кентавры", () => {
    const state = start();
    const town = state.objects.find((object) => object.type === "town");
    expect(town?.type === "town" ? town.faction : "").toBe("glade");
    const waiting = town?.type === "town" ? town.available : [];
    expect(waiting.find((stack) => stack.creature === "kentaur")?.count).toBeGreaterThan(0);
  });

  it("чужое жилище не строится, своё строится", () => {
    const state = start();
    const town = state.objects.find((object) => object.type === "town");
    if (town?.type !== "town") {
      throw new Error("на карте нет города");
    }
    const wrong = applyCommand(state, {
      type: "build",
      player: 0,
      townId: town.id,
      building: "militia-yard",
    });
    expect(wrong.ok ? "" : wrong.code).toBe("WRONG_FACTION");
    const own = applyCommand(state, {
      type: "build",
      player: 0,
      townId: town.id,
      building: "huntress-lodge",
    });
    expect(own.ok).toBe(true);
  });

  it("кентавров можно нанять, и они приходят к герою", () => {
    const state = start();
    const town = state.objects.find((object) => object.type === "town");
    if (town?.type !== "town") {
      throw new Error("на карте нет города");
    }
    const hired = applyCommand(state, {
      type: "recruit",
      player: 0,
      townId: town.id,
      creature: "kentaur",
      count: 5,
    });
    expect(hired.ok).toBe(true);
    const hero = hired.ok ? hired.state.heroes[0] : undefined;
    expect(hero?.army.some((stack) => stack.creature === "kentaur")).toBe(true);
  });
});
