// Экран города: docs/mechanics/33-town-screen.md. Сессия, подписи, слова экрана.
import { CONTENT } from "@homamru/core/testkit";
import { chooseBattleCommand, createGame, townOf } from "@homamru/core";
import type { GameState, MapObjectDefinition, ResourceAmounts, TownState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { describeObject } from "./captions.ts";
import { activeHero, createSession } from "./session.ts";
import type { Session } from "./session.ts";
import { amountsText, armyText, buildingGives, buildingStatus, recruitRows } from "./townTexts.ts";

const RICH = { gold: 20_000, wood: 20, ore: 20 };
const TOWN: MapObjectDefinition = {
  type: "town",
  x: 1,
  y: 1,
  owner: 0,
  buildings: ["tavern", "fort", "militia-yard"],
};
const STRONG_GUARD: MapObjectDefinition = {
  type: "guard",
  x: 5,
  y: 5,
  creature: "falcon",
  count: 300,
};

function newGame(resources: ResourceAmounts = RICH, objects = [TOWN]): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] }, resources }],
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

function go(session: Session, x: number, y: number): void {
  session.tapCell({ x, y });
  session.tapCell({ x, y });
}

function townIn(session: Session): TownState {
  const town = townOf(session.getSnapshot().state, 0);
  if (town === undefined) {
    throw new Error("Города нет.");
  }
  return town;
}

/** Состояние здания в городе сессии. */
function statusIn(session: Session, id: string) {
  const { state } = session.getSnapshot();
  const building = state.buildings.find((candidate) => candidate.id === id);
  return building === undefined ? undefined : buildingStatus(state, townIn(session), building);
}

/** Первая строка найма в городе партии. */
function firstRow(state: GameState) {
  const town = townOf(state, 0);
  return town === undefined ? undefined : recruitRows(state, town)[0];
}

function linesOf(session: Session): readonly string[] {
  return session.getSnapshot().notice?.lines ?? [];
}

function goldOf(session: Session): number {
  return session.getSnapshot().state.players[0]?.resources.gold ?? -1;
}

/** Доигрывает бой на экране: за игрока ходит тот же простой компьютер. */
function finishBattle(session: Session): void {
  const battle = session.getSnapshot().battle;
  if (battle === null) {
    return;
  }
  for (let turn = 0; turn < 500; turn += 1) {
    battle.animationDone();
    const { state } = battle.getSnapshot();
    const command = chooseBattleCommand(state);
    if (command === undefined) {
      return;
    }
    if (command.type === "battleMove") {
      battle.tapCell(command.to);
      battle.tapCell(command.to);
    } else if (command.type === "battleAttack") {
      const target = state.stacks.find((stack) => stack.id === command.target);
      battle.tapCell(target ?? command.from);
      battle.tapCell(command.from);
      battle.tapCell(command.from);
    } else if (command.type === "battleWait") {
      battle.wait();
    } else {
      battle.defend();
    }
  }
}

describe("открытие экрана города", () => {
  it("кнопка «Город» открывает экран из любого места карты", () => {
    const session = createSession(newGame());
    expect(session.getSnapshot().townOpen).toBe(false);
    session.openTown();
    expect(session.getSnapshot().townOpen).toBe(true);
    session.closeTown();
    expect(session.getSnapshot().townOpen).toBe(false);
  });

  it("герой встал на клетку города — экран открывается сам", () => {
    const session = createSession(newGame());
    go(session, 1, 1);
    session.heroArrived();
    expect(session.getSnapshot()).toMatchObject({ townOpen: true, selection: null });
  });

  it("герой дошёл до другой клетки — экран не открывается", () => {
    const session = createSession(newGame());
    go(session, 2, 0);
    session.heroArrived();
    expect(session.getSnapshot().townOpen).toBe(false);
  });

  it("на карте без города экрана города нет", () => {
    const session = createSession(newGame(RICH, []));
    session.openTown();
    session.build("town-hall");
    expect(session.getSnapshot().townOpen).toBe(false);
    expect(linesOf(session)).toEqual([]);
  });
});

describe("действия города", () => {
  it("строительство: здание появляется, ресурсы списаны, сообщение «Построено»", () => {
    const session = createSession(newGame());
    session.build("town-hall");
    expect(townIn(session).buildings).toContain("town-hall");
    expect(goldOf(session)).toBe(17_500);
    expect(linesOf(session)).toEqual(["Построено: ратуша"]);
  });

  it("второе здание в тот же день не строится и ничего не меняет", () => {
    const session = createSession(newGame());
    session.build("town-hall");
    session.build("smithy");
    expect(townIn(session).buildings).not.toContain("smithy");
    expect(goldOf(session)).toBe(17_500);
  });

  it("наём: существа встают в гарнизон, сообщение «Нанято»", () => {
    const session = createSession(newGame());
    const { price } = recruitRows(session.getSnapshot().state, townIn(session))[0]?.creature ?? {
      price: 0,
    };
    session.recruit("militia", 3);
    expect(townIn(session).garrison).toEqual([{ creature: "militia", count: 3 }]);
    expect(goldOf(session)).toBe(20_000 - 3 * price);
    expect(linesOf(session)).toEqual(["Нанято: ополченец 3"]);
  });

  it("перенос: из гарнизона герою и обратно; последний отряд героя остаётся", () => {
    const session = createSession(newGame());
    go(session, 1, 1);
    session.recruit("militia", 4);
    session.transfer("garrison", "militia", 4);
    expect(activeHero(session.getSnapshot().state)?.army).toEqual([
      { creature: "militia", count: 14 },
    ]);
    session.transfer("hero", "militia", 14);
    expect(activeHero(session.getSnapshot().state)?.army).toEqual([
      { creature: "militia", count: 14 },
    ]);
    session.transfer("hero", "militia", 5);
    expect(townIn(session).garrison).toEqual([{ creature: "militia", count: 5 }]);
  });

  it("героя в городе нет — перенос ничего не меняет", () => {
    const session = createSession(newGame());
    session.recruit("militia", 4);
    session.transfer("garrison", "militia", 4);
    expect(townIn(session).garrison).toEqual([{ creature: "militia", count: 4 }]);
  });

  it("пока герой есть, второго не нанять", () => {
    const session = createSession(newGame());
    session.hireHero(0);
    expect(session.getSnapshot().state.heroes).toHaveLength(1);
    expect(goldOf(session)).toBe(20_000);
  });

  it("начало недели: сообщение о приросте", () => {
    const session = createSession(newGame());
    const before = recruitRows(session.getSnapshot().state, townIn(session))[0];
    for (let day = 0; day < 7; day += 1) {
      session.endTurn();
    }
    const after = recruitRows(session.getSnapshot().state, townIn(session))[0];
    expect(linesOf(session)).toContain(`Прирост: ополченец +${before?.growth}`);
    expect(after?.available).toBe((before?.available ?? 0) + (before?.growth ?? 0));
  });
});

describe("потеря героя при городе", () => {
  it("партия продолжается: героя нет, в таверне нанимается новый — он стоит в городе", () => {
    const session = createSession(newGame(RICH, [TOWN, STRONG_GUARD]));
    go(session, 4, 4);
    session.enterBattle();
    finishBattle(session);
    session.leaveBattle();
    const lost = session.getSnapshot();
    expect(lost.state.outcome).toBeNull();
    expect(activeHero(lost.state)).toBeUndefined();

    const offered = lost.state.players[0]?.tavern[0];
    session.hireHero(0);
    const { state } = session.getSnapshot();
    expect(activeHero(state)).toMatchObject({ x: 1, y: 1, kind: offered?.kind });
    expect(goldOf(session)).toBe(20_000 - CONTENT.tavern.price);
    const name = CONTENT.heroes.find((hero) => hero.id === offered?.kind)?.name;
    expect(linesOf(session)).toEqual([`Нанят герой: ${name}`]);
  });
});

describe("слова города", () => {
  it("подпись города: чей и доход в день — с ратушей больше", () => {
    const session = createSession(newGame());
    expect(describeObject(session.getSnapshot().state, townIn(session))).toBe(
      "Город, ваш. В день: золото +500",
    );
    session.build("town-hall");
    expect(describeObject(session.getSnapshot().state, townIn(session))).toBe(
      "Город, ваш. В день: золото +1000",
    );
  });

  it("состояние здания: построено, можно строить, причина словами", () => {
    const state = newGame({ gold: 700, wood: 5 });
    const town = townOf(state, 0);
    const statusOf = (id: string) => {
      const building = state.buildings.find((candidate) => candidate.id === id);
      return building === undefined || town === undefined
        ? undefined
        : buildingStatus(state, town, building);
    };
    expect(statusOf("tavern")).toEqual({ kind: "built" });
    expect(statusOf("town-hall")).toEqual({ kind: "blocked", reason: "не хватает: золото 1800" });
    expect(statusOf("slinger-range")).toEqual({
      kind: "blocked",
      reason: "не хватает: золото 300, руда 5",
    });
    expect(statusOf("falcon-tower")).toEqual({ kind: "blocked", reason: "нужно: казарма" });
    expect(statusOf("barracks")).toEqual({ kind: "blocked", reason: "нужно: кузница" });
  });

  it("после стройки остальные здания — «сегодня уже строили»", () => {
    const session = createSession(newGame());
    expect(statusIn(session, "smithy")).toEqual({ kind: "available" });
    session.build("town-hall");
    expect(statusIn(session, "smithy")).toEqual({ kind: "blocked", reason: "сегодня уже строили" });
  });

  it("что даёт здание", () => {
    const state = newGame();
    const gives = Object.fromEntries(
      state.buildings.map((building) => [building.id, buildingGives(state, building)]),
    );
    expect(gives).toMatchObject({
      tavern: "наём героя",
      "town-hall": "доход города 1000 золота в день",
      citadel: "прирост во всех жилищах +50%",
      fort: "нужно для: цитадель, двор ополченцев",
    });
    expect(gives["militia-yard"]).toMatch(/^наём: ополченец, \d+ в неделю$/u);
  });

  it("«Все» — сколько ждёт найма и на сколько хватает золота", () => {
    const rich = newGame();
    const poor = newGame({ gold: 130 });
    const richRow = firstRow(rich);
    const poorRow = firstRow(poor);
    expect(richRow?.affordable).toBe(richRow?.available);
    expect(poorRow?.affordable).toBe(Math.floor(130 / (poorRow?.creature.price ?? 1)));
  });

  it("цена и армия строкой", () => {
    const state = newGame();
    expect(amountsText({ gold: 500, ore: 10 })).toBe("золото 500, руда 10");
    expect(amountsText({})).toBe("бесплатно");
    expect(
      armyText(state, [
        { creature: "militia", count: 12 },
        { creature: "slinger", count: 5 },
      ]),
    ).toBe("ополченец 12, пращник 5");
  });
});
