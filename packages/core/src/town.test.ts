// Город: здания, доход, прирост. docs/mechanics/30-town.md, 31-recruitment.md.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { incomeOf } from "./objects.ts";
import { codeOf, days, eventsOf, gold, run, START, toCommand, town, townGame } from "./townKit.ts";
import type { Command } from "./types.ts";

describe("строительство", () => {
  it("цена списывается, здание готово сразу, событие называет здание и цену", () => {
    const state = townGame();
    const result = applyCommand(state, toCommand({ build: "slinger-range" }));
    expect(result.ok && result.events).toEqual([
      {
        type: "buildingBuilt",
        townId: "o1",
        building: "slinger-range",
        spent: { gold: 1000, wood: 5, ore: 5 },
      },
    ]);
    const next = run(state, { build: "slinger-range" });
    expect(next.players[0]?.resources).toEqual({ gold: 19_000, wood: 15, ore: 15 });
    expect(town(next)).toMatchObject({ buildings: [...START, "slinger-range"], builtToday: true });
  });

  it("одно здание в день в городе; на следующий день можно снова", () => {
    const built = run(townGame(), { build: "smithy" });
    expect(codeOf(built, { build: "town-hall" })).toBe("BUILT_TODAY");
    const next = run(built, "endTurn", { build: "town-hall" });
    expect(town(next)?.buildings).toEqual([...START, "smithy", "town-hall"]);
  });

  it.each([
    ["здания нет", { build: "wizard-tower" }, "UNKNOWN_BUILDING"],
    ["уже построено", { build: "fort" }, "ALREADY_BUILT"],
    ["не построено нужное", { build: "barracks" }, "REQUIREMENT_MISSING"],
    ["замку нужна цитадель", { build: "castle" }, "REQUIREMENT_MISSING"],
  ] as const)("отказ: %s", (_, step, code) => {
    const state = townGame();
    expect(codeOf(state, step)).toBe(code);
    expect(applyCommand(state, toCommand(step))).toMatchObject({ ok: false });
  });

  it("не хватает любого из ресурсов — отказ, ничего не списано", () => {
    expect(
      codeOf(townGame(START, { gold: 999, wood: 5, ore: 5 }), { build: "slinger-range" }),
    ).toBe("NOT_ENOUGH_RESOURCES");
    expect(
      codeOf(townGame(START, { gold: 1000, wood: 4, ore: 5 }), { build: "slinger-range" }),
    ).toBe("NOT_ENOUGH_RESOURCES");
    expect(
      codeOf(townGame(START, { gold: 1000, wood: 5, ore: 5 }), { build: "slinger-range" }),
    ).toBe("ok");
  });

  it("проверки идут по порядку: сначала «уже строили», потом требования и цена", () => {
    const built = run(townGame(START, { gold: 1000, wood: 5 }), { build: "smithy" });
    expect(codeOf(built, { build: "smithy" })).toBe("ALREADY_BUILT");
    expect(codeOf(built, { build: "falcon-tower" })).toBe("BUILT_TODAY");
    expect(codeOf(run(built, "endTurn"), { build: "falcon-tower" })).toBe("REQUIREMENT_MISSING");
  });

  it("города с таким идентификатором нет или команду отдаёт не владелец — отказ", () => {
    const state = townGame();
    const wrongTown: Command = { type: "build", player: 0, townId: "o9", building: "smithy" };
    expect(applyCommand(state, wrongTown)).toMatchObject({ code: "NO_TOWN" });
    const stranger: Command = { type: "build", player: 1, townId: "o1", building: "smithy" };
    expect(applyCommand(state, stranger)).toMatchObject({ code: "UNKNOWN_PLAYER" });
  });

  it("вся цепочка до соколиной башни строится за четыре дня", () => {
    const next = run(
      townGame(),
      { build: "smithy" },
      "endTurn",
      { build: "barracks" },
      "endTurn",
      { build: "falcon-tower" },
      "endTurn",
      { build: "slinger-range" },
    );
    expect(town(next)?.available).toEqual([
      { creature: "militia", count: 14 },
      { creature: "armsman", count: 4 },
      { creature: "falcon", count: 7 },
      { creature: "slinger", count: 9 },
    ]);
  });
});

describe("доход города", () => {
  it("500 золота в день, с ратушей 1000; вместе с шахтами — одним событием", () => {
    expect(incomeOf(townGame(), 0)).toEqual({ gold: 500, wood: 0, ore: 0 });
    const hall = run(townGame(), { build: "town-hall" });
    expect(incomeOf(hall, 0)).toEqual({ gold: 1000, wood: 0, ore: 0 });
    expect(eventsOf(hall, "endTurn")).toContainEqual({
      type: "incomeReceived",
      player: 0,
      income: { gold: 1000, wood: 0, ore: 0 },
    });
    expect(gold(run(hall, "endTurn"))).toBe(18_500);
  });

  it("в первый день дохода нет; ратуша, построенная сегодня, даёт 1000 с завтра", () => {
    const state = townGame();
    expect(gold(state)).toBe(20_000);
    const second = run(state, "endTurn");
    expect(gold(second)).toBe(20_500);
    expect(gold(run(second, { build: "town-hall" }, "endTurn"))).toBe(20_500 - 2500 + 1000);
  });
});

describe("недельный прирост", () => {
  it("пример из 31-recruitment.md: 14 → 28 → 8 → 8 → 29, пращников 9", () => {
    const first = townGame();
    expect(town(first)?.available).toEqual([{ creature: "militia", count: 14 }]);
    const eighth = run(first, ...days(7));
    expect(eighth.day).toBe(8);
    expect(town(eighth)?.available).toEqual([{ creature: "militia", count: 28 }]);
    const ninth = run(eighth, "endTurn", { recruit: "militia", count: 20 });
    expect(town(ninth)?.available).toEqual([{ creature: "militia", count: 8 }]);
    const tenth = run(ninth, "endTurn", { build: "citadel" });
    expect(town(tenth)?.available).toEqual([{ creature: "militia", count: 8 }]);
    const fifteenth = run(tenth, ...days(5));
    expect(fifteenth.day).toBe(15);
    expect(town(fifteenth)?.available).toEqual([{ creature: "militia", count: 29 }]);
    const sixteenth = run(fifteenth, "endTurn", { build: "slinger-range" });
    expect(town(sixteenth)?.available).toContainEqual({ creature: "slinger", count: 9 });
  });

  it.each([
    ["без цитадели", [], [14, 9, 4, 7]],
    ["с цитаделью", ["citadel"], [21, 13, 6, 10]],
    ["с замком", ["citadel", "castle"], [28, 18, 8, 14]],
  ] as const)("прирост %s", (_, extra, counts) => {
    const all = [...START, ...extra, "slinger-range", "smithy", "barracks", "falcon-tower"];
    const state = townGame(all);
    // В начале партии в жилищах основной прирост; прибавка считается в начале недели.
    expect(town(state)?.available.map((stack) => stack.count)).toEqual([14, 9, 4, 7]);
    const events = eventsOf(run(state, ...days(6)), "endTurn");
    const grew = events.filter((event) => event.type === "creaturesGrew");
    expect(grew.map((event) => [event.creature, event.added, event.available])).toEqual([
      ["militia", counts[0], counts[0] + 14],
      ["slinger", counts[1], counts[1] + 9],
      ["armsman", counts[2], counts[2] + 4],
      ["falcon", counts[3], counts[3] + 7],
    ]);
  });

  it("в середине недели прироста нет; без жилищ ждать некому", () => {
    expect(town(run(townGame(), ...days(5)))?.available).toEqual([
      { creature: "militia", count: 14 },
    ]);
    expect(town(run(townGame(["tavern"]), ...days(7)))?.available).toEqual([]);
  });
});
