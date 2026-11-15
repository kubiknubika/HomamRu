// Заклинания карты: docs/mechanics/73-map-spells.md.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { mapSpellProblem, mapSpellsOf, portalTowns, shownArmy, visionsAt } from "./mapSpells.ts";
import { GAME_SPELLS } from "./spellKit.ts";
import { gameWith } from "./testkit.ts";
import type { HeroSkill } from "./skills.ts";
import type {
  Command,
  CommandResult,
  GameState,
  HeroState,
  MapObjectDefinition,
  TownState,
} from "./types.ts";

const FIELD = [
  "S.........",
  ..."..........,"
    .repeat(9)
    .split(",")
    .filter((row) => row !== ""),
];
const NEAR = { type: "town", x: 3, y: 0, owner: 0, buildings: ["tavern"] } as const;
const FAR = { x: 9, y: 9, owner: 0 };
const LEVELS: Record<string, number> = { militia: 1, slinger: 2, falcon: 3, armsman: 4 };
const MAGE = {
  book: true,
  spells: ["visions", "disguise", "town-portal"],
  spellPower: 2,
  knowledge: 5,
  mana: 50,
};

type TownSpot = { readonly x: number; readonly y: number; readonly owner: number };

/** Партия с магом; карта допускает один город игрока, поэтому остальные добавлены в обход. */
function game(
  changes: Partial<HeroState> = {},
  towns: readonly TownSpot[] = [NEAR, FAR],
  extra: readonly MapObjectDefinition[] = [],
): GameState {
  const state = gameWith(FIELD, [NEAR, ...extra], { army: ["militia:30", "armsman:5"] });
  const sample = state.objects.find((object) => object.type === "town");
  const objects = [
    ...towns.map((town, index) => ({ ...sample, ...town, id: `o${index + 1}` }) as TownState),
    ...state.objects.filter((object) => object.type !== "town"),
  ];
  return {
    ...state,
    objects,
    spells: GAME_SPELLS,
    // Уровни существ — как в файлах игры.
    creatures: state.creatures.map((creature) => ({ ...creature, level: LEVELS[creature.id] })),
    heroes: state.heroes.map((hero) => ({ ...hero, ...MAGE, ...changes })),
  };
}

const skills = (id: HeroSkill["id"], level: HeroSkill["level"]): { skills: HeroSkill[] } => ({
  skills: [{ id, level }],
});

function cast(state: GameState, spell: string, townId?: string): CommandResult {
  const command: Command = { type: "castMap", player: 0, heroId: "A", spell };
  return applyCommand(state, townId === undefined ? command : { ...command, townId });
}

function done(state: GameState, spell: string, townId?: string): GameState {
  const result = cast(state, spell, townId);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}

const heroOf = (state: GameState): HeroState => {
  const [hero] = state.heroes;
  if (hero === undefined) {
    throw new Error("Героя нет.");
  }
  return hero;
};

/** Второй герой — того же или другого игрока — в данной клетке. */
function withSecond(state: GameState, changes: Partial<HeroState>): GameState {
  return { ...state, heroes: [heroOf(state), { ...heroOf(state), id: "B", ...changes }] };
}

describe("городской портал", () => {
  it("без навыка: в ближайший свой город, мана −16, запас хода −300", () => {
    const state = game({ x: 5, y: 2, movement: 450 });
    const result = cast(state, "town-portal");
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: "mapSpellCast", spell: "town-portal", mana: 16, townId: "o1" }],
    });
    expect(heroOf(done(state, "town-portal"))).toMatchObject({
      x: 3,
      y: 0,
      mana: 34,
      movement: 150,
    });
  });

  it("запаса хода меньше 300 — отказ; ровно 300 — можно", () => {
    expect(cast(game({ x: 5, y: 2, movement: 299 }), "town-portal")).toMatchObject({
      ok: false,
      code: "NOT_ENOUGH_MOVEMENT",
    });
    expect(heroOf(done(game({ x: 5, y: 2, movement: 300 }), "town-portal")).movement).toBe(0);
  });

  it("в ближайшем городе стоит герой — отказ, дальний город не подставляется", () => {
    const state = withSecond(game({ x: 5, y: 2 }), { x: 3, y: 0 });
    expect(cast(state, "town-portal")).toMatchObject({ ok: false, code: "TOWN_OCCUPIED" });
    expect(mapSpellProblem(state, heroOf(state), spellOf(state, "town-portal"))).toBe(
      "в ближайшем городе стоит герой",
    );
    // Сам стоит в ближайшем городе — тоже нельзя.
    expect(cast(game({ x: 3, y: 0 }), "town-portal")).toMatchObject({ code: "TOWN_OCCUPIED" });
  });

  it("без продвинутой земли город не выбирают", () => {
    const basic = game({ x: 5, y: 2, ...skills("earth-magic", 1) });
    expect(cast(basic, "town-portal", "o2")).toMatchObject({ ok: false, code: "TOWN_OCCUPIED" });
    expect(portalTowns(basic, heroOf(basic)).map((town) => town.id)).toEqual(["o1"]);
  });

  it("продвинутая земля: любой свободный свой город по выбору, мана −12, запас хода −300", () => {
    const state = withSecond(game({ x: 5, y: 2, ...skills("earth-magic", 2) }), { x: 3, y: 0 });
    expect(portalTowns(state, heroOf(state)).map((town) => town.id)).toEqual(["o2"]);
    expect(cast(state, "town-portal", "o1")).toMatchObject({ ok: false, code: "TOWN_OCCUPIED" });
    expect(heroOf(done(state, "town-portal", "o2"))).toMatchObject({
      x: 9,
      y: 9,
      mana: 38,
      movement: 700,
    });
  });

  it("продвинутая земля, свободных городов два — без выбора отказ", () => {
    const state = game({ x: 5, y: 2, ...skills("earth-magic", 2) });
    expect(cast(state, "town-portal")).toMatchObject({ ok: false, code: "NO_TOWN" });
  });

  it("экспертная земля: нужно и тратится 200 очков", () => {
    const state = game({ x: 5, y: 2, movement: 200, ...skills("earth-magic", 3) });
    expect(heroOf(done(state, "town-portal", "o2"))).toMatchObject({ x: 9, y: 9, movement: 0 });
  });

  it("своих городов нет или город чужой — отказ", () => {
    expect(cast(game({}, []), "town-portal")).toMatchObject({ ok: false, code: "NO_TOWN" });
    const foreign = game({ ...skills("earth-magic", 2) }, [NEAR, { ...FAR, owner: 1 }]);
    expect(cast(foreign, "town-portal", "o2")).toMatchObject({ ok: false, code: "TOWN_OCCUPIED" });
  });

  it("отказ ничего не тратит; мало маны, нет книги, нет заклинания — отказы", () => {
    expect(cast(game({ mana: 15 }), "town-portal")).toMatchObject({ code: "NOT_ENOUGH_MANA" });
    expect(cast(game({ book: false }), "town-portal")).toMatchObject({ code: "UNKNOWN_SPELL" });
    expect(cast(game({ spells: ["visions"] }), "town-portal")).toMatchObject({
      code: "UNKNOWN_SPELL",
    });
    expect(cast(game(), "magic-arrow")).toMatchObject({ code: "UNKNOWN_SPELL" });
    const other: Command = { type: "castMap", player: 0, heroId: "Z", spell: "visions" };
    expect(applyCommand(game(), other)).toMatchObject({ code: "UNKNOWN_HERO" });
  });

  it("в городе с гильдией герой после портала учит её заклинания", () => {
    const guild = { ...NEAR, buildings: ["tavern", "mage-guild"] };
    const state = game({ x: 5, y: 2, spells: ["town-portal"] }, [guild]);
    const result = cast(state, "town-portal");
    expect(result.ok && result.events.map((event) => event.type)).toEqual([
      "mapSpellCast",
      "spellsLearned",
    ]);
  });
});

function spellOf(state: GameState, id: string) {
  const found = mapSpellsOf(state, heroOf(state)).find((spell) => spell.id === id);
  if (found === undefined) {
    throw new Error(`Заклинания «${id}» нет.`);
  }
  return found;
}

describe("видения", () => {
  it("без навыка: уровень 1, мана −4, дальность — сила магии, но не меньше 3", () => {
    const weak = done(game({ x: 5, y: 5, spellPower: 2 }), "visions");
    expect(heroOf(weak)).toMatchObject({ visions: 1, mana: 46 });
    // По прямой: 3 клетки — видно, 3 по диагонали (√18) — нет.
    expect(visionsAt(weak, 0, { x: 8, y: 5 })).toBe(1);
    expect(visionsAt(weak, 0, { x: 7, y: 7 })).toBe(1);
    expect(visionsAt(weak, 0, { x: 8, y: 8 })).toBe(0);
    expect(visionsAt(weak, 0, { x: 9, y: 5 })).toBe(0);
    const strong = done(game({ x: 0, y: 0, spellPower: 5 }), "visions");
    expect(visionsAt(strong, 0, { x: 5, y: 0 })).toBe(1);
    expect(visionsAt(strong, 0, { x: 6, y: 0 })).toBe(0);
  });

  it("с навыком школы: мана −2; продвинутый — уровень 2 и дальность × 2, экспертный — 3 и × 3", () => {
    const advanced = done(game({ x: 0, y: 0, ...skills("fire-magic", 2) }), "visions");
    expect(heroOf(advanced)).toMatchObject({ visions: 2, mana: 48 });
    expect(visionsAt(advanced, 0, { x: 4, y: 0 })).toBe(2);
    expect(visionsAt(advanced, 0, { x: 5, y: 0 })).toBe(0);
    const expert = done(game({ x: 0, y: 0, ...skills("water-magic", 3) }), "visions");
    expect(visionsAt(expert, 0, { x: 6, y: 0 })).toBe(3);
    expect(visionsAt(expert, 1, { x: 1, y: 0 })).toBe(0);
  });

  it("идут вместе с героем и кончаются с днём", () => {
    const state = done(game({ x: 0, y: 0 }), "visions");
    const moved = applyCommand(state, {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["S", "S"],
    });
    expect(moved.ok && visionsAt(moved.state, 0, { x: 0, y: 5 })).toBe(1);
    const next = applyCommand(state, { type: "endTurn", player: 0 });
    expect(next.ok && heroOf(next.state)).toMatchObject({ visions: 0, disguise: 0 });
  });

  it("уже действуют — отказ, мана цела", () => {
    const state = done(game(), "visions");
    expect(cast(state, "visions")).toMatchObject({ ok: false, code: "SPELL_ACTIVE" });
    expect(mapSpellProblem(state, heroOf(state), spellOf(state, "visions"))).toBe("уже действует");
  });
});

const army = (state: GameState): string[] =>
  shownArmy(state, heroOf(state)).map((stack) => `${stack.creature}:${stack.count ?? "?"}`);

describe("маскировка", () => {
  it("без маскировки армия показана настоящей", () => {
    expect(army(game())).toEqual(["militia:30", "armsman:5"]);
  });

  it("без навыка: все отряды — сильнейшее существо армии, числа настоящие; мана −4", () => {
    const state = done(
      game({
        army: [
          { creature: "militia", count: 30 },
          { creature: "falcon", count: 5 },
        ],
      }),
      "disguise",
    );
    expect(heroOf(state)).toMatchObject({ disguise: 1, mana: 46 });
    expect(army(state)).toEqual(["falcon:30", "falcon:5"]);
    // Настоящая армия не тронута.
    expect(heroOf(state).army[0]).toEqual({ creature: "militia", count: 30 });
  });

  it("продвинутый воздух: числа скрыты; экспертный: сильнейшее существо города", () => {
    const own = [{ creature: "militia", count: 30 }];
    const advanced = done(game({ army: own, ...skills("air-magic", 2) }), "disguise");
    expect(heroOf(advanced)).toMatchObject({ disguise: 2, mana: 48 });
    expect(army(advanced)).toEqual(["militia:?"]);
    const expert = done(game({ army: own, ...skills("air-magic", 3) }), "disguise");
    expect(army(expert)).toEqual(["armsman:?"]);
  });
});

describe("заклинания карты и бой", () => {
  it("в бой заклинания карты не идут", () => {
    const guard = { type: "guard", x: 2, y: 0, creature: "militia", count: 1 } as const;
    const state = game({ spells: ["magic-arrow", "visions", "town-portal"] }, [NEAR], [guard]);
    const fight = applyCommand(state, { type: "moveHero", player: 0, heroId: "A", path: ["E"] });
    expect(
      fight.ok && fight.state.battle?.state.sides[0].hero?.spells.map((spell) => spell.id),
    ).toEqual(["magic-arrow"]);
    expect(fight.ok && cast(fight.state, "visions")).toMatchObject({ code: "BATTLE_IN_PROGRESS" });
  });

  it("в книге героя на карте — только заклинания карты, с ценой по навыку", () => {
    const state = game({
      spells: ["magic-arrow", "visions", "town-portal"],
      ...skills("earth-magic", 1),
    });
    expect(mapSpellsOf(state, heroOf(state)).map((spell) => [spell.id, spell.cost])).toEqual([
      ["visions", 2],
      ["town-portal", 12],
    ]);
    expect(mapSpellsOf(state, { ...heroOf(state), book: false })).toEqual([]);
  });
});
