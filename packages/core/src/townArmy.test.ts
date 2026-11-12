// Город: наём, гарнизон, обмен отрядами. docs/mechanics/31-recruitment.md.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { renderState } from "./render.ts";
import {
  codeOf,
  eventsOf,
  gold,
  heroArmy,
  RICH,
  run,
  START,
  toCommand,
  town,
  townGame,
} from "./townKit.ts";

describe("наём", () => {
  it.each([
    [1000, 14, "ok", 14, 160, 0],
    [1000, 15, "NOT_AVAILABLE", 0, 1000, 14],
    [500, 9, "NOT_ENOUGH_RESOURCES", 0, 500, 14],
    [500, 8, "ok", 8, 20, 6],
  ] as const)("золота %i, нанять %i → %s", (money, count, code, garrison, left, waiting) => {
    const state = townGame(START, { gold: money });
    expect(codeOf(state, { recruit: "militia", count })).toBe(code);
    const result = applyCommand(state, toCommand({ recruit: "militia", count }));
    const next = result.ok ? result.state : state;
    expect(gold(next)).toBe(left);
    expect(town(next)?.garrison).toEqual(
      garrison > 0 ? [{ creature: "militia", count: garrison }] : [],
    );
    expect(town(next)?.available).toEqual(
      waiting > 0 ? [{ creature: "militia", count: waiting }] : [],
    );
  });

  it("событие называет существо, число и цену; герой для найма не нужен", () => {
    expect(eventsOf(townGame(), { recruit: "militia", count: 3 })).toEqual([
      { type: "creaturesRecruited", townId: "o1", creature: "militia", count: 3, cost: 180 },
    ]);
  });

  it.each([
    ["жилища нет", { recruit: "slinger", count: 1 }, "NO_DWELLING"],
    ["существа нет", { recruit: "dragon", count: 1 }, "NO_DWELLING"],
    ["ноль", { recruit: "militia", count: 0 }, "BAD_COUNT"],
    ["отрицательное", { recruit: "militia", count: -2 }, "BAD_COUNT"],
    ["дробное", { recruit: "militia", count: 1.5 }, "BAD_COUNT"],
  ] as const)("отказ: %s", (_, step, code) => {
    expect(codeOf(townGame(), step)).toBe(code);
  });

  it("нанятые сливаются с отрядом гарнизона", () => {
    const next = run(
      townGame(),
      { recruit: "militia", count: 4 },
      { recruit: "militia", count: 5 },
    );
    expect(town(next)?.garrison).toEqual([{ creature: "militia", count: 9 }]);
  });
});

describe("обмен отрядами", () => {
  it("пока героя нет в городе — отказ; вошёл — можно, и запас хода не тратится", () => {
    const hired = run(townGame(), { recruit: "militia", count: 14 });
    expect(codeOf(hired, { take: "militia", count: 14 })).toBe("HERO_NOT_IN_TOWN");
    const inside = run(hired, "enter");
    const movement = inside.heroes[0]?.movement;
    const next = run(inside, { take: "militia", count: 14 });
    expect(heroArmy(next)).toEqual([{ creature: "militia", count: 24 }]);
    expect(town(next)?.garrison).toEqual([]);
    expect(next.heroes[0]?.movement).toBe(movement);
  });

  it("новый вид существ встаёт в конец армии героя", () => {
    const all = [...START, "slinger-range"];
    const next = run(townGame(all), { recruit: "slinger", count: 9 }, "enter", {
      take: "slinger",
      count: 9,
    });
    expect(heroArmy(next)).toEqual([
      { creature: "militia", count: 10 },
      { creature: "slinger", count: 9 },
    ]);
  });

  it("герой не может отдать последний отряд целиком, но может отдать часть или один из двух", () => {
    const inside = run(townGame(), "enter");
    expect(codeOf(inside, { give: "militia", count: 10 })).toBe("LAST_STACK");
    expect(heroArmy(run(inside, { give: "militia", count: 9 }))).toEqual([
      { creature: "militia", count: 1 },
    ]);
    const two = run(townGame(START, RICH, [], ["militia:10", "slinger:5"]), "enter", {
      give: "militia",
      count: 10,
    });
    expect(heroArmy(two)).toEqual([{ creature: "slinger", count: 5 }]);
    expect(town(two)?.garrison).toEqual([{ creature: "militia", count: 10 }]);
  });

  it.each([
    ["больше, чем в гарнизоне", { take: "militia", count: 15 }, "NOT_AVAILABLE"],
    ["больше, чем у героя", { give: "militia", count: 11 }, "NOT_AVAILABLE"],
    ["вида нет у отдающего", { take: "falcon", count: 1 }, "NOT_AVAILABLE"],
    ["ноль", { give: "militia", count: 0 }, "BAD_COUNT"],
    ["дробное", { take: "militia", count: 0.5 }, "BAD_COUNT"],
  ] as const)("отказ: %s", (_, step, code) => {
    const inside = run(townGame(), { recruit: "militia", count: 14 }, "enter");
    expect(codeOf(inside, step)).toBe(code);
  });

  it("существа при обмене не появляются и не пропадают", () => {
    const inside = run(townGame(), { recruit: "militia", count: 14 }, "enter");
    const next = run(inside, { take: "militia", count: 6 }, { give: "militia", count: 11 });
    expect(heroArmy(next)).toEqual([{ creature: "militia", count: 5 }]);
    expect(town(next)?.garrison).toEqual([{ creature: "militia", count: 19 }]);
  });
});

describe("город в партии", () => {
  it("одинаковые отряды в армии героя из карты сливаются", () => {
    const state = townGame(START, RICH, [], ["militia:10", "slinger:5", "militia:7"]);
    expect(state.heroes[0]?.army).toEqual([
      { creature: "militia", count: 17 },
      { creature: "slinger", count: 5 },
    ]);
  });

  it("во время боя команды города отклоняются", () => {
    const guard = { type: "guard", x: 3, y: 0, creature: "militia", count: 1 } as const;
    const state = townGame(START, RICH, [guard]);
    const fight = applyCommand(state, {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E", "E"],
    });
    const fighting = fight.ok ? fight.state : state;
    expect(fighting.battle).not.toBeNull();
    expect(codeOf(fighting, { build: "smithy" })).toBe("BATTLE_IN_PROGRESS");
    expect(codeOf(fighting, { recruit: "militia", count: 1 })).toBe("BATTLE_IN_PROGRESS");
  });

  it("печатается после объектов: постройки, кто ждёт найма, гарнизон; на карте — T", () => {
    const pile = { type: "pile", x: 5, y: 5, resource: "gold", amount: 100 } as const;
    const text = renderState(run(townGame(START, RICH, [pile]), { recruit: "militia", count: 2 }));
    expect(text).toContain(
      [
        "Город o1 (1, 1), игрок 1: таверна, форт, двор ополченцев. Сегодня строили: нет.",
        "  Ждут найма: ополченец 12.",
        "  Гарнизон: ополченец 2.",
      ].join("\n"),
    );
    expect(text.indexOf("Город o1")).toBeGreaterThan(text.indexOf("o2"));
    expect(text).toMatch(/^\s*1 \.T/m);
  });
});
