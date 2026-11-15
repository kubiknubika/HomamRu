// Компьютер на карте и магия: гильдия, книга, поход за заклинаниями (63-opponent-magic.md).
import { NO_RESOURCES } from "./objects.ts";
import { describe, expect, it } from "vitest";
import { duel, HOME, put, run, withoutHero } from "./duelKit.ts";
import { chooseMapCommand } from "./opponent.ts";
import { OPPONENT } from "./testkit.ts";
import type { GameState, HeroState, MapObjectDefinition } from "./types.ts";

const GUILD_TOWN = {
  ...HOME,
  buildings: [...OPPONENT.buildOrder],
} as MapObjectDefinition;

const FAR_PILE: MapObjectDefinition[] = [
  { type: "pile", x: 6, y: 0, resource: "gold", amount: 100 },
];
const TO_TOWN = "S,S,S,S";
const TO_PILE = "E,E,E,E,E,E";

/** Герой A один на карте, свой город с гильдией — в (0, 4); золота `gold`, дерева и руды нет. */
function game(gold: number, extra: MapObjectDefinition[] = [], town = GUILD_TOWN): GameState {
  const state = withoutHero(duel([town, ...extra]), "B");
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      resources: { ...NO_RESOURCES, gold, wood: 0, ore: 0 },
    })),
  };
}

function withHero(state: GameState, changes: Partial<HeroState>): GameState {
  return { ...state, heroes: state.heroes.map((hero) => ({ ...hero, ...changes })) };
}

/** Ход компьютера: команды городов по порядку и чем кончилось — пошёл герой или стоит. */
function turn(initial: GameState): { town: string[]; hero: string; state: GameState } {
  let state = initial;
  const town: string[] = [];
  for (let count = 0; count < 50; count += 1) {
    const command = chooseMapCommand(state);
    if (command.type === "moveHero" || command.type === "endTurn") {
      const hero = command.type === "moveHero" ? command.path.join(",") : "стоит";
      return { town, hero, state };
    }
    town.push(command.type);
    state = run(state, command);
  }
  return { town, hero: "ход не кончился", state };
}

const goldAfter = (state: GameState): number => turn(state).state.players[0]?.resources.gold ?? 0;

const guildSpells = (state: GameState): string[] =>
  state.objects.flatMap((object) => (object.type === "town" ? object.spells : []));

describe("компьютер и гильдия магов", () => {
  it("гильдия магов в списке стройки третья", () => {
    expect(OPPONENT.buildOrder.slice(0, 3)).toEqual(["town-hall", "militia-yard", "mage-guild"]);
  });

  it("герой в своём городе с гильдией покупает книгу раньше найма и сразу учит заклинания", () => {
    const { town, state } = turn(put(game(620), "A", 0, 4));
    expect(town).toEqual(["buyBook", "recruit", "transfer"]);
    expect(state.heroes[0]).toMatchObject({ book: true, spells: guildSpells(state) });
    expect(state.players[0]?.resources.gold).toBeLessThan(120);
  });

  it("на книгу не хватает — не покупает", () => {
    expect(turn(put(game(499), "A", 0, 4)).town).not.toContain("buyBook");
  });

  it("герой без книги идёт в свой город с гильдией, когда золота на книгу хватает", () => {
    // Город в четырёх шагах, кучка — в шести: город ближе. Без золота на книгу цель одна — кучка.
    expect(turn(game(500, FAR_PILE)).hero).toBe(TO_TOWN);
    expect(turn(game(499, FAR_PILE)).hero).toBe(TO_PILE);
  });

  it("пока герой идёт за книгой, город золото на неё не тратит", () => {
    const withBook = withHero(game(1000), { book: true, spells: guildSpells(game(1000)) });
    expect(goldAfter(game(1000))).toBeGreaterThanOrEqual(500);
    expect(goldAfter(withBook)).toBeLessThan(100);
  });

  it("герой с книгой идёт в город за невыученными заклинаниями; всё выучил — город не цель", () => {
    const state = game(0, FAR_PILE);
    const known = guildSpells(state);
    expect(known).toHaveLength(5);
    const goes = (spells: string[]) => turn(withHero(state, { book: true, spells })).hero;
    expect(goes(known.slice(0, 4))).toBe(TO_TOWN);
    expect(goes([])).toBe(TO_TOWN);
    expect(goes(known)).toBe(TO_PILE);
  });

  it("город без гильдии — не цель", () => {
    expect(turn(game(5000, FAR_PILE, HOME)).hero).toBe(TO_PILE);
  });
});
