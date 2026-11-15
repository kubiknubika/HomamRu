// Правила из docs/mechanics/72-market.md: рынок, курс, обмен.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { captured } from "./duelKit.ts";
import { marketCount, marketRate, RESOURCE_WEIGHT } from "./market.ts";
import type { TradeCommand } from "./market.ts";
import { NO_RESOURCES } from "./objects.ts";
import { formatEvent } from "./render.ts";
import { run, START, townGame } from "./townKit.ts";
import { RESOURCES } from "./types.ts";
import type { Command, GameState, Resource, Resources } from "./types.ts";

const MARKET = [...START, "market"];
const WEALTH: Resources = {
  gold: 20_000,
  wood: 20,
  ore: 20,
  mercury: 6,
  sulfur: 6,
  crystal: 6,
  gems: 6,
};
const resources = (state: GameState) => state.players[0]?.resources;

function trade(give: Resource, want: Resource, count: number, townId = "o1"): TradeCommand {
  return { type: "trade", player: 0, townId, give, want, count };
}

function tradeCode(state: GameState, command: Command): string {
  const result = applyCommand(state, command);
  return result.ok ? "ok" : result.code;
}

function traded(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result.state;
}

/** Курс словами: «10 за 1». */
function rate(give: Resource, want: Resource, markets: number): string {
  const { give: given, get } = marketRate(give, want, markets);
  return `${given} за ${get}`;
}

describe("здание", () => {
  it("рынок стоит 500 золота и 5 дерева, ничего не требует", () => {
    const state = run(townGame(START, WEALTH), { build: "market" });
    expect(resources(state)).toEqual({ ...WEALTH, gold: 19_500, wood: 15 });
    expect(marketCount(state, 0)).toBe(1);
    expect(marketCount(townGame(START, WEALTH), 0)).toBe(0);
  });
});

describe("курс", () => {
  it("один рынок — таблица из документа", () => {
    expect(rate("gold", "wood", 1)).toBe("2500 за 1");
    expect(rate("gold", "gems", 1)).toBe("5000 за 1");
    expect(rate("wood", "gold", 1)).toBe("1 за 25");
    expect(rate("wood", "ore", 1)).toBe("10 за 1");
    expect(rate("ore", "sulfur", 1)).toBe("20 за 1");
    expect(rate("mercury", "gold", 1)).toBe("1 за 50");
    expect(rate("crystal", "wood", 1)).toBe("5 за 1");
    expect(rate("crystal", "gems", 1)).toBe("10 за 1");
  });

  it("два рынка — таблица из документа", () => {
    expect(rate("gold", "ore", 2)).toBe("1667 за 1");
    expect(rate("gold", "mercury", 2)).toBe("3333 за 1");
    expect(rate("wood", "gold", 2)).toBe("1 за 38");
    expect(rate("wood", "ore", 2)).toBe("7 за 1");
    expect(rate("wood", "gems", 2)).toBe("13 за 1");
    expect(rate("gems", "gold", 2)).toBe("1 за 75");
    expect(rate("gems", "wood", 2)).toBe("3 за 1");
    expect(rate("gems", "sulfur", 2)).toBe("7 за 1");
  });

  it("выгодность не растёт после девяти рынков", () => {
    expect(rate("gold", "wood", 9)).toBe("500 за 1");
    expect(rate("wood", "gold", 9)).toBe("1 за 125");
    expect(rate("wood", "ore", 9)).toBe("2 за 1");
    for (const give of RESOURCES) {
      for (const want of RESOURCES) {
        expect(marketRate(give, want, 30)).toEqual(marketRate(give, want, 9));
      }
    }
  });

  it("обменом туда и обратно запас не увеличить — при любом числе рынков", () => {
    for (let markets = 1; markets <= 12; markets += 1) {
      for (const first of RESOURCES) {
        for (const second of RESOURCES.filter((id) => id !== first)) {
          const there = marketRate(first, second, markets);
          const back = marketRate(second, first, markets);
          // Отдав `there.give × back.give` первого, получаем `there.get × back.get` обратно.
          expect(there.get * back.get).toBeLessThanOrEqual(there.give * back.give);
          expect(Math.min(there.give, there.get)).toBe(1);
          expect(RESOURCE_WEIGHT[first]).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("обмен", () => {
  const state = townGame(MARKET, WEALTH);

  it("несколько сделок: отдаваемое убывает, желаемое прибывает, остальное цело", () => {
    expect(resources(traded(state, trade("gold", "gems", 3)))).toEqual({
      ...WEALTH,
      gold: 5000,
      gems: 9,
    });
    expect(resources(traded(state, trade("sulfur", "gold", 6)))).toEqual({
      ...WEALTH,
      sulfur: 0,
      gold: 20_300,
    });
  });

  it("обмен ничего, кроме ресурсов игрока, не меняет; обменов в день сколько угодно", () => {
    const once = traded(state, trade("wood", "ore", 1));
    const twice = traded(once, trade("wood", "ore", 1));
    expect(resources(twice)).toEqual({ ...WEALTH, wood: 0, ore: 22 });
    expect({ ...twice, players: state.players }).toEqual(state);
  });

  it("ровно хватает — обмен проходит; на единицу меньше — отказ", () => {
    expect(tradeCode(state, trade("gold", "wood", 8))).toBe("ok");
    expect(tradeCode(state, trade("gold", "wood", 9))).toBe("NOT_ENOUGH_RESOURCES");
    const poor = townGame(MARKET, { ...NO_RESOURCES, wood: 9 });
    expect(tradeCode(poor, trade("wood", "ore", 1))).toBe("NOT_ENOUGH_RESOURCES");
  });

  it("отказы: нет рынка, тот же ресурс, негодное число, неизвестный город", () => {
    expect(tradeCode(townGame(START, WEALTH), trade("gold", "wood", 1))).toBe("NO_MARKET");
    expect(tradeCode(state, trade("ore", "ore", 1))).toBe("SAME_RESOURCE");
    expect(tradeCode(state, trade("gold", "wood", 0))).toBe("BAD_COUNT");
    expect(tradeCode(state, trade("gold", "wood", 1.5))).toBe("BAD_COUNT");
    expect(tradeCode(state, trade("gold", "wood", -2))).toBe("BAD_COUNT");
    expect(tradeCode(state, trade("gold", "wood", 1, "o9"))).toBe("NO_TOWN");
  });

  it("событие обмена печатается словами", () => {
    const result = applyCommand(state, trade("wood", "mercury", 1));
    const events = result.ok ? result.events : [];
    expect(events.map((event) => formatEvent(event))).toEqual([
      "Игрок 1 обменял на рынке города o1: дерево −20, ртуть +1",
    ]);
  });
});

describe("два рынка", () => {
  it("рынок во втором, захваченном городе улучшает курс в обоих", () => {
    const base = captured();
    const towns = base.objects.filter((object) => object.type === "town");
    const state: GameState = {
      ...base,
      currentPlayer: 0,
      players: base.players.map((player) => ({ ...player, resources: WEALTH })),
      objects: base.objects.map((object) =>
        object.type === "town"
          ? { ...object, owner: 0, buildings: [...object.buildings, "market"], builtToday: false }
          : object,
      ),
    };
    expect(towns).toHaveLength(2);
    expect(marketCount(state, 0)).toBe(2);
    const [home] = towns;
    const after = traded(state, trade("gold", "wood", 1, home?.id ?? ""));
    expect(after.players[0]?.resources).toEqual({ ...WEALTH, gold: 20_000 - 1667, wood: 21 });
  });
});
