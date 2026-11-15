// Рынок на экране города: docs/mechanics/72-market.md, раздел «На экране».
import { gameWith, OPEN_FIELD } from "@homamru/core/testkit";
import type { GameState, TownState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { hasMarket, marketOffer } from "./marketTexts.ts";

const WEALTH = { gold: 6000, wood: 35, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 };
const START = ["tavern", "fort", "militia-yard"];

function townGame(buildings: readonly string[]): GameState {
  return gameWith(OPEN_FIELD, [{ type: "town", x: 4, y: 4, owner: 0, buildings }], {
    resources: WEALTH,
  });
}

function townIn(game: GameState): TownState {
  const found = game.objects.find((object) => object.type === "town");
  if (found === undefined) {
    throw new Error("В партии нет города.");
  }
  return found;
}

const state = townGame([...START, "market"]);
const town = townIn(state);

describe("рынок на экране", () => {
  it("раздел есть только в городе с рынком", () => {
    const plain = townGame(START);
    expect(hasMarket(state, town)).toBe(true);
    expect(hasMarket(plain, townIn(plain))).toBe(false);
  });

  it("курс, число сделок по карману и слова обмена", () => {
    expect(marketOffer(state, town, "wood", "ore", 2)).toEqual({
      rate: "дерево 10 → руда 1",
      max: 3,
      count: 2,
      deal: "Отдать: дерево 20. Получить: руда 2",
      reason: null,
    });
    expect(marketOffer(state, town, "wood", "gold", 1).rate).toBe("дерево 1 → золото 25");
  });

  it("число сделок держится в границах от 1 до наибольшего", () => {
    expect(marketOffer(state, town, "wood", "ore", 99).count).toBe(3);
    expect(marketOffer(state, town, "wood", "ore", -5).count).toBe(1);
    expect(marketOffer(state, town, "gold", "gems", 9).count).toBe(1);
  });

  it("не хватает или ресурс тот же — причина словами", () => {
    expect(marketOffer(state, town, "gold", "gold", 1).reason).toBe("Выберите два разных ресурса.");
    expect(marketOffer(state, town, "ore", "wood", 1).reason).toBe("Не хватает: руда 0 из 10.");
    expect(marketOffer(state, town, "gold", "crystal", 1).reason).toBeNull();
  });
});
