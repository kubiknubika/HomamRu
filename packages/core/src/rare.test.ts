// Правила из docs/mechanics/66-rare-resources.md: редкие ресурсы, гильдия магов 2–4, «Мудрость».
import { describe, expect, it } from "vitest";
import { duel, HOME, withoutHero } from "./duelKit.ts";
import { guildLevel, guildSpells, withGuildSpells } from "./magic.ts";
import { MINE_INCOME, NO_RESOURCES } from "./objects.ts";
import { chooseMapCommand } from "./opponent.ts";
import { GAME_SPELLS } from "./spellKit.ts";
import { OPPONENT } from "./testkit.ts";
import { codeOf, run, START, town, townGame } from "./townKit.ts";
import { MINE_KINDS, RESOURCES } from "./types.ts";
import type { HeroSkill } from "./skills.ts";
import type { GameState, MapObjectDefinition, Resources } from "./types.ts";

const RARE = ["mercury", "sulfur", "crystal", "gems"] as const;
const rare = (amount: number) => Object.fromEntries(RARE.map((id) => [id, amount]));
const WEALTH: Resources = { ...NO_RESOURCES, gold: 20_000, wood: 50, ore: 50, ...rare(50) };
const GUILDS = ["mage-guild", "mage-guild-2", "mage-guild-3", "mage-guild-4", "mage-guild-5"];
const resources = (state: GameState) => state.players[0]?.resources;
const levelOf = (state: GameState, id: string) =>
  state.spells.find((spell) => spell.id === id)?.level;

/** Партия с городом и всеми заклинаниями игры: набор гильдии брошен по ним. */
function game(amounts: Resources = WEALTH, seed = 1): GameState {
  return withGuildSpells({ ...townGame(START, amounts, [], undefined, seed), spells: GAME_SPELLS });
}

/** Строит гильдии подряд, по одной в день. */
function withGuilds(state: GameState, count: number): GameState {
  return GUILDS.slice(0, count).reduce(
    (current, building) => run(current, { build: building }, "endTurn"),
    state,
  );
}

function withSkills(state: GameState, skills: HeroSkill[]): GameState {
  return { ...state, heroes: state.heroes.map((hero) => ({ ...hero, book: true, skills })) };
}

describe("редкие ресурсы", () => {
  it("ресурсов семь, шахт семь; редкая шахта даёт 1 в день", () => {
    expect(RESOURCES).toEqual(["gold", "wood", "ore", ...RARE]);
    expect(MINE_KINDS).toHaveLength(7);
    expect(MINE_INCOME["alchemist-lab"]).toEqual({ resource: "mercury", amount: 1 });
    expect(MINE_INCOME["sulfur-dune"]).toEqual({ resource: "sulfur", amount: 1 });
    expect(MINE_INCOME["crystal-cavern"]).toEqual({ resource: "crystal", amount: 1 });
    expect(MINE_INCOME["gem-pond"]).toEqual({ resource: "gems", amount: 1 });
  });

  it("стартовые редкие — из карты, иначе ноль", () => {
    expect(resources(townGame(START, { gold: 5, sulfur: 3 }))).toEqual({
      ...NO_RESOURCES,
      gold: 5,
      sulfur: 3,
    });
  });

  it("кучка редкого без числа — от 3 до 6", () => {
    const amounts = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const piles: MapObjectDefinition[] = RARE.map((resource, index) => ({
        type: "pile",
        x: 3 + index,
        y: 3,
        resource,
      }));
      for (const object of townGame(START, WEALTH, piles, undefined, seed).objects) {
        if (object.type === "pile") {
          amounts.add(object.amount);
        }
      }
    }
    expect([...amounts].toSorted((a, b) => a - b)).toEqual([3, 4, 5, 6]);
  });
});

describe("гильдия магов, уровни 2–4", () => {
  it("цены: 1000 золота за уровни 2–4, 2000 за пятый; 5 дерева, 5 руды и по 4, 6 и 8 редкого", () => {
    // Доход города идёт золотом — подряд сравниваются только дерево, руда и редкие.
    expect(resources(withGuilds(game(), 2))).toMatchObject({ wood: 40, ore: 40, ...rare(46) });
    expect(resources(withGuilds(game(), 3))).toMatchObject({ wood: 35, ore: 35, ...rare(40) });
    expect(resources(withGuilds(game(), 4))).toMatchObject({ wood: 30, ore: 30, ...rare(32) });
    const first = withGuilds(game(), 1);
    const before = resources(first)?.gold ?? 0;
    // Пятый круг дороже: 2000 золота (data/buildings.yaml, docs/content/towns.md).
    const PRICES = [1000, 1000, 1000, 2000];
    for (const [index, building] of GUILDS.slice(1).entries()) {
      const state = withGuilds(game(), index + 1);
      const gold = resources(state)?.gold ?? 0;
      expect(resources(run(state, { build: building }))?.gold).toBe(gold - (PRICES[index] ?? 0));
    }
    expect(before).toBeGreaterThan(0);
  });

  it("каждый уровень требует предыдущего", () => {
    const fresh = game();
    expect(codeOf(fresh, { build: "mage-guild-2" })).not.toBe("ok");
    const first = withGuilds(fresh, 1);
    expect(codeOf(first, { build: "mage-guild-3" })).not.toBe("ok");
    expect(codeOf(first, { build: "mage-guild-4" })).not.toBe("ok");
    expect(codeOf(first, { build: "mage-guild-2" })).toBe("ok");
  });

  it("не хватает одного редкого ресурса — отказ", () => {
    const poor = withGuilds(game({ ...WEALTH, gems: 3 }), 1);
    expect(codeOf(poor, { build: "mage-guild-2" })).toBe("NOT_ENOUGH_RESOURCES");
    const enough = withGuilds(game({ ...WEALTH, gems: 4 }), 1);
    expect(codeOf(enough, { build: "mage-guild-2" })).toBe("ok");
  });

  it("уровень гильдии — по старшей постройке, от первого до пятого", () => {
    for (let count = 0; count <= 5; count += 1) {
      const state = withGuilds(game(), count);
      const home = town(state);
      expect(home === undefined ? -1 : guildLevel(state, home)).toBe(count);
    }
    // Пятый круг есть (docs/content/towns.md), шестого не бывает.
    expect(townGame().buildings.some((building) => (building.mageGuild ?? 0) === 5)).toBe(true);
    expect(townGame().buildings.some((building) => (building.mageGuild ?? 0) > 5)).toBe(false);
  });

  it("в наборе города круга N не больше 6 − N, все разные и этого круга", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = withGuilds(game(WEALTH, seed), 4);
      const home = town(state);
      const shown = home === undefined ? [] : guildSpells(state, home);
      expect(new Set(shown).size).toBe(shown.length);
      const counts = [1, 2, 3, 4, 5].map(
        (level) => shown.filter((id) => levelOf(state, id) === level).length,
      );
      expect(counts).toEqual([5, 4, 3, 2, 0]);
    }
  });

  it("гильдия уровня N показывает круги не выше N", () => {
    const state = withGuilds(game(), 2);
    const home = town(state);
    const shown = home === undefined ? [] : guildSpells(state, home);
    expect(shown.map((id) => levelOf(state, id)).toSorted()).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2]);
  });
});

function learned(skills: HeroSkill[]): number[] {
  const state = run(withSkills(withGuilds(game(), 4), skills), "enter");
  const levels = (state.heroes[0]?.spells ?? []).map((id) => levelOf(state, id) ?? 0);
  return [...new Set(levels)].toSorted();
}

describe("«Мудрость»", () => {
  it("без неё — круги 1 и 2, базовая — 3, продвинутая — 4", () => {
    expect(learned([])).toEqual([1, 2]);
    expect(learned([{ id: "wisdom", level: 1 }])).toEqual([1, 2, 3]);
    expect(learned([{ id: "wisdom", level: 2 }])).toEqual([1, 2, 3, 4]);
    expect(learned([{ id: "wisdom", level: 3 }])).toEqual([1, 2, 3, 4]);
  });
});

describe("компьютер и гильдии 2–4", () => {
  // Всё из списка стройки, кроме гильдий 2–4.
  const ALL = OPPONENT.buildOrder.filter((id) => !/^mage-guild-\d$/.test(id));
  const home = {
    ...HOME,
    buildings: [...START, ...ALL.filter((id) => !START.includes(id))],
  } as MapObjectDefinition;

  function first(amounts: Partial<Resources>): string {
    const base = withoutHero(duel([home]), "B");
    const state = {
      ...base,
      players: base.players.map((player) => ({
        ...player,
        resources: { ...NO_RESOURCES, ...amounts },
      })),
    };
    const command = chooseMapCommand(state);
    return command.type === "build" ? command.building : command.type;
  }

  it("редких не хватает — гильдию не ждёт и золото под неё не копит: нанимает", () => {
    // Золота на гильдию второго уровня хватило бы, редких нет: золото уходит на наём.
    expect(first({ gold: 1200, wood: 5, ore: 5 })).toBe("recruit");
  });

  it("ресурсов на гильдию хватает — строит её раньше найма", () => {
    expect(first({ gold: 1000, wood: 5, ore: 5, ...rare(4) })).toBe("mage-guild-2");
  });
});

// Каталог (docs/content/towns.md) называет пятую гильдию самым дешёвым из «чего нет»:
// три заклинания пятого круга в данных есть, но недоступны ни в одном городе.
// Этот тест держит результат, а не намерение: круг 5 открывает ровно три заклинания.
/** Заклинания пятого круга в наборе игры: они и есть то, что открывает пятая гильдия. */
function fifthLevel(state: GameState): string[] {
  return state.spells.filter((spell) => spell.level === 5).map((spell) => spell.id);
}

describe("пятый круг гильдии магов", () => {
  it("в данных три заклинания пятого круга", () => {
    expect(fifthLevel(game()).toSorted()).toEqual(["implosion", "magic-mirror", "sacrifice"]);
  });

  it("без пятой гильдии город их не даёт, с пятой — даёт", () => {
    const four = withGuilds(game(), 4);
    const home4 = town(four);
    expect(home4 === undefined ? [] : guildSpells(four, home4)).toEqual(
      expect.not.arrayContaining(fifthLevel(four)),
    );
    const five = withGuilds(game(WEALTH), 5);
    const home5 = town(five);
    const known = home5 === undefined ? [] : guildSpells(five, home5);
    // Пятый круг даёт ровно одно гнездо (guildSlots(5) = 1), и оно заполнено.
    expect(known.filter((id) => fifthLevel(five).includes(id))).toHaveLength(1);
  });
});
