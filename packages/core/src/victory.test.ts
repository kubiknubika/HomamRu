// Правила и примеры из docs/mechanics/41-victory.md и «Несколько городов» из 40-two-players.md.
import { describe, expect, it } from "vitest";
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand } from "./commands.ts";
import {
  army,
  captured,
  duel,
  end,
  enemyTown,
  HOME,
  move,
  passDays,
  put,
  run,
  TO_TOWN,
  withoutHero,
  lines,
} from "./duelKit.ts";
import { formatEvent } from "./render.ts";
import type { Command } from "./types.ts";

describe("захваченный город", () => {
  it("строить можно в каждом своём городе в один день; доход — сумма по городам", () => {
    const state = run(
      captured(),
      { type: "build", player: 0, townId: "o1", building: "town-hall" },
      { type: "build", player: 0, townId: "o2", building: "town-hall" },
    );
    const before = state.players[0]?.resources.gold ?? 0;
    const next = passDays(state, 1);
    expect((next.players[0]?.resources.gold ?? 0) - before).toBe(2000);
  });

  it("существа, ждущие найма, достаются новому владельцу", () => {
    const state = captured();
    const town = state.objects[1];
    const waiting = town?.type === "town" ? (town.available[0]?.count ?? 0) : 0;
    expect(waiting).toBeGreaterThan(0);
    const command: Command = {
      type: "recruit",
      player: 0,
      townId: "o2",
      creature: "militia",
      count: waiting,
    };
    expect(applyCommand(state, command).ok).toBe(true);
  });

  it("прежний владелец командовать городом не может; героя нанимают в любом своём городе", () => {
    const state = run(withoutHero(captured(), "A"), end(0));
    const lost: Command = { type: "build", player: 1, townId: "o2", building: "town-hall" };
    expect(lines(state, lost)).toEqual(["NO_TOWN"]);
    const again = run(state, end(1));
    const hired = run(again, { type: "hireHero", player: 0, townId: "o2", offer: 0 });
    expect(hired.heroes.find((hero) => hero.owner === 0)).toMatchObject({ x: 4, y: 4 });
  });

  it("игрок без города, захватив город, получает таверну с двумя героями", () => {
    const start = put(duel([enemyTown()]), "A", 3, 3);
    expect(start.players[0]?.tavern).toEqual([]);
    expect(run(start, TO_TOWN).players[0]?.tavern.length).toBe(2);
  });
});

describe("семь дней без города", () => {
  it("счётчик растёт в начале дня; на седьмом дне игрок выбывает, противник победил", () => {
    // Город захвачен в день 1; в начале дня 8 счётчик достигает 7.
    const sixth = passDays(captured(), 6);
    expect(sixth).toMatchObject({ day: 7, outcome: null });
    expect(sixth.players[1]).toMatchObject({ townlessDays: 6, eliminated: false });
    const result = applyCommand(run(sixth, end(0)), end(1));
    const after = result.ok ? result.state : sixth;
    expect(after).toMatchObject({ day: 8, outcome: "victory", winner: 0 });
    expect(after.heroes.map((hero) => hero.id)).toEqual(["A"]);
    expect(result.ok ? result.events.map(formatEvent) : []).toEqual([
      "Игрок 2 закончил ход",
      "Начался день 8 (месяц 1, неделя 2, день 1)",
      "Игрок 2 без города: осталось дней — 0",
      "Игрок 2 выбыл: вышли семь дней без города",
      "Партия окончена: победил игрок 1",
    ]);
  });

  it("игрок отбил город — счётчик сброшен, партия идёт", () => {
    // Герой A ушёл из города; герой B стоит рядом и входит в пустой город.
    const moved = put(put(passDays(captured(), 3), "A", 0, 0), "B", 5, 5);
    const back = run(moved, end(0), move(1, "NW"));
    expect(back.objects[1]).toMatchObject({ owner: 1 });
    expect(back.players[1]).toMatchObject({ townlessDays: null });
    expect(back.players[1]?.tavern.length).toBe(2);
    expect(passDays(back, 10).outcome).toBeNull();
  });

  it("идёт отсчёт, герой погиб — игрок выбывает сразу", () => {
    const state = put(put(captured(), "A", 3, 0), "B", 4, 0);
    const { state: after } = playBattleOut(run(state, move(0, "E")));
    expect(after).toMatchObject({ outcome: "victory", winner: 0 });
  });

  it("игрок, начавший без города, отсчёта не получает", () => {
    const state = passDays(duel([HOME]), 10);
    expect(state.outcome).toBeNull();
    expect(state.players[1]).toMatchObject({ townlessDays: null, eliminated: false });
  });

  it("оба героя погибли, города целы — партия идёт", () => {
    const state = withoutHero(withoutHero(duel([HOME, enemyTown()]), "A"), "B");
    expect(passDays(state, 10).outcome).toBeNull();
  });
});

describe("свойства, верные всегда", () => {
  it("в партиях двух компьютеров боя: число городов не меняется, у играющего есть город или герой", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const mine = army(`militia:${10 + seed * 3}`);
      const theirs = army(`militia:${40 - seed}`, "slinger:5");
      let state = put(duel([HOME, enemyTown(army("militia:8"))], mine, theirs), "A", 3, 3);
      state = playBattleOut(run(state, TO_TOWN)).state;
      state = passDays(state, 8);
      expect(state.objects.filter((object) => object.type === "town").length).toBe(2);
      for (const player of state.players) {
        const town = state.objects.some((o) => o.type === "town" && o.owner === player.id);
        const hero = state.heroes.some((candidate) => candidate.owner === player.id);
        expect(player.eliminated).toBe(!town && !hero);
        expect(player.townlessDays === null || (!town && player.townlessDays < 7)).toBe(true);
      }
      const winner = state.players.find((player) => player.id === state.winner);
      expect(winner?.eliminated ?? false).toBe(false);
    }
  });
});
