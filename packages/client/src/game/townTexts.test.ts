// Слова экрана города: docs/mechanics/33-town-screen.md и 64-magic-screen.md.
// Правил игры здесь нет, но ошибка в словах видна игроку сразу, поэтому строки
// проверяются на настоящем городе из данных.
import { gameWith, OPEN_FIELD } from "@homamru/core/testkit";
import type { GameState, TownState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import {
  amountsText,
  armyText,
  bookStatus,
  buildingGives,
  buildingStatus,
  recruitRows,
} from "./townTexts.ts";

const START = ["tavern", "fort", "militia-yard"];

function townGame(buildings: readonly string[], gold = 6000): GameState {
  return gameWith(OPEN_FIELD, [{ type: "town", x: 4, y: 4, owner: 0, buildings }], {
    resources: { gold, wood: 35, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 },
  });
}

function townIn(game: GameState): TownState {
  const found = game.objects.find((object) => object.type === "town");
  if (found === undefined) {
    throw new Error("В партии нет города.");
  }
  return found;
}

function buildingOf(state: GameState, id: string) {
  const found = state.buildings.find((building) => building.id === id);
  if (found === undefined) {
    throw new Error(`Нет здания ${id}.`);
  }
  return found;
}

describe("слова экрана города", () => {
  it("цена здания перечисляет только то, что нужно, а даром — «бесплатно»", () => {
    expect(amountsText({ gold: 500, wood: 5 })).toBe("золото 500, дерево 5");
    expect(amountsText({})).toBe("бесплатно");
    expect(amountsText({ gold: 0 })).toBe("бесплатно");
  });

  it("что даёт здание — по его виду, а не по названию", () => {
    const state = townGame([...START]);
    expect(buildingGives(state, buildingOf(state, "tavern"))).toBe("наём героя");
    expect(buildingGives(state, buildingOf(state, "militia-yard"))).toContain("наём: ополченец");
    expect(buildingGives(state, buildingOf(state, "town-hall"))).toContain("доход города");
    expect(buildingGives(state, buildingOf(state, "citadel"))).toContain("прирост во всех жилищах");
  });

  it("построенное здание — «построено», чужое — с ценой, недоступное — с причиной", () => {
    const state = townGame([...START]);
    const town = townIn(state);
    expect(buildingStatus(state, town, buildingOf(state, "tavern"))).toEqual({ kind: "built" });
    // Строить можно один раз в день: после стройки остальные здания ждут до завтра.
    // Причина называется словами и тогда, когда стройка просто недоступна сейчас.
    const blocked = buildingStatus(state, town, buildingOf(state, "castle"));
    expect(blocked.kind).toBe("blocked");
    expect(blocked.kind === "blocked" ? blocked.reason : "").toMatch(/нужно:|не хватает:/);
  });

  it("жилище показывает, сколько ждёт, сколько растёт и сколько по карману", () => {
    const state = townGame([...START]);
    const rows = recruitRows(state, townIn(state));
    const militia = rows.find((row) => row.creature.id === "militia");
    expect(militia).toBeDefined();
    expect(militia?.affordable).toBeLessThanOrEqual(militia?.available ?? 0);
    expect(militia?.growth).toBeGreaterThan(0);
  });

  it("при нехватке золота по карману меньше, чем ждёт", () => {
    const state = townGame([...START], 10);
    const militia = recruitRows(state, townIn(state)).find((row) => row.creature.id === "militia");
    expect(militia?.available).toBeGreaterThan(0);
    expect(militia?.affordable).toBe(0);
  });

  it("армия одной строкой называет существ по-русски", () => {
    const state = townGame([...START]);
    expect(armyText(state, [{ creature: "militia", count: 12 }])).toBe("ополченец 12");
    expect(
      armyText(state, [
        { creature: "militia", count: 12 },
        { creature: "slinger", count: 5 },
      ]),
    ).toBe("ополченец 12, пращник 5");
  });

  it("книга: без героя в городе — отказ, с книгой — «выучены», без золота — сколько не хватает", () => {
    const state = townGame([...START, "mage-guild"]);
    const town = townIn(state);
    expect(bookStatus(state, town)).toEqual({ kind: "text", text: "Героя в городе нет" });
  });
});
