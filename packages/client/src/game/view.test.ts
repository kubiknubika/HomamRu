// Кто за экраном, чей ход, чем кончилась партия: docs/mechanics/43-opponent-screen.md.
import { createGame, TOWNLESS_DAYS } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { CONTENT } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import {
  activeHero,
  battleSideOf,
  computerToMove,
  endingOf,
  humanOf,
  select,
  townlessLeft,
} from "./view.ts";

function duel(): GameState {
  const created = createGame(
    {
      id: "duel",
      name: "Двое",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        { hero: { x: 0, y: 0, attack: 0, defense: 0, army: [{ creature: "militia", count: 20 }] } },
        {
          hero: { x: 4, y: 0, attack: 0, defense: 0, army: [{ creature: "militia", count: 20 }] },
          kind: "computer",
        },
      ],
      objects: [],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

describe("кто за экраном и чей ход", () => {
  it("за экраном человек, при его отсутствии — первый игрок", () => {
    const state = duel();
    expect(humanOf(state)).toBe(0);
    expect(activeHero(state)?.owner).toBe(0);
    // Карта без людей: за экраном первый, но героя может не быть — тогда undefined.
    const robot = {
      ...state,
      players: state.players.map((player) => ({ ...player, kind: "computer" as const })),
    };
    expect(humanOf(robot)).toBe(0);
    const ghost = { ...state, heroes: [] };
    expect(activeHero(ghost)).toBeUndefined();
  });

  it("ход компьютера запирает управление, оконченная партия — тоже", () => {
    const state = duel();
    expect(computerToMove(state)).toBe(false);
    const otherTurn = { ...state, currentPlayer: 1 };
    expect(computerToMove(otherTurn)).toBe(true);
    // Партия кончена: управление не запирается «ходом компьютера», но и играть нельзя.
    const over = { ...otherTurn, outcome: "victory" as const, winner: 0 };
    expect(computerToMove(over)).toBe(false);
  });
});

describe("сторона игрока в бою", () => {
  const state = duel();
  const [mine, theirs] = state.heroes;

  it("боя нет — стороны нет", () => {
    expect(battleSideOf(state)).toBeNull();
  });

  it("напал он — сторона 0; напали на него — 1; чужой бой — null", () => {
    const battle = {
      heroId: mine?.id ?? "A",
      guardId: null,
      defenderHeroId: theirs?.id ?? "B",
      townId: null,
      state: null as never,
    };
    expect(battleSideOf({ ...state, battle })).toBe(0);
    const attacked = { ...battle, heroId: theirs?.id ?? "B", defenderHeroId: mine?.id ?? "A" };
    expect(battleSideOf({ ...state, battle: attacked })).toBe(1);
  });

  it("обороняется город: владелец города и есть обороняющийся", () => {
    const town = {
      id: "o1",
      type: "town" as const,
      x: 4,
      y: 0,
      owner: 1,
      buildings: [],
      builtToday: false,
      available: [],
      garrison: [],
      spells: [],
    };
    const townState = { ...state, objects: [...state.objects, town] };
    // Напал сам игрок — сторона 0, кто бы ни оборонялся.
    const battle = {
      heroId: mine?.id ?? "A",
      guardId: null,
      defenderHeroId: null,
      townId: "o1",
      state: null as never,
    };
    expect(battleSideOf({ ...townState, battle })).toBe(0);
    // Напал компьютер на город игрока — игрок обороняется, сторону даёт город.
    const myTown = { ...townState, objects: [{ ...town, owner: 0 }] };
    const computer = { ...battle, heroId: theirs?.id ?? "B" };
    expect(battleSideOf({ ...myTown, battle: computer })).toBe(1);
    // Город чужой и нападающий чужой — это не бой за экраном.
    const foreign = { ...battle, heroId: theirs?.id ?? "B" };
    expect(battleSideOf({ ...townState, battle: foreign })).toBeNull();
    // Города с таким номером нет — обороняющегося не найти.
    const lost = { ...battle, townId: "нет-такого" };
    expect(battleSideOf({ ...state, battle: lost })).toBe(0);
  });

  it("карта целиком за компьютером — человеком считаем первого, но стороны не будет", () => {
    const robot = {
      ...state,
      players: state.players.map((player) => ({ ...player, kind: "computer" as const })),
      battle: {
        heroId: mine?.id ?? "A",
        guardId: null,
        defenderHeroId: theirs?.id ?? "B",
        townId: null,
        state: null as never,
      },
    };
    expect(battleSideOf(robot)).toBeNull();
  });
});

describe("выбор клетки", () => {
  it("своя клетка и клетка без героя не выбираются", () => {
    const state = duel();
    const hero = state.heroes[0];
    expect(select(state, { x: hero?.x ?? 0, y: hero?.y ?? 0 })).toBeNull();
    const chosen = select(state, { x: 2, y: 2 });
    expect(chosen?.target).toEqual({ x: 2, y: 2 });
    expect(chosen?.path.found).toBe(true);
    expect(chosen?.fight).toBeNull();
  });

  it("цель — клетка чужого героя: будет бой с героем", () => {
    const state = duel();
    const enemy = state.heroes[1];
    const chosen = select(state, { x: enemy?.x ?? 0, y: enemy?.y ?? 0 });
    expect(chosen?.fight?.kind).toBe("hero");
  });
});

describe("чем кончилась партия", () => {
  it("партия идёт — итога нет", () => {
    expect(endingOf(duel())).toBeNull();
  });

  it("победа игрока называет день; победа противника — поражение", () => {
    const state = duel();
    expect(endingOf({ ...state, outcome: "victory", winner: 0, day: 42 })).toEqual({
      kind: "victory",
      days: 42,
    });
    expect(endingOf({ ...state, outcome: "victory", winner: 1 })).toEqual({
      kind: "defeat",
      reason: "nothing",
    });
  });

  it("семь дней без города — поражение с особой причиной", () => {
    const state = duel();
    const players = state.players.map((player) =>
      player.id === 0 ? { ...player, townlessDays: TOWNLESS_DAYS } : player,
    );
    expect(endingOf({ ...state, players, outcome: "defeat" })).toEqual({
      kind: "defeat",
      reason: "townless",
    });
  });
});

describe("отсчёт дней без города", () => {
  it("отсчёта нет, пока город не потерян", () => {
    expect(townlessLeft(duel())).toBeNull();
  });

  it("дни идут вниз от семи; выбывший игрок отсчёта не показывает", () => {
    const state = duel();
    const withDays = (days: number | null, eliminated = false) => ({
      ...state,
      players: state.players.map((player) =>
        player.id === 0 ? { ...player, townlessDays: days, eliminated } : player,
      ),
    });
    expect(townlessLeft(withDays(0))).toBe(TOWNLESS_DAYS);
    expect(townlessLeft(withDays(3))).toBe(TOWNLESS_DAYS - 3);
    expect(townlessLeft(withDays(TOWNLESS_DAYS))).toBe(0);
    expect(townlessLeft(withDays(1, true))).toBeNull();
  });
});
