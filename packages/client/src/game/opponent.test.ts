// Экран с противником: docs/mechanics/43-opponent-screen.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame, townsOf } from "@homamru/core";
import type { ArmyStack, Command, GameEvent, GameState, MapObjectDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { CREATURE_MANY, describeCell, fightWarning } from "./captions.ts";
import { loadDefaults } from "./content.ts";
import { finishBattle, go } from "./screenKit.ts";
import { createSession } from "./session.ts";
import type { Session } from "./session.ts";
import { computerToMove, endingOf, townlessLeft } from "./view.ts";

const START = ["tavern", "fort", "militia-yard"];
const HOME: MapObjectDefinition = { type: "town", x: 0, y: 4, owner: 0, buildings: START };
const THEIRS: MapObjectDefinition = { type: "town", x: 4, y: 4, owner: 1, buildings: START };
const militia = (count: number): ArmyStack[] => [{ creature: "militia", count }];

/** Игрок — герой A в (0, 0); противник-компьютер — герой B в (4, 0). */
function duel(objects: MapObjectDefinition[], mine = 100, theirs = 10): GameState {
  const created = createGame(
    {
      id: "duel",
      name: "Двое",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        {
          hero: { x: 0, y: 0, attack: 0, defense: 0, army: militia(mine) },
          resources: { gold: 20_000 },
        },
        { hero: { x: 4, y: 0, attack: 0, defense: 0, army: militia(theirs) }, kind: "computer" },
      ],
      objects,
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

function place(state: GameState, owner: number, x: number, y: number): GameState {
  return {
    ...state,
    heroes: state.heroes.map((hero) => (hero.owner === owner ? { ...hero, x, y } : hero)),
  };
}

function withoutEnemyHero(state: GameState): GameState {
  return { ...state, heroes: state.heroes.filter((hero) => hero.owner === 0) };
}

function captionOf(session: Session): string {
  const { selection, state } = session.getSnapshot();
  return selection?.fight === null || selection === null
    ? ""
    : fightWarning(state, selection.fight);
}

/** Карта просит действия противника, пока он ходит и не начался бой с игроком. */
function watchOpponent(session: Session): void {
  for (let count = 0; count < 500; count += 1) {
    const { state, battle } = session.getSnapshot();
    if (!computerToMove(state) || battle !== null || state.battle !== null) {
      return;
    }
    session.opponentStep();
  }
}

const linesOf = (session: Session): readonly string[] => session.getSnapshot().notice?.lines ?? [];

describe("подписи противника", () => {
  it("удержание на герое и городе противника: имя, армия и гарнизон словами", () => {
    const state = duel([HOME, { ...THEIRS, garrison: militia(12) } as MapObjectDefinition]);
    expect(describeCell(state, { x: 4, y: 0 })).toBe(
      "Герой противника: Ратибор. Армия: группа ополченцев (10–19)",
    );
    expect(describeCell(state, { x: 4, y: 4 })).toBe(
      "Город противника. Гарнизон: группа ополченцев (10–19)",
    );
    expect(describeCell(duel([THEIRS]), { x: 4, y: 4 })).toBe("Город противника. Гарнизон пуст");
    expect(describeCell(state, { x: 0, y: 4 })).toBe("Город, ваш. В день: золото +500");
  });

  it("герой противника в своём городе — строка о городе и строка о герое", () => {
    const state = duel([THEIRS]);
    expect(describeCell(place(state, 1, 4, 4), { x: 4, y: 4 })).toBe(
      "Город противника. Гарнизон пуст. Герой противника: Ратибор. Армия: группа ополченцев (10–19)",
    );
  });

  it("касание героя и города противника: «будет бой», пустого города — «будет захвачен»", () => {
    const session = createSession(
      duel([{ ...THEIRS, garrison: militia(3) } as MapObjectDefinition]),
    );
    session.tapCell({ x: 4, y: 0 });
    expect(captionOf(session)).toBe(
      "Герой противника: Ратибор. Армия: группа ополченцев (10–19) — будет бой",
    );
    session.tapCell({ x: 4, y: 4 });
    expect(captionOf(session)).toBe(
      "Город противника. Гарнизон: горстка ополченцев (1–4) — будет бой",
    );
    const empty = createSession(duel([THEIRS]));
    empty.tapCell({ x: 4, y: 4 });
    expect(captionOf(empty)).toBe("Город противника, гарнизон пуст — город будет захвачен");
  });
});

describe("слова о существах", () => {
  it("у каждого существа игры есть название во множественном числе", () => {
    expect(loadDefaults().creatures.filter((c) => CREATURE_MANY[c.id] === undefined)).toEqual([]);
  });
});

describe("нападение на противника", () => {
  it("бой с героем противника: игрок — нападающий; победа убирает героя с карты", () => {
    const session = createSession(duel([HOME, THEIRS]));
    go(session, 4, 0);
    expect(session.getSnapshot().state.battle).toMatchObject({ defenderHeroId: "B" });
    session.enterBattle();
    expect(session.getSnapshot().battle?.getSnapshot().playerSide).toBe(0);
    finishBattle(session);
    const { state, summary } = session.getSnapshot();
    expect(summary).toMatchObject({ enemyHeroDefeated: true });
    expect(summary?.experience).toBeGreaterThan(500);
    expect(state.heroes.map((hero) => hero.id)).toEqual(["A"]);
    session.leaveBattle();
    expect(session.getSnapshot().battle).toBeNull();
  });

  it("пустой город захватывается: экран города открывается, в нём можно строить", () => {
    const session = createSession(duel([HOME, THEIRS]));
    go(session, 4, 4);
    session.heroArrived();
    const { state, townId } = session.getSnapshot();
    expect(townsOf(state, 0).map((town) => town.id)).toEqual(["o1", "o2"]);
    expect(townId).toBe("o2");
    expect(linesOf(session)).toEqual(["Город захвачен", "Противник без города: осталось дней — 7"]);
    session.build("town-hall");
    const captured = townsOf(session.getSnapshot().state, 0).find((town) => town.id === "o2");
    expect(captured?.buildings).toContain("town-hall");
  });

  it("город с гарнизоном берётся боем; после боя открывается его экран", () => {
    const town = { ...THEIRS, garrison: militia(5) } as MapObjectDefinition;
    const session = createSession(duel([HOME, town]));
    go(session, 4, 4);
    session.enterBattle();
    finishBattle(session);
    session.leaveBattle();
    expect(session.getSnapshot().townId).toBe("o2");
    expect(linesOf(session)).toContain("Город захвачен");
    expect(endingOf(session.getSnapshot().state)).toBeNull();
  });

  it("у противника не осталось ни героя, ни города — «Победа» с числом дней", () => {
    const session = createSession(withoutEnemyHero(duel([HOME, THEIRS])));
    go(session, 4, 4);
    expect(endingOf(session.getSnapshot().state)).toEqual({ kind: "victory", days: 1 });
    // Партия окончена: экран города не открывается, карта касаний не принимает.
    session.heroArrived();
    session.openTown();
    expect(session.getSnapshot()).toMatchObject({ townId: null, townList: false });
  });
});

describe("свои города", () => {
  it("два города — кнопка «Город» открывает список, выбор открывает экран", () => {
    const session = createSession(duel([HOME, THEIRS]));
    session.openTown();
    expect(session.getSnapshot()).toMatchObject({ townId: "o1", townList: false });
    session.closeTown();
    go(session, 4, 4);
    session.closeTown();
    session.openTown();
    expect(session.getSnapshot()).toMatchObject({ townId: null, townList: true });
    session.chooseTown("o2");
    expect(session.getSnapshot()).toMatchObject({ townId: "o2", townList: false });
    session.chooseTown("нет такого");
    expect(session.getSnapshot().townId).toBe("o2");
  });
});

describe("ход противника", () => {
  it("после «Конец дня» управление не работает; карта по одному просит действия противника", () => {
    const saved: Command[] = [];
    const session = createSession(duel([HOME, THEIRS]), (command) => saved.push(command));
    const steps: GameEvent[] = [];
    session.subscribe((_snapshot, events) => {
      steps.push(...events.filter((event) => event.type === "heroStepped"));
    });
    session.endTurn();
    expect(computerToMove(session.getSnapshot().state)).toBe(true);
    // Не ход игрока: ни касания, ни кнопки не работают.
    go(session, 1, 1);
    session.openTown();
    session.endTurn();
    expect(session.getSnapshot()).toMatchObject({ selection: null, townId: null });
    expect(saved.length).toBe(1);
    session.opponentStep();
    expect(saved.length).toBe(2);
    watchOpponent(session);
    const { state } = session.getSnapshot();
    expect(state).toMatchObject({ currentPlayer: 0, day: 2 });
    expect(steps.length).toBeGreaterThan(0);
    // Каждая команда противника сохранена, как команда игрока.
    expect(saved.at(-1)).toEqual({ type: "endTurn", player: 1 });
    go(session, 1, 1);
    expect(session.getSnapshot().state.heroes.find((hero) => hero.id === "A")).toMatchObject({
      x: 1,
      y: 1,
    });
  });

  it("что сделал противник — строками; в конце — доход игрока", () => {
    const mine: MapObjectDefinition = { type: "mine", x: 5, y: 1, kind: "ore-pit" };
    // Герой игрока стоит в своём городе: противник на город не идёт.
    const session = createSession(place(duel([HOME, THEIRS, mine]), 0, 0, 4));
    session.endTurn();
    watchOpponent(session);
    expect(linesOf(session)).toContain("Противник занял рудник");
    expect(linesOf(session).at(-1)).toMatch(/^Доход: золото \+\d+$/);
    // Стройка и наём противника игроку не сообщаются.
    expect(linesOf(session).join(" ")).not.toMatch(/Построено|Нанято/);
  });

  it("победа противника над охранником — строкой; бой не показывается", () => {
    const guard: MapObjectDefinition = { type: "guard", x: 6, y: 2, creature: "militia", count: 2 };
    const session = createSession(duel([guard], 100, 60));
    session.endTurn();
    watchOpponent(session);
    expect(linesOf(session)).toContain("Противник победил охранника: ополченец");
    expect(session.getSnapshot().battle).toBeNull();
  });

  it("«Пропустить»: ход противника доигрывается сразу, шагов героя карта не показывает", () => {
    const session = createSession(duel([HOME, THEIRS]));
    session.endTurn();
    const seen: GameEvent[] = [];
    session.subscribe((_snapshot, events) => {
      seen.push(...events);
    });
    session.skipOpponent();
    expect(session.getSnapshot().state).toMatchObject({ currentPlayer: 0, day: 2 });
    expect(seen.some((event) => event.type === "heroStepped")).toBe(false);
    expect(seen.some((event) => event.type === "dayStarted")).toBe(true);
  });

  it("игру закрыли посреди хода противника — после загрузки ход идёт дальше", () => {
    const first = createSession(duel([HOME, THEIRS]));
    first.endTurn();
    first.opponentStep();
    const again = createSession(first.getSnapshot().state);
    watchOpponent(again);
    expect(again.getSnapshot().state).toMatchObject({ currentPlayer: 0, day: 2 });
  });
});

describe("противник нападает на игрока", () => {
  it("открывается бой, игрок — обороняющийся; «Пропустить» бой не пропускает", () => {
    const session = createSession(duel([HOME, THEIRS], 20, 300));
    session.endTurn();
    session.skipOpponent();
    const { state } = session.getSnapshot();
    expect(state.battle).toMatchObject({ heroId: "B", defenderHeroId: "A" });
    // Пока бой не открыт и не сыгран, противник дальше не ходит.
    session.opponentStep();
    session.skipOpponent();
    expect(session.getSnapshot().state.battle).not.toBeNull();
    session.enterBattle();
    const battle = session.getSnapshot().battle;
    expect(battle?.getSnapshot().playerSide).toBe(1);
    finishBattle(session);
    expect(battle?.getSnapshot().state.result?.winner).toBe(0);
    expect(session.getSnapshot().summary).toMatchObject({
      experience: 0,
      enemyHeroDefeated: false,
    });
    // Герой погиб, но город цел: партия идёт, ход противника продолжается.
    session.leaveBattle();
    expect(endingOf(session.getSnapshot().state)).toBeNull();
    watchOpponent(session);
    // Противник дошёл до пустого города игрока: ни героя, ни города.
    expect(linesOf(session)).toContain("Противник захватил ваш город");
    expect(endingOf(session.getSnapshot().state)).toEqual({ kind: "defeat", reason: "nothing" });
  });

  it("у игрока не осталось ни героя, ни города — «Поражение»", () => {
    const session = createSession(duel([THEIRS], 20, 300));
    session.endTurn();
    session.skipOpponent();
    session.enterBattle();
    finishBattle(session);
    session.leaveBattle();
    expect(endingOf(session.getSnapshot().state)).toEqual({ kind: "defeat", reason: "nothing" });
    // После конца партии противник не ходит.
    session.opponentStep();
    expect(computerToMove(session.getSnapshot().state)).toBe(false);
  });
});

describe("семь дней без города", () => {
  it("противник взял город игрока: сообщение, отсчёт в полосе, на седьмой день — поражение", () => {
    // Герой игрока далеко и слаб для нападения: противник идёт в пустой город.
    const game = createSession(place(duel([HOME, THEIRS], 500, 10), 0, 7, 7));
    expect(townlessLeft(game.getSnapshot().state)).toBeNull();
    let taken = false;
    for (let day = 0; day < 12 && endingOf(game.getSnapshot().state) === null; day += 1) {
      game.endTurn();
      game.skipOpponent();
      taken = taken || linesOf(game).includes("Противник захватил ваш город");
    }
    expect(taken).toBe(true);
    expect(endingOf(game.getSnapshot().state)).toEqual({ kind: "defeat", reason: "townless" });
  });
});
