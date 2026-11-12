// Герои и таверна в файлах и в сохранении: docs/mechanics/32-hero-hire.md, 04-save.md.
import { CONTENT, HEROES, TAVERN } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { parseHeroesFile } from "./battle.ts";
import { parseDefaultsFile } from "./defaults.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { FULL_STATE, parseTestMap, readTestState, TEST_DEFAULTS } from "./testkit.ts";

const HERO_ROWS = [
  "- { id: a, name: А, attack: 1, defense: 0 }",
  "- { id: b, name: Б, attack: 0, defense: 1 }",
  "- { id: c, name: В, attack: 2, defense: 2 }",
];
const DEFAULTS_TEXT = (rule: string) =>
  `heroArmy: [{ creature: militia, count: 10 }]\ntavern:\n  price: 2500\n  army:\n    - ${rule}\nopponent: { advantagePercent: 150, buildOrder: [tavern] }`;
const SURE = "{ creature: militia, min: 10, max: 20, chance: 100 }";

function defaultsErrors(rule: string): string[] {
  const parsed = parseDefaultsFile("data/defaults.yaml", DEFAULTS_TEXT(rule), CONTENT);
  return parsed.ok ? [] : parsed.errors.map((error) => `${error.field}: ${error.message}`);
}

const mapWith = (hero: string) =>
  [
    "id: test",
    "name: Проверка",
    `terrain: [${Array.from({ length: 8 }, () => '"........"').join(", ")}]`,
    "players:",
    `  - hero: { x: 1, y: 1, army: [{ creature: militia, count: 10 }]${hero} }`,
  ].join("\n");

const stateWith = (changes: object) => readTestState({ ...FULL_STATE, ...changes });
const tavernOf = (raw: unknown) => readTestState(raw)?.players[1]?.tavern;

describe("файл героев", () => {
  it("читается", () => {
    expect(parseHeroesFile("data/heroes.yaml", HERO_ROWS.join("\n"))).toMatchObject({
      ok: true,
      value: [{ id: "a", name: "А", attack: 1, defense: 0 }, { id: "b" }, { id: "c" }],
    });
  });

  it("героев меньше трёх или идентификатор повторяется — ошибка", () => {
    expect(parseHeroesFile("data/heroes.yaml", HERO_ROWS.slice(0, 2).join("\n")).ok).toBe(false);
    const twice = [...HERO_ROWS, HERO_ROWS[0]].join("\n");
    expect(parseHeroesFile("data/heroes.yaml", twice)).toMatchObject({
      ok: false,
      errors: [{ field: "3.id", message: "Герой «a» уже есть." }],
    });
  });
});

describe("правила таверны в файле начальных значений", () => {
  it("читаются; контент игры собирается целиком", () => {
    const parsed = parseDefaultsFile("data/defaults.yaml", DEFAULTS_TEXT(SURE), CONTENT);
    expect(parsed).toMatchObject({
      ok: true,
      value: { heroes: HEROES, tavern: { price: 2500, army: [{ creature: "militia" }] } },
    });
  });

  it.each([
    ["неизвестное существо", SURE.replace("militia", "dragon")],
    ["«от» больше «до»", SURE.replace("min: 10", "min: 30")],
    ["нет отряда, который есть всегда", SURE.replace("100", "88")],
    ["шанс больше 100", SURE.replace("100", "101")],
  ])("отвергаются: %s", (_, rule) => {
    expect(defaultsErrors(rule)).not.toEqual([]);
  });
});

const withOpponent = (opponent: string) =>
  parseDefaultsFile(
    "data/defaults.yaml",
    DEFAULTS_TEXT(SURE).replace(/opponent: .*$/, `opponent: ${opponent}`),
    CONTENT,
  );

describe("настройки компьютерного игрока", () => {
  it("читаются из файла начальных значений", () => {
    expect(withOpponent("{ advantagePercent: 150, buildOrder: [tavern, fort] }")).toMatchObject({
      ok: true,
      value: { opponent: { advantagePercent: 150, buildOrder: ["tavern", "fort"] } },
    });
  });

  it("незнакомое здание в списке стройки — ошибка с местом", () => {
    expect(withOpponent("{ advantagePercent: 150, buildOrder: [tavern, palace] }")).toMatchObject({
      ok: false,
      errors: [{ field: "opponent.buildOrder.1", message: "Здания «palace» нет." }],
    });
  });

  it("перевес не целый или меньше 100 — ошибка", () => {
    expect(withOpponent("{ advantagePercent: 1.5, buildOrder: [tavern] }").ok).toBe(false);
    expect(withOpponent("{ advantagePercent: 99, buildOrder: [tavern] }").ok).toBe(false);
  });

  it("в сохранении: записанные остаются; нет, не читаются или здание незнакомо — из игры", () => {
    const written = { advantagePercent: 200, buildOrder: ["fort"] };
    expect(stateWith({ opponent: written })?.opponent).toEqual(written);
    expect(stateWith({ opponent: undefined })?.opponent).toEqual(TEST_DEFAULTS.opponent);
    expect(stateWith({ opponent: { advantagePercent: "много" } })?.opponent).toEqual(
      TEST_DEFAULTS.opponent,
    );
    expect(stateWith({ opponent: { ...written, buildOrder: ["palace"] } })?.opponent).toEqual(
      TEST_DEFAULTS.opponent,
    );
  });
});

describe("имя героя в файле карты", () => {
  it("знакомое имя принимается, незнакомое — ошибка с местом", () => {
    expect(parseTestMap("data/maps/test.yaml", mapWith(", name: velena"))).toMatchObject({
      ok: true,
    });
    expect(parseTestMap("data/maps/test.yaml", mapWith(", name: merlin"))).toMatchObject({
      ok: false,
      errors: [{ field: "players.0.hero.name", message: "Героя «merlin» нет." }],
    });
  });
});

describe("герои и таверна в сохранении", () => {
  it("запись с таверной и командой найма загружается без изменений", () => {
    const commands = [{ type: "hireHero", player: 1, townId: "o5", offer: 1 }] as const;
    const body = { gameVersion: "test", initial: FULL_STATE, commands, state: FULL_STATE };
    expect(decodeSave(encodeSave(body, 2), TEST_DEFAULTS)).toEqual({
      kind: "ok",
      record: { ...body, seq: 2, adapted: false },
    });
  });

  it("у героя из записи до шага 4.2 имени нет — он первый герой списка", () => {
    const heroes = FULL_STATE.heroes.map(({ kind: _kind, name: _name, ...rest }) => rest);
    expect(stateWith({ heroes })?.heroes.map((hero) => [hero.kind, hero.name])).toEqual([
      ["ratibor", "Ратибор"],
      ["ratibor", "Ратибор"],
    ]);
  });

  it("незнакомый герой заменяется первым из списка вместе с именем", () => {
    const heroes = [{ ...FULL_STATE.heroes[0], kind: "merlin", name: "Мерлин" }];
    expect(stateWith({ heroes })?.heroes[0]).toMatchObject({ kind: "ratibor", name: "Ратибор" });
  });

  it("списка героев и правил таверны в записи нет — берутся из игры", () => {
    const state = stateWith({ heroKinds: undefined, tavern: undefined });
    expect(state).toMatchObject({ heroKinds: HEROES, tavern: TAVERN });
    // Правила с незнакомым существом целиком заменяются правилами игры.
    const alien = { price: 1, army: [{ creature: "dragon", min: 1, max: 2, chance: 100 }] };
    expect(stateWith({ tavern: alien })?.tavern).toEqual(TAVERN);
    const cheap = { ...TAVERN, price: 100, happyHour: true };
    expect(stateWith({ tavern: cheap })?.tavern).toEqual({ ...TAVERN, price: 100 });
  });

  it("таверны в записи нет — два первых свободных героя с наименьшей армией", () => {
    const players = FULL_STATE.players.map(({ tavern: _tavern, ...rest }) => rest);
    // У игрока 2 герой Горислав; у игрока 1 города нет — и таверны нет.
    expect(stateWith({ players })?.players.map((player) => player.tavern)).toEqual([
      [],
      [
        { kind: "ratibor", army: [{ creature: "militia", count: 10 }] },
        { kind: "velena", army: [{ creature: "militia", count: 10 }] },
      ],
    ]);
  });

  it("в таверне не остаётся героя игрока, повторов, незнакомых героев и существ", () => {
    const army = [{ creature: "militia", count: 12 }];
    const tavern = [
      { kind: "gorislav", army },
      { kind: "merlin", army },
      { kind: "zhdana", army: [{ creature: "dragon", count: 1 }, ...army] },
      { kind: "zhdana", army },
      { kind: "milava", army: [] },
      { kind: "svetozar", army },
      { kind: "milava", army },
    ];
    const players = [FULL_STATE.players[0], { ...FULL_STATE.players[1], tavern }];
    expect(tavernOf({ ...FULL_STATE, players })).toEqual([
      { kind: "zhdana", army },
      { kind: "svetozar", army },
    ]);
  });

  it("города нет — таверна пуста, что бы ни было записано", () => {
    expect(tavernOf({ ...FULL_STATE, objects: [] })).toEqual([]);
  });
});
