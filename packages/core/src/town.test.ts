// Город: docs/mechanics/30-town.md, 31-recruitment.md.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { incomeOf } from "./objects.ts";
import { renderState } from "./render.ts";
import { gameWith } from "./testkit.ts";
import { townOf } from "./town.ts";
import type {
  Command,
  GameEvent,
  GameState,
  MapObjectDefinition,
  ResourceAmounts,
} from "./types.ts";

const ROWS = ["S.......", ...Array.from({ length: 7 }, () => "........")];
const RICH = { gold: 20_000, wood: 20, ore: 20 };
const START = ["tavern", "fort", "militia-yard"];

function townGame(
  buildings: readonly string[] = START,
  resources: ResourceAmounts = RICH,
  extra: readonly MapObjectDefinition[] = [],
  army: readonly string[] = ["militia:10"],
): GameState {
  const town = { type: "town", x: 1, y: 1, owner: 0, buildings } as const;
  return gameWith(ROWS, [town, ...extra], { resources, army });
}

/** Применяет команды подряд; любая отклонённая — ошибка теста. */
function run(state: GameState, ...commands: readonly TownStep[]): GameState {
  let current = state;
  for (const step of commands) {
    const result = applyCommand(current, toCommand(step));
    if (!result.ok) {
      throw new Error(`${JSON.stringify(step)}: ${result.code}`);
    }
    current = result.state;
  }
  return current;
}

type TownStep =
  | "endTurn"
  | "enter"
  | { build: string }
  | { recruit: string; count: number }
  | { give: string; count: number }
  | { take: string; count: number };

function toCommand(step: TownStep): Command {
  const base = { player: 0, townId: "o1" };
  if (step === "endTurn") {
    return { type: "endTurn", player: 0 };
  }
  if (step === "enter") {
    return { type: "moveHero", player: 0, heroId: "A", path: ["SE"] };
  }
  if ("build" in step) {
    return { type: "build", ...base, building: step.build };
  }
  if ("recruit" in step) {
    return { type: "recruit", ...base, creature: step.recruit, count: step.count };
  }
  const from = "give" in step ? "hero" : "garrison";
  const creature = "give" in step ? step.give : step.take;
  return { type: "transfer", ...base, from, creature, count: step.count };
}

function codeOf(state: GameState, step: TownStep): string {
  const result = applyCommand(state, toCommand(step));
  return result.ok ? "ok" : result.code;
}

function eventsOf(state: GameState, step: TownStep): readonly GameEvent[] {
  const result = applyCommand(state, toCommand(step));
  return result.ok ? result.events : [];
}

const town = (state: GameState) => townOf(state, 0);
const gold = (state: GameState) => state.players[0]?.resources.gold;
const days = (count: number): TownStep[] => Array.from({ length: count }, () => "endTurn");

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
  const hero = (state: GameState) => state.heroes[0]?.army;

  it("пока героя нет в городе — отказ; вошёл — можно, и запас хода не тратится", () => {
    const hired = run(townGame(), { recruit: "militia", count: 14 });
    expect(codeOf(hired, { take: "militia", count: 14 })).toBe("HERO_NOT_IN_TOWN");
    const inside = run(hired, "enter");
    const movement = inside.heroes[0]?.movement;
    const next = run(inside, { take: "militia", count: 14 });
    expect(hero(next)).toEqual([{ creature: "militia", count: 24 }]);
    expect(town(next)?.garrison).toEqual([]);
    expect(next.heroes[0]?.movement).toBe(movement);
  });

  it("новый вид существ встаёт в конец армии героя", () => {
    const all = [...START, "slinger-range"];
    const next = run(townGame(all), { recruit: "slinger", count: 9 }, "enter", {
      take: "slinger",
      count: 9,
    });
    expect(hero(next)).toEqual([
      { creature: "militia", count: 10 },
      { creature: "slinger", count: 9 },
    ]);
  });

  it("герой не может отдать последний отряд целиком, но может отдать часть или один из двух", () => {
    const inside = run(townGame(), "enter");
    expect(codeOf(inside, { give: "militia", count: 10 })).toBe("LAST_STACK");
    expect(hero(run(inside, { give: "militia", count: 9 }))).toEqual([
      { creature: "militia", count: 1 },
    ]);
    const two = run(townGame(START, RICH, [], ["militia:10", "slinger:5"]), "enter", {
      give: "militia",
      count: 10,
    });
    expect(hero(two)).toEqual([{ creature: "slinger", count: 5 }]);
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
    expect(hero(next)).toEqual([{ creature: "militia", count: 5 }]);
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
