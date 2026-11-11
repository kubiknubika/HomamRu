import { createGame } from "@homamru/core";
import type { GameEvent, GameState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { activeHero, createSession } from "./session.ts";
import type { SessionSnapshot } from "./session.ts";

function newGame(terrain?: string[]): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: terrain ?? Array.from({ length: 12 }, () => "............"),
      players: [{ hero: { x: 0, y: 0 } }],
    },
    1,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

function heroOf(snapshot: SessionSnapshot) {
  return activeHero(snapshot.state);
}

describe("управление героем", () => {
  it("первое касание показывает путь и не двигает героя", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 3, y: 0 });
    const snapshot = session.getSnapshot();
    expect(heroOf(snapshot)).toMatchObject({ x: 0, y: 0, movement: 1000 });
    expect(snapshot.selection).toMatchObject({
      target: { x: 3, y: 0 },
      path: { found: true, steps: ["E", "E", "E"], stepsToday: 3, days: 1 },
    });
  });

  it("второе касание той же клетки отправляет героя", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 3, y: 0 });
    session.tapCell({ x: 3, y: 0 });
    const snapshot = session.getSnapshot();
    expect(heroOf(snapshot)).toMatchObject({ x: 3, y: 0, movement: 700 });
    expect(snapshot.selection).toBeNull();
  });

  it("касание другой клетки показывает новый путь", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 3, y: 0 });
    session.tapCell({ x: 0, y: 2 });
    const snapshot = session.getSnapshot();
    expect(heroOf(snapshot)).toMatchObject({ x: 0, y: 0 });
    expect(snapshot.selection).toMatchObject({
      target: { x: 0, y: 2 },
      path: { steps: ["S", "S"] },
    });
  });

  it("недостижимая клетка помечается: путь не найден, герой стоит", () => {
    const terrain = Array.from({ length: 8 }, () => "........");
    terrain[0] = "..#.....";
    const session = createSession(newGame(terrain));
    session.tapCell({ x: 2, y: 0 });
    expect(session.getSnapshot().selection).toEqual({
      target: { x: 2, y: 0 },
      path: { found: false },
    });
    session.tapCell({ x: 2, y: 0 });
    expect(heroOf(session.getSnapshot())).toMatchObject({ x: 0, y: 0, movement: 1000 });
  });

  it("касание клетки героя снимает выбор; касание вне карты ничего не меняет", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 3, y: 0 });
    session.tapCell({ x: -1, y: 0 });
    session.tapCell({ x: 0, y: 12 });
    expect(session.getSnapshot().selection).not.toBeNull();
    session.tapCell({ x: 0, y: 0 });
    expect(session.getSnapshot().selection).toBeNull();
  });

  it("на дальнем пути герой идёт, на сколько хватает очков, а остаток пути остаётся", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 0, y: 11 });
    expect(session.getSnapshot().selection?.path).toMatchObject({ days: 2, stepsToday: 10 });

    session.tapCell({ x: 0, y: 11 });
    let snapshot = session.getSnapshot();
    expect(heroOf(snapshot)).toMatchObject({ x: 0, y: 10, movement: 0 });
    expect(snapshot.selection).toMatchObject({
      target: { x: 0, y: 11 },
      path: { steps: ["S"], stepsToday: 0, days: 2 },
    });

    // Очков нет: ещё одно касание героя не двигает.
    session.tapCell({ x: 0, y: 11 });
    expect(heroOf(session.getSnapshot())).toMatchObject({ x: 0, y: 10 });

    // Новый день: путь снова проходим, одно касание цели доводит героя.
    session.endTurn();
    snapshot = session.getSnapshot();
    expect(snapshot.state.day).toBe(2);
    expect(snapshot.selection?.path).toMatchObject({ stepsToday: 1, days: 1 });
    session.tapCell({ x: 0, y: 11 });
    snapshot = session.getSnapshot();
    expect(heroOf(snapshot)).toMatchObject({ x: 0, y: 11, movement: 900 });
    expect(snapshot.selection).toBeNull();
  });
});

describe("конец дня", () => {
  it("меняет день и восстанавливает запас хода", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 2, y: 2 });
    session.tapCell({ x: 2, y: 2 });
    expect(heroOf(session.getSnapshot())?.movement).toBe(718);
    session.endTurn();
    expect(session.getSnapshot().state.day).toBe(2);
    expect(heroOf(session.getSnapshot())?.movement).toBe(1000);
  });
});

describe("подписка", () => {
  it("слушатель получает снимок и события команды", () => {
    const session = createSession(newGame());
    const seen: { snapshot: SessionSnapshot; events: readonly GameEvent[] }[] = [];
    const unsubscribe = session.subscribe((snapshot, events) => {
      seen.push({ snapshot, events });
    });
    session.tapCell({ x: 1, y: 1 });
    session.tapCell({ x: 1, y: 1 });
    session.endTurn();
    expect(seen.map((entry) => entry.events.map((event) => event.type))).toEqual([
      [],
      ["heroStepped"],
      ["turnEnded", "dayStarted"],
    ]);
    expect(seen.at(-1)?.snapshot).toBe(session.getSnapshot());

    unsubscribe();
    session.endTurn();
    expect(seen).toHaveLength(3);
  });

  it("снимок не меняется, пока ничего не произошло", () => {
    const session = createSession(newGame());
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });
});
