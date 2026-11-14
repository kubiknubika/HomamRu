// Заклинания в файле и магия в сохранении: docs/mechanics/60-spells.md, 61-magic.md, 04-save.md.
import { applyCommand, SKILL_IDS } from "@homamru/core";
import { gameWith, OPEN_FIELD, SPELLS } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { parseHeroesFile } from "./battle.ts";
import { decodeSave, encodeSave } from "./save.ts";
import {
  defaultGuild,
  parseSpellsFile,
  readSkills,
  readSpellIds,
  savedSpellSchema,
} from "./spells.ts";
import { FULL_STATE, parseTestMap, readTestState, TEST_DEFAULTS } from "./testkit.ts";

const FIELDS = {
  id: "arrow",
  name: "Стрела",
  level: "1",
  schools: "[air]",
  cost: "5",
  power: "10",
  value: "10",
  chance: "30",
  effect: "damage",
  target: "enemy",
  skilledCost: "4",
  values: "[10, 20, 30]",
};

/** Строка файла: стрела с изменёнными или добавленными полями. */
function row(changes: Record<string, string> = {}): string {
  const fields = Object.entries({ ...FIELDS, ...changes });
  return `- { ${fields.map(([key, value]) => `${key}: ${value}`).join(", ")} }`;
}

function errorsOf(text: string): string[] {
  const parsed = parseSpellsFile("data/spells.yaml", text);
  return parsed.ok ? [] : parsed.errors.map((error) => `${error.field}: ${error.message}`);
}

describe("файл заклинаний", () => {
  it("читается; чего не названо — нули и пустой список снимаемых", () => {
    const text =
      "- { id: wipe, name: Снятие, level: 2, schools: [water], cost: 5, skilledCost: 4, values: [0, 0, 0], chance: 0, effect: dispel, target: ally }";
    expect(parseSpellsFile("data/spells.yaml", text)).toEqual({
      ok: true,
      value: [
        {
          id: "wipe",
          name: "Снятие",
          level: 2,
          schools: ["water"],
          cost: 5,
          skilledCost: 4,
          power: 0,
          value: 0,
          chance: 0,
          effect: "dispel",
          target: "ally",
          values: [0, 0, 0],
          expertMass: false,
          advancedAnyTarget: false,
          counters: [],
        },
      ],
    });
  });

  it("круг от 1 до 5; школа, действие и цель — только знакомые", () => {
    expect(errorsOf(row())).toEqual([]);
    expect(errorsOf(row({ level: "5" }))).toEqual([]);
    expect(errorsOf(row({ level: "0" }))[0]).toContain("0.level");
    expect(errorsOf(row({ level: "6" }))[0]).toContain("0.level");
    expect(errorsOf(row({ schools: "[light]" }))[0]).toContain("0.schools");
    expect(errorsOf(row({ schools: "[]" }))[0]).toContain("0.schools");
    expect(errorsOf(row({ effect: "summon" }))[0]).toContain("0.effect");
    expect(errorsOf(row({ target: "all" }))[0]).toContain("0.target");
    expect(errorsOf(row({ cost: "-1" }))[0]).toContain("0.cost");
    expect(errorsOf(row({ colour: "red" }))).toHaveLength(1);
    // Числа с навыком школы (65-hero-skills.md): цена не выше обычной, базовое число — как без навыка.
    expect(errorsOf(row({ skilledCost: "6" }))[0]).toContain("0.skilledCost");
    expect(errorsOf(row({ values: "[11, 20, 30]" }))[0]).toContain("0.values");
    expect(errorsOf(row({ values: "[10, 20]" }))[0]).toContain("0.values");
    expect(errorsOf("[]")).toHaveLength(1);
  });

  it("повтор идентификатора, незнакомое снимаемое, защита без школы — ошибки с местом", () => {
    expect(errorsOf([row(), row()].join("\n"))).toEqual(["1.id: Заклинание «arrow» уже есть."]);
    expect(errorsOf(row({ counters: "[ghost]" }))).toEqual(["0.counters: Заклинания «ghost» нет."]);
    expect(errorsOf(row({ effect: "spellDamagePercent" }))).toEqual([
      "0.protects: Не названа школа, от которой защита.",
    ]);
    expect(errorsOf(row({ effect: "spellDamagePercent", protects: "fire" }))).toEqual([]);
  });
});

const mapAccepted = (hero: string) => parseTestMap("m.yaml", mapText(hero)).ok;
const mapText = (hero: string) =>
  [
    "id: test",
    "name: Проверка",
    `terrain: [${Array.from({ length: 8 }, () => '"........"').join(", ")}]`,
    "players:",
    `  - hero: { x: 1, y: 1, army: [{ creature: militia, count: 10 }]${hero} }`,
  ].join("\n");

describe("магия героя в файлах героев и карты", () => {
  it("сила магии и знание героя: не названы — по единице", () => {
    const rows = [
      "- { id: a, name: А, attack: 1, defense: 0 }",
      "- { id: b, name: Б, attack: 0, defense: 1, spellPower: 3, knowledge: 2 }",
      "- { id: c, name: В, attack: 2, defense: 2 }",
    ];
    expect(parseHeroesFile("data/heroes.yaml", rows.join("\n"))).toMatchObject({
      ok: true,
      value: [
        { spellPower: 1, knowledge: 1 },
        { spellPower: 3, knowledge: 2 },
        { spellPower: 1, knowledge: 1 },
      ],
    });
  });

  it("карта может дать герою книгу и заклинания", () => {
    expect(mapAccepted(", book: true, spells: [slow], knowledge: 4")).toBe(true);
    expect(mapAccepted(", book: yes-please")).toBe(false);
    expect(mapAccepted(", knowledge: -1")).toBe(false);
  });
});

describe("набор гильдии без жребия", () => {
  it("в каждом круге — заклинания с наибольшим шансом, сколько даёт гильдия", () => {
    expect(defaultGuild(SPELLS)).toEqual(["magic-arrow", "shield", "dispel", "cure", "bless"]);
    const second = SPELLS.map((spell) => ({ ...spell, id: `${spell.id}-2`, level: 2 }));
    expect(defaultGuild([...SPELLS, ...second])).toHaveLength(9);
    expect(defaultGuild([])).toEqual([]);
  });

  it("список заклинаний из записи: незнакомые и повторы убираются; не список — null", () => {
    expect(readSpellIds(["slow", "fireball", "slow", 7, "cure"], SPELLS)).toEqual(["slow", "cure"]);
    expect(readSpellIds("slow", SPELLS)).toBeNull();
    expect(readSpellIds(undefined, SPELLS)).toBeNull();
  });
});

const stateWith = (changes: object) => readTestState({ ...FULL_STATE, ...changes });
const heroWith = (changes: object) =>
  stateWith({ heroes: [{ ...FULL_STATE.heroes[0], ...changes }, FULL_STATE.heroes[1]] })?.heroes[0];

const townWith = (changes: object) =>
  stateWith({ objects: [{ ...FULL_STATE.objects[3], ...changes }] })?.objects[0];

describe("магия в сохранении", () => {
  it("запись с магией и покупкой книги загружается без изменений", () => {
    const commands = [{ type: "buyBook", player: 1, townId: "o5" }] as const;
    const body = { gameVersion: "test", initial: FULL_STATE, commands, state: FULL_STATE };
    expect(decodeSave(encodeSave(body, 2), TEST_DEFAULTS)).toEqual({
      kind: "ok",
      record: { ...body, seq: 2, adapted: false },
    });
  });

  it("герой из записи до этапа 7: сила магии 1, знание 1, мана полная, книги нет", () => {
    const heroes = FULL_STATE.heroes.map(
      ({ spellPower: _p, knowledge: _k, mana: _m, book: _b, spells: _s, ...rest }) => rest,
    );
    expect(stateWith({ heroes })?.heroes).toMatchObject([
      { spellPower: 1, knowledge: 1, mana: 10, book: false, spells: [] },
      { spellPower: 1, knowledge: 1, mana: 10, book: false, spells: [] },
    ]);
  });

  it("герой из записи до навыков (версия 9): навыков нет, выбирать нечего", () => {
    const heroes = FULL_STATE.heroes.map(
      ({ skills: _s, skillOffer: _o, skillsOwed: _w, ...rest }) => rest,
    );
    expect(stateWith({ version: 9, heroes })?.heroes).toMatchObject([
      { skills: [], skillOffer: [], skillsOwed: 0 },
      { skills: [], skillOffer: [], skillsOwed: 0 },
    ]);
  });

  it("навыки из записи: незнакомые, повторы и неверные уровни убираются; не больше восьми", () => {
    const skills = [
      { id: "wisdom", level: 2 },
      { id: "flying", level: 1 },
      { id: "wisdom", level: 3 },
      { id: "sorcery", level: 4 },
      { id: "mysticism", level: 1 },
      "мусор",
    ];
    expect(heroWith({ skills })?.skills).toEqual([
      { id: "wisdom", level: 2 },
      { id: "mysticism", level: 1 },
    ]);
    expect(heroWith({ skills: "все" })?.skills).toEqual([]);
    expect(readSkills(SKILL_IDS.map((id) => ({ id, level: 3 })))).toHaveLength(8);
    expect(
      heroWith({ skillOffer: ["wisdom", "flying", "wisdom", 5], skillsOwed: -1 }),
    ).toMatchObject({ skillOffer: ["wisdom"], skillsOwed: 0 });
    expect(heroWith({ skillOffer: ["sorcery", "wisdom"], skillsOwed: 2 })).toMatchObject({
      skillOffer: ["sorcery", "wisdom"],
      skillsOwed: 2,
    });
  });

  it("запас маны из записи считается с «Интеллектом»", () => {
    const skills = [{ id: "intelligence", level: 3 }];
    expect(heroWith({ knowledge: 3, mana: 99, skills })?.mana).toBe(60);
    expect(heroWith({ knowledge: 3, mana: 45, skills })?.mana).toBe(45);
  });

  it("запись с выбором навыка загружается без изменений", () => {
    const commands = [{ type: "chooseSkill", player: 0, heroId: "A", skill: "wisdom" }] as const;
    const body = { gameVersion: "test", initial: FULL_STATE, commands, state: FULL_STATE };
    expect(decodeSave(encodeSave(body, 2), TEST_DEFAULTS)).toMatchObject({ kind: "ok" });
  });

  it("заклинание в записи боя до навыков: цена и числа с навыком — как без навыка", () => {
    const [arrow] = SPELLS;
    const old: Record<string, unknown> = { ...arrow };
    for (const key of ["skilledCost", "values", "expertMass", "advancedAnyTarget"]) {
      delete old[key];
    }
    expect(savedSpellSchema.parse(old)).toMatchObject({
      cost: 5,
      skilledCost: 5,
      value: 10,
      values: [10, 10, 10],
      expertMass: false,
      advancedAnyTarget: false,
    });
    expect(savedSpellSchema.parse(arrow)).toEqual(arrow);
  });

  it("карта может дать герою навыки", () => {
    expect(mapAccepted(", skills: [{ id: wisdom, level: 2 }]")).toBe(true);
    expect(mapAccepted(", skills: [{ id: wisdom, level: 4 }]")).toBe(false);
    expect(mapAccepted(", skills: [{ id: flying, level: 1 }]")).toBe(false);
  });

  it("маны не больше запаса; не названа — полная", () => {
    expect(heroWith({ knowledge: 3, mana: 31 })?.mana).toBe(30);
    expect(heroWith({ knowledge: 3, mana: 30 })?.mana).toBe(30);
    expect(heroWith({ knowledge: 3, mana: 0 })?.mana).toBe(0);
    expect(heroWith({ knowledge: 3, mana: undefined })?.mana).toBe(30);
    expect(heroWith({ knowledge: 0, mana: 5 })?.mana).toBe(0);
  });

  it("без книги заклинаний нет; незнакомые заклинания убираются", () => {
    expect(heroWith({ book: false })?.spells).toEqual([]);
    expect(heroWith({ spells: ["slow", "fireball", "slow"] })?.spells).toEqual(["slow"]);
    expect(heroWith({ spells: "все" })?.spells).toEqual([]);
  });

  it("испорченные числа магии — начальные значения, запись читается", () => {
    expect(heroWith({ spellPower: "много", knowledge: -2, book: "да" })).toMatchObject({
      spellPower: 1,
      knowledge: 1,
      book: false,
    });
  });

  it("город без набора гильдии получает набор без жребия; незнакомые заклинания убираются", () => {
    expect(townWith({ spells: undefined })).toMatchObject({
      spells: ["magic-arrow", "shield", "dispel", "cure", "bless"],
    });
    expect(townWith({ spells: ["slow", "fireball", "slow"] })).toMatchObject({ spells: ["slow"] });
    expect(townWith({ spells: [] })).toMatchObject({ spells: [] });
  });

  it("заклинания партии: записанные остаются, недостающие берутся из игры", () => {
    const [arrow, ...rest] = SPELLS;
    const costly = { ...arrow, cost: 9 };
    expect(stateWith({ spells: [costly] })?.spells).toEqual([costly, ...rest]);
    expect(stateWith({ spells: undefined })?.spells).toEqual(SPELLS);
    expect(stateWith({ spells: [{ id: "broken" }, 5] })?.spells).toEqual(SPELLS);
  });
});

describe("бой с магией в сохранении", () => {
  const guard = { type: "guard", x: 4, y: 0, creature: "militia", count: 15 } as const;
  const fresh = gameWith(OPEN_FIELD, [guard], { army: ["falcon:40"] });
  const mage = {
    ...fresh,
    heroes: fresh.heroes.map((hero) => ({ ...hero, book: true, spells: ["bless", "magic-arrow"] })),
  };
  const moved = applyCommand(mage, {
    type: "moveHero",
    player: 0,
    heroId: "A",
    path: ["E", "E", "E"],
  });
  const entered = moved.ok ? moved.state : mage;
  const cast = applyCommand(entered, { type: "battleCast", side: 0, spell: "bless", target: "a1" });
  const blessed = cast.ok ? cast.state : entered;

  it("бой с действием заклинания и потраченной маной читается без изменений", () => {
    expect(blessed.battle?.state.stacks[0]?.effects).toHaveLength(1);
    expect(blessed.battle?.state.sides[0]).toMatchObject({ cast: true, hero: { mana: 5 } });
    expect(readTestState(blessed)).toEqual(blessed);
  });

  it("бой из записи до этапа 7: героя магии нет, никто не колдовал, действий нет", () => {
    const battle = entered.battle?.state;
    const old = {
      ...battle,
      sides: battle?.sides.map(({ cast: _cast, hero, ...side }) => ({
        ...side,
        hero: hero === null ? null : { attack: hero.attack, defense: hero.defense },
      })),
      stacks: battle?.stacks.map(({ effects: _effects, ...stack }) => stack),
    };
    const read = readTestState({ ...entered, battle: { ...entered.battle, state: old } });
    expect(read?.battle?.state.sides[0]).toMatchObject({
      cast: false,
      hero: { spellPower: 0, mana: 0, spells: [] },
    });
    expect(read?.battle?.state.stacks.every((stack) => stack.effects.length === 0)).toBe(true);
  });

  it("испорченное действие заклинания — бой сбрасывается, запись читается", () => {
    const battle = blessed.battle?.state;
    const stacks = battle?.stacks.map((stack) => ({ ...stack, effects: [{ spell: 5 }] }));
    const read = readTestState({
      ...blessed,
      battle: { ...blessed.battle, state: { ...battle, stacks } },
    });
    expect(read).not.toBeNull();
    expect(read?.battle).toBeNull();
  });
});
