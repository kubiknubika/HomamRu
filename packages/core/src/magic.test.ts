// Правила из docs/mechanics/61-magic.md: гильдия магов, книга, выучивание, мана.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { BOOK_PRICE, guildLevel, guildSpells, maxMana } from "./magic.ts";
import { formatEvent, renderState } from "./render.ts";
import { createRng } from "./rng.ts";
import { guildSlots, rollGuildSpells } from "./spells.ts";
import { duel, enemyTown, HOME } from "./duelKit.ts";
import { createGame } from "./game.ts";
import { CONTENT, OPEN_FIELD, spell, SPELLS } from "./testkit.ts";
import { codeOf, eventsOf, run, START, town, townGame } from "./townKit.ts";
import type { Command, GameState, HeroState } from "./types.ts";

const GUILD = [...START, "mage-guild"];
const BUY: Command = { type: "buyBook", player: 0, townId: "o1" };
const END: Command = { type: "endTurn", player: 0 };

function withHero(state: GameState, changes: Partial<HeroState>): GameState {
  return { ...state, heroes: state.heroes.map((hero) => ({ ...hero, ...changes })) };
}

function apply(state: GameState, command: Command) {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result;
}

function buyCode(state: GameState, command: Command = BUY): string {
  const result = applyCommand(state, command);
  return result.ok ? "ok" : result.code;
}

const hero = (state: GameState) => state.heroes[0];
/** Партия, где герой уже стоит в городе с гильдией. */
const inGuild = (gold = 20_000) => run(townGame(GUILD, { gold, wood: 20, ore: 20 }), "enter");

describe("набор гильдии магов", () => {
  it("гильдия уровня N даёт 6 − N заклинаний своего круга", () => {
    expect([1, 2, 3, 4, 5].map(guildSlots)).toEqual([5, 4, 3, 2, 1]);
  });

  it("в начале партии городу выпадает пять разных заклинаний первого круга", () => {
    const spells = town(townGame(GUILD))?.spells ?? [];
    expect(spells).toHaveLength(5);
    expect(new Set(spells).size).toBe(5);
    expect(spells.every((id) => spell(id).level === 1)).toBe(true);
  });

  it("набор зависит только от сида; заклинания с шансом 0 не выпадают никогда", () => {
    const seen = new Map<string, number>();
    const sets = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) {
      const rolled = rollGuildSpells(createRng(seed), SPELLS).value;
      expect(rolled).toEqual(rollGuildSpells(createRng(seed), SPELLS).value);
      sets.add(rolled.join());
      for (const id of rolled) {
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
    }
    expect(sets.size).toBeGreaterThan(50);
    expect(seen.has("curse")).toBe(false);
    expect(seen.has("bloodlust")).toBe(false);
    // Остальные десять выпадают все; чем больше шанс, тем чаще.
    expect(seen.size).toBe(10);
    const count = (id: string) => seen.get(id) ?? 0;
    expect(count("magic-arrow")).toBeGreaterThan(count("shield"));
    expect(count("shield")).toBeGreaterThan(count("haste"));
    expect(count("haste")).toBeGreaterThan(count("protection-from-fire"));
    // Шанс 30 из 91: «Волшебная стрела» есть почти в каждой гильдии.
    expect(count("magic-arrow")).toBeGreaterThan(340);
  });

  it("заклинаний меньше, чем мест, — выпадают все; без подходящих — пусто", () => {
    const three = SPELLS.filter((item) => ["bless", "cure", "curse", "slow"].includes(item.id));
    expect(rollGuildSpells(createRng(1), three).value.toSorted()).toEqual([
      "bless",
      "cure",
      "slow",
    ]);
    const none = rollGuildSpells(createRng(7), [spell("curse")]);
    expect(none).toEqual({ value: [], rng: createRng(7) });
  });

  it("по кругам: пять первого, четыре второго, … одно пятого", () => {
    const many = [1, 2, 3, 4, 5].flatMap((level) =>
      SPELLS.map((item) => ({ ...item, id: `${item.id}-${level}`, level, chance: 10 })),
    );
    const rolled = rollGuildSpells(createRng(3), many).value;
    const levels = rolled.map((id) => Number(id.slice(-1)));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
  });

  it("у городов одной партии наборы бросаются отдельно", () => {
    const state = duel([HOME, enemyTown()]);
    const towns = state.objects.filter((object) => object.type === "town");
    expect(towns).toHaveLength(2);
    expect(towns.every((object) => object.spells.length === 5)).toBe(true);
  });

  it("без гильдии набор уже решён, но не показан", () => {
    const state = townGame(START);
    const home = town(state);
    expect(home?.spells).toHaveLength(5);
    expect(home === undefined ? -1 : guildLevel(state, home)).toBe(0);
    expect(home === undefined ? null : guildSpells(state, home)).toEqual([]);
    expect(renderState(state)).not.toContain("Гильдия магов:");
    // Постройка гильдии набора не меняет.
    const built = run(state, { build: "mage-guild" });
    expect(town(built)?.spells).toEqual(home?.spells);
    expect(renderState(built)).toContain("  Гильдия магов: ");
  });
});

describe("книга заклинаний", () => {
  it("стоит 500 золота; герой с книгой сразу выучивает заклинания гильдии", () => {
    const state = inGuild();
    expect(hero(state)).toMatchObject({ book: false, spells: [] });
    const bought = apply(state, BUY);
    expect(bought.state.players[0]?.resources.gold).toBe(20_000 - BOOK_PRICE);
    expect(hero(bought.state)).toMatchObject({ book: true, spells: town(state)?.spells });
    expect(bought.events).toEqual([
      { type: "bookBought", heroId: "A", townId: "o1", cost: 500 },
      { type: "spellsLearned", heroId: "A", townId: "o1", spells: town(state)?.spells },
    ]);
    expect(bought.events.map(formatEvent)).toEqual([
      "Герой A купил книгу заклинаний в городе o1: золото −500",
      `Герой A выучил в городе o1: ${town(state)?.spells.join(", ")}`,
    ]);
    expect(renderState(bought.state)).toContain("книга: ");
  });

  it("золота ровно 500 — хватает; 499 — отказ", () => {
    expect(buyCode(inGuild(499))).toBe("NOT_ENOUGH_RESOURCES");
    expect(apply(inGuild(500), BUY).state.players[0]?.resources.gold).toBe(0);
  });

  it("отказы: нет города, нет гильдии, героя нет в городе, книга уже есть", () => {
    expect(buyCode(inGuild(), { ...BUY, townId: "o9" })).toBe("NO_TOWN");
    expect(buyCode(run(townGame(START), "enter"))).toBe("NO_GUILD");
    expect(buyCode(townGame(GUILD))).toBe("HERO_NOT_IN_TOWN");
    expect(buyCode(apply(inGuild(), BUY).state)).toBe("BOOK_EXISTS");
  });

  it("чужой город: купить нельзя", () => {
    const state = inGuild();
    const objects = state.objects.map((object) =>
      object.type === "town" ? { ...object, owner: 1 } : object,
    );
    expect(buyCode({ ...state, objects })).toBe("NO_TOWN");
    // И заклинаний чужой гильдии герой с книгой не учит.
    const reader = withHero({ ...state, objects }, { book: true });
    expect(hero(apply(reader, END).state)?.spells).toEqual([]);
  });
});

describe("выучивание", () => {
  it("герой с книгой учит заклинания, войдя в свой город с гильдией", () => {
    const state = withHero(townGame(GUILD), { book: true });
    const events = eventsOf(state, "enter");
    expect(events.at(-1)).toMatchObject({ type: "spellsLearned", heroId: "A", townId: "o1" });
    expect(hero(run(state, "enter"))?.spells).toEqual(town(state)?.spells);
  });

  it("без книги не учит; уже известные не повторяются", () => {
    const entered = run(townGame(GUILD), "enter");
    expect(hero(entered)?.spells).toEqual([]);
    const [known = "", ...rest] = town(entered)?.spells ?? [];
    const bought = apply(withHero(entered, { spells: [known] }), BUY);
    expect(bought.events.at(-1)).toMatchObject({ type: "spellsLearned", spells: rest });
    expect(hero(bought.state)?.spells).toEqual([known, ...rest]);
    // Всё выучено: новых событий нет.
    expect(apply(bought.state, END).events.some((event) => event.type === "spellsLearned")).toBe(
      false,
    );
  });

  it("гильдию построили при герое с книгой — он учит сразу", () => {
    const state = run(withHero(townGame(START), { book: true }), "enter");
    expect(hero(state)?.spells).toEqual([]);
    const events = eventsOf(state, { build: "mage-guild" });
    expect(events.map((event) => event.type)).toContain("spellsLearned");
  });

  it("в городе без гильдии не учит", () => {
    const state = run(withHero(townGame(START), { book: true }), "enter");
    expect(hero(state)?.spells).toEqual([]);
    expect(codeOf(state, "endTurn")).toBe("ok");
  });

  it("гильдия показывает круги не выше своего уровня; без «Мудрости» герой учит только 1 и 2", () => {
    const base = withHero(townGame(GUILD), { book: true });
    const [first = "", second = "", third = "", ...others] = town(base)?.spells ?? [];
    const levels = new Map([
      [second, 2],
      [third, 3],
    ]);
    const spells = base.spells.map((item) => ({ ...item, level: levels.get(item.id) ?? 1 }));
    const low = { ...base, spells };
    // Гильдия первого уровня: только первый круг.
    expect(hero(run(low, "enter"))?.spells).toEqual([first, ...others]);
    // Гильдия третьего уровня показывает три круга, но третий герою не по силам.
    const buildings = base.buildings.map((building) =>
      building.id === "mage-guild" ? { ...building, mageGuild: 3 } : building,
    );
    const high = { ...low, buildings };
    const home = town(high);
    expect(home === undefined ? [] : guildSpells(high, home)).toContain(third);
    expect(hero(run(high, "enter"))?.spells).toEqual([first, second, ...others]);
  });
});

describe("мана", () => {
  it("запас — знание × 10; новый герой начинает с полной маной", () => {
    expect(maxMana({ knowledge: 0 })).toBe(0);
    expect(maxMana({ knowledge: 7 })).toBe(70);
    expect(hero(townGame(GUILD))).toMatchObject({ knowledge: 1, mana: 10 });
  });

  it("вне города за ночь возвращается 1 маны, но не выше запаса", () => {
    const tired = withHero(townGame(GUILD), { knowledge: 3, mana: 4 });
    expect(hero(run(tired, "endTurn"))?.mana).toBe(5);
    expect(hero(run(tired, "endTurn", "endTurn", "endTurn"))?.mana).toBe(7);
    const almost = withHero(tired, { mana: 29 });
    expect(hero(run(almost, "endTurn", "endTurn"))?.mana).toBe(30);
  });

  it("в своём городе с гильдией за ночь возвращается вся", () => {
    const tired = withHero(run(townGame(GUILD), "enter"), { knowledge: 3, mana: 0 });
    expect(hero(run(tired, "endTurn"))?.mana).toBe(30);
  });

  it("в своём городе без гильдии — как в поле: 1 маны", () => {
    const tired = withHero(run(townGame(START), "enter"), { knowledge: 3, mana: 0 });
    expect(hero(run(tired, "endTurn"))?.mana).toBe(1);
  });

  it("мана сверх запаса не пропадает и не растёт", () => {
    const full = withHero(townGame(GUILD), { knowledge: 1, mana: 25 });
    expect(hero(run(full, "endTurn"))?.mana).toBe(25);
    expect(hero(run(run(full, "enter"), "endTurn"))?.mana).toBe(25);
  });

  it("печать героя: сила магии, знание, мана", () => {
    expect(renderState(townGame(GUILD))).toContain(
      "сила магии 1, знание 1, мана 10 из 10, книги нет",
    );
  });
});

const map = (heroMagic: object) => ({
  id: "m",
  name: "Карта",
  terrain: [...OPEN_FIELD].map((row) => row.replaceAll("S", ".")),
  players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 5 }], ...heroMagic } }],
});

describe("герой карты", () => {
  it("карта может дать герою книгу, заклинания, силу магии и знание; мана полная", () => {
    const made = createGame(
      map({ spellPower: 4, knowledge: 6, book: true, spells: ["slow", "cure"] }),
      1,
      CONTENT,
    );
    expect(made).toMatchObject({
      ok: true,
      state: {
        heroes: [{ spellPower: 4, knowledge: 6, mana: 60, book: true, spells: ["slow", "cure"] }],
      },
    });
  });

  it("незнакомое заклинание у героя карты — карта отвергается", () => {
    const made = createGame(map({ book: true, spells: ["fireball"] }), 1, CONTENT);
    expect(made).toMatchObject({ ok: false, errors: [{ field: "players.0.hero.spells" }] });
  });
});
