// Заклинания карты на экране: docs/mechanics/73-map-spells.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame } from "@homamru/core";
import type {
  ArmyStack,
  GameState,
  HeroSkill,
  HeroState,
  MapObjectDefinition,
} from "@homamru/core";
import { describe, expect, it } from "vitest";
import { describeCell } from "./captions.ts";
import { loadDefaults } from "./content.ts";
import { bookLine, dayEffects, mapSpellRows } from "./mapSpellTexts.ts";
import { createSession } from "./session.ts";

const START = ["tavern", "fort", "militia-yard"];
const HOME: MapObjectDefinition = { type: "town", x: 0, y: 4, owner: 0, buildings: START };
const THEIRS = { type: "town", x: 4, y: 4, owner: 1, buildings: START } as const;
const GUARD: MapObjectDefinition = { type: "guard", x: 2, y: 2, creature: "militia", count: 17 };
const militia = (count: number): ArmyStack[] => [{ creature: "militia", count }];
const MAGE = {
  book: true,
  spells: ["visions", "disguise", "town-portal"],
  spellPower: 2,
  mana: 50,
};

/** Игрок-маг — герой A в (0, 0); противник-компьютер — герой B в (4, 0), его город в (4, 4). */
function game(mine: Partial<HeroState> = {}, theirs: Partial<HeroState> = {}): GameState {
  const created = createGame(
    {
      id: "duel",
      name: "Двое",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        { hero: { x: 0, y: 0, army: militia(100) }, resources: { gold: 20_000 } },
        { hero: { x: 4, y: 0, attack: 1, defense: 2, army: militia(12) }, kind: "computer" },
      ],
      objects: [HOME, { ...THEIRS, garrison: militia(12) } as MapObjectDefinition, GUARD],
    },
    1,
    { ...CONTENT, spells: loadDefaults().spells, creatures: loadDefaults().creatures },
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return {
    ...created.state,
    heroes: created.state.heroes.map((hero) =>
      hero.owner === 0 ? { ...hero, ...MAGE, ...mine } : { ...hero, ...theirs },
    ),
  };
}

const skill = (id: HeroSkill["id"], level: HeroSkill["level"]): { skills: HeroSkill[] } => ({
  skills: [{ id, level }],
});
const mine = (state: GameState): HeroState =>
  state.heroes.find((hero) => hero.owner === 0) as HeroState;

describe("окно «Колдовать»", () => {
  it("строки: название, цена, что сделает; недоступное — с причиной", () => {
    const state = game({ mana: 10 });
    expect(mapSpellRows(state, mine(state)).map((row) => [row.line, row.reason])).toEqual([
      ["Видения — 4 маны — карта: до конца дня точные числа охранников не дальше 3 клеток", null],
      [
        "Маскировка — 4 маны — карта: до конца дня противник видит все ваши отряды как сильнейший из них",
        null,
      ],
      [
        "Городской портал — 16 маны — карта: переносит в ближайший свой город, запас хода −300",
        "не хватает маны",
      ],
    ]);
  });

  it("с навыками: цена, дальность и выбор города", () => {
    const state = game({ spellPower: 4, skills: [...skill("earth-magic", 3).skills] });
    const rows = mapSpellRows(state, mine(state));
    expect(rows[0]?.line).toBe(
      "Видения — 2 маны — карта: до конца дня точные числа охранников, армий героев и гарнизонов противника не дальше 12 клеток",
    );
    expect(rows[2]?.line).toBe(
      "Городской портал — 12 маны — карта: переносит в свой город по выбору, запас хода −200",
    );
    expect(rows[2]?.towns.map((town) => town.id)).toEqual(["o1"]);
  });

  it("причины: запас хода, герой в ближайшем городе, уже действует", () => {
    const tired = game({ movement: 100 });
    expect(mapSpellRows(tired, mine(tired))[2]?.reason).toBe("не хватает запаса хода");
    const home = game({ x: 0, y: 4 });
    expect(mapSpellRows(home, mine(home))[2]?.reason).toBe("в ближайшем городе стоит герой");
    const seeing = game({ visions: 1 });
    expect(mapSpellRows(seeing, mine(seeing))[0]?.reason).toBe("уже действует");
  });

  it("в книге героя заклинание карты помечено словом «карта», боевое — как раньше", () => {
    const [arrow] = loadDefaults().spells;
    const hero = { spellPower: 2, skills: [] };
    expect(arrow && bookLine(arrow, hero)).toBe("Волшебная стрела — 5 маны — урон 30");
  });
});

describe("колдовство с карты", () => {
  it("портал: герой в городе, сообщение, строка панели — для действий на день", () => {
    const session = createSession(game());
    session.castMap("town-portal");
    const { state, notice } = session.getSnapshot();
    expect(mine(state)).toMatchObject({ x: 0, y: 4, mana: 34, movement: 700 });
    expect(notice?.lines).toEqual(["Городской портал: мана −16"]);
    session.castMap("visions");
    session.castMap("disguise");
    const after = session.getSnapshot();
    expect(after.notice?.lines).toEqual(["Маскировка: мана −4"]);
    expect(dayEffects(mine(after.state))).toEqual([
      "Видения до конца дня",
      "Маскировка до конца дня",
    ]);
    expect(dayEffects(mine(game()))).toEqual([]);
  });

  it("сообщение «Видений» — с дальностью", () => {
    const session = createSession(game());
    session.castMap("visions");
    expect(session.getSnapshot().notice?.lines).toEqual(["Видения: дальность 3, мана −4"]);
  });
});

describe("подписи с «Видениями»", () => {
  const guard = { x: 2, y: 2 };
  const hero = { x: 4, y: 0 };
  const town = { x: 4, y: 4 };

  it("без «Видений» — словами", () => {
    const state = game();
    expect(describeCell(state, guard)).toBe("Охранник: группа ополченцев (10–19)");
  });

  it("базовые: точное число охранника в дальности; герой и город — словами", () => {
    const state = game({ visions: 1 });
    expect(describeCell(state, guard)).toBe("Охранник: 17 ополченцев (группа)");
    expect(describeCell(state, hero)).toBe(
      "Герой противника: Ратибор. Армия: группа ополченцев (10–19)",
    );
    // Дальше трёх клеток по прямой — словами.
    const far = game({ visions: 1, x: 0, y: 7 });
    expect(describeCell(far, guard)).toBe("Охранник: группа ополченцев (10–19)");
  });

  it("продвинутые: характеристики и армия героя противника; экспертные — и гарнизон", () => {
    const advanced = game({ visions: 2, spellPower: 4 });
    expect(describeCell(advanced, hero)).toBe(
      "Герой противника: Ратибор. Атака 1, защита 2, сила магии 1, знание 1. Армия: 12 ополченцев (группа)",
    );
    expect(describeCell(advanced, town)).toBe(
      "Город противника. Гарнизон: группа ополченцев (10–19)",
    );
    const expert = game({ visions: 3, spellPower: 4 });
    expect(describeCell(expert, town)).toBe("Город противника. Гарнизон: 12 ополченцев (группа)");
  });
});

describe("подписи с «Маскировкой» противника", () => {
  const army = [
    { creature: "militia", count: 30 },
    { creature: "falcon", count: 5 },
  ];
  const hero = { x: 4, y: 0 };

  it("базовая: все отряды — сильнейшее существо армии, слова о числе настоящие", () => {
    expect(describeCell(game({}, { army, disguise: 1 }), hero)).toBe(
      "Герой противника: Ратибор. Армия: много соколов (20–49), несколько соколов (5–9)",
    );
  });

  it("продвинутая: вместо численности «0»; экспертная: существо города; «Видения» видят подделку", () => {
    expect(describeCell(game({}, { army, disguise: 2 }), hero)).toBe(
      "Герой противника: Ратибор. Армия: 0 соколов, 0 соколов",
    );
    expect(describeCell(game({ visions: 2, spellPower: 4 }, { army, disguise: 3 }), hero)).toBe(
      "Герой противника: Ратибор. Атака 1, защита 2, сила магии 1, знание 1. Армия: 0 грив, 0 грив",
    );
    expect(describeCell(game({ visions: 2, spellPower: 4 }, { army, disguise: 1 }), hero)).toBe(
      "Герой противника: Ратибор. Атака 1, защита 2, сила магии 1, знание 1. Армия: 30 соколов (много), 5 соколов (несколько)",
    );
  });
});
