// Гибель и наём героя, таверна: docs/mechanics/32-hero-hire.md.
import { describe, expect, it } from "vitest";
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand } from "./commands.ts";
import { renderState } from "./render.ts";
import { gameWith, HEROES, TAVERN } from "./testkit.ts";
import { codeOf, days, eventsOf, gold, run, START, townGame } from "./townKit.ts";
import type { GameState } from "./types.ts";

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);
const GUARD = { type: "guard", x: 3, y: 0, creature: "militia", count: 500 } as const;

const offers = (state: GameState) => state.players[0]?.tavern ?? [];
const kinds = (state: GameState) => offers(state).map((offer) => offer.kind);

/** Партия с городом, где герой уже погиб в бою с охранником. */
function heroless(money = 3000, seed = 1): GameState {
  const state = townGame(START, { gold: money }, [GUARD], ["militia:10"], seed);
  const fight = applyCommand(state, { type: "moveHero", player: 0, heroId: "A", path: ["E", "E"] });
  if (!fight.ok) {
    throw new Error(fight.code);
  }
  return playBattleOut(fight.state).state;
}

describe("таверна", () => {
  it("в начале партии в ней два разных героя, и это не герой игрока", () => {
    for (const seed of SEEDS) {
      const state = townGame(START, {}, [], ["militia:10"], seed);
      const [first, second] = kinds(state);
      expect(offers(state)).toHaveLength(2);
      expect(first).not.toBe(second);
      expect(kinds(state)).not.toContain(state.heroes[0]?.kind);
      expect(HEROES.map((kind) => kind.id)).toEqual(expect.arrayContaining(kinds(state)));
    }
  });

  it("армия героя таверны — по таблице: от одного до трёх отрядов в своих границах", () => {
    const shapes = new Set<string>();
    for (const seed of SEEDS) {
      for (const offer of offers(townGame(START, {}, [], ["militia:10"], seed))) {
        shapes.add(offer.army.map((stack) => stack.creature).join("+"));
        for (const [index, stack] of offer.army.entries()) {
          const rule = TAVERN.army[index];
          expect(stack.creature).toBe(rule?.creature);
          expect(stack.count).toBeGreaterThanOrEqual(rule?.min ?? 0);
          expect(stack.count).toBeLessThanOrEqual(rule?.max ?? 0);
        }
      }
    }
    expect([...shapes].toSorted()).toEqual([
      "militia",
      "militia+slinger",
      "militia+slinger+falcon",
    ]);
  });

  it("у игрока без города таверны нет, и случайные числа на неё не тратятся", () => {
    const rows = ["S.......", ...Array.from({ length: 7 }, () => "........")];
    const state = gameWith(rows, [], { seed: 5 });
    expect(offers(state)).toEqual([]);
    expect(state.rng).toEqual({ s: 5 });
  });

  it("тот же сид — те же герои; в первый день недели герои меняются, в остальные — нет", () => {
    const state = townGame();
    expect(offers(townGame())).toEqual(offers(state));
    const sixth = run(state, ...days(6));
    expect(offers(sixth)).toEqual(offers(state));
    const events = eventsOf(sixth, "endTurn");
    const eighth = run(sixth, "endTurn");
    expect(events).toContainEqual({ type: "tavernChanged", player: 0, offers: offers(eighth) });
    expect(offers(eighth)).not.toEqual(offers(state));
    expect(kinds(eighth)).not.toContain(eighth.heroes[0]?.kind);
  });

  it("печатается после города: имена и армии", () => {
    const text = renderState(townGame());
    expect(text).toMatch(
      /Таверна игрока 1: [А-Яа-я]+ \(ополченец \d+.*\); [А-Яа-я]+ \(ополченец \d+.*\)\./,
    );
    expect(text).toContain("Герой A (Ратибор): уровень 1");
  });
});

describe("гибель героя при живом городе", () => {
  it("партия продолжается: поражения нет, герой и его армия потеряны", () => {
    const lost = heroless();
    expect(lost).toMatchObject({ heroes: [], outcome: null, battle: null });
    const fought = applyCommand(townGame(START, {}, [GUARD]), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E", "E"],
    });
    const events = fought.ok ? playBattleOut(fought.state).events : [];
    expect(events.map((event) => event.type)).toContain("heroDied");
    expect(events.map((event) => event.type)).not.toContain("gameOver");
  });

  it("без героя: дни, строительство и наём существ работают; ходить и меняться некому", () => {
    const lost = heroless(20_000);
    const next = run(lost, "endTurn", { build: "town-hall" }, { recruit: "militia", count: 5 });
    expect(next.day).toBe(2);
    expect(codeOf(next, "enter")).toBe("UNKNOWN_HERO");
    expect(codeOf(next, { take: "militia", count: 5 })).toBe("HERO_NOT_IN_TOWN");
  });

  it("без города гибель героя по-прежнему кончает партию", () => {
    const rows = ["S.......", ...Array.from({ length: 7 }, () => "........")];
    const state = gameWith(rows, [GUARD]);
    const fight = applyCommand(state, {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E", "E"],
    });
    const lost = fight.ok ? playBattleOut(fight.state) : undefined;
    expect(lost?.state.outcome).toBe("defeat");
    expect(lost?.events.map((event) => event.type)).toContain("gameOver");
  });
});

describe("наём героя", () => {
  it("герой встаёт на клетку города с именем, числами и армией из таверны; уровень 1", () => {
    const lost = heroless(3000);
    const [offer, other] = offers(lost);
    const kind = HEROES.find((candidate) => candidate.id === offer?.kind);
    const hired = run(lost, { hire: 0 });
    expect(hired.heroes).toEqual([
      {
        id: "A",
        owner: 0,
        kind: kind?.id,
        name: kind?.name,
        x: 1,
        y: 1,
        movement: 1000,
        attack: kind?.attack,
        defense: kind?.defense,
        army: offer?.army,
        experience: 0,
        level: 1,
      },
    ]);
    expect(gold(hired)).toBe(500);
    // На месте нанятого — другой герой; второй остался, где был.
    expect(offers(hired)[1]).toEqual(other);
    expect(kinds(hired)[0]).not.toBe(kind?.id);
    expect(kinds(hired)[0]).not.toBe(other?.kind);
    expect(eventsOf(lost, { hire: 0 })).toEqual([
      {
        type: "heroHired",
        heroId: "A",
        hero: kind?.id,
        townId: "o1",
        cost: 2500,
        army: offer?.army,
      },
      { type: "tavernChanged", player: 0, offers: offers(hired) },
    ]);
  });

  it("можно нанять и второго из двух; нанятый сразу может забрать гарнизон", () => {
    const lost = run(heroless(20_000), { recruit: "militia", count: 14 });
    const second = offers(lost)[1];
    const hired = run(lost, { hire: 1 }, { take: "militia", count: 14 });
    expect(hired.heroes[0]?.kind).toBe(second?.kind);
    const militia = second?.army.find((stack) => stack.creature === "militia")?.count ?? 0;
    expect(hired.heroes[0]?.army[0]).toEqual({ creature: "militia", count: militia + 14 });
  });

  it.each([
    [2499, { hire: 0 }, "NOT_ENOUGH_RESOURCES"],
    [3000, { hire: 2 }, "BAD_OFFER"],
    [3000, { hire: -1 }, "BAD_OFFER"],
    [3000, { hire: 0.5 }, "BAD_OFFER"],
    [2499, { hire: 2 }, "BAD_OFFER"],
  ] as const)("золота %i, команда %j → %s", (money, step, code) => {
    expect(codeOf(heroless(money), step)).toBe(code);
  });

  it("герой уже есть — отказ, даже если не хватает золота", () => {
    expect(codeOf(townGame(START, { gold: 3000 }), { hire: 1 })).toBe("HERO_EXISTS");
    expect(codeOf(townGame(START, { gold: 0 }), { hire: 7 })).toBe("HERO_EXISTS");
  });

  it("чужой или несуществующий город — NO_TOWN; город без таверны — NO_TAVERN", () => {
    const lost = heroless();
    const wrong = { type: "hireHero", player: 0, townId: "o9", offer: 0 } as const;
    expect(applyCommand(lost, wrong)).toMatchObject({ code: "NO_TOWN" });
    // Карта без таверны отвергается, поэтому таверна убрана из состояния в обход правил.
    const bare = {
      ...lost,
      objects: lost.objects.map((object) =>
        object.type === "town" ? { ...object, buildings: ["fort"] } : object,
      ),
    };
    expect(codeOf(bare, { hire: 0 })).toBe("NO_TAVERN");
  });

  it("золота не хватает — игрок ждёт: город приносит на героя за несколько дней", () => {
    const lost = heroless(0);
    expect(codeOf(lost, { hire: 0 })).toBe("NOT_ENOUGH_RESOURCES");
    const waited = run(lost, ...days(5));
    expect(gold(waited)).toBe(2500);
    expect(run(waited, { hire: 0 }).heroes).toHaveLength(1);
  });

  it("погибший герой может снова появиться в таверне", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 40)) {
      let state = heroless(0, seed);
      for (let week = 0; week < 4; week += 1) {
        state = run(state, ...days(7));
        for (const kind of kinds(state)) {
          seen.add(kind);
        }
      }
    }
    expect(seen).toContain("ratibor");
  });
});
