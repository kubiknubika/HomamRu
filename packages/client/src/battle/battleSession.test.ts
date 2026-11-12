import { findStack } from "@homamru/core";
import type { BattleEvent } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { createBattleSession, playerStack } from "./battleSession.ts";
import { battle, place, ready } from "./testkit.ts";

function types(events: readonly BattleEvent[]): string[] {
  return events.map((event) => event.type);
}

describe("управление в бою — 16-battle-screen.md", () => {
  it("до первого показа управление заперто; потом ход у игрока", () => {
    const session = createBattleSession(battle(["falcon:5"], ["militia:5"]));
    expect(session.getSnapshot().locked).toBe(true);
    session.tapCell({ col: 3, row: 5 });
    expect(session.getSnapshot().selection).toBeNull();
    session.animationDone();
    expect(session.getSnapshot().locked).toBe(false);
    expect(playerStack(session.getSnapshot())?.id).toBe("a1");
  });

  it("первое касание клетки выбирает её, второе — отряд идёт", () => {
    const session = ready(battle(["falcon:5"], ["militia:5"]));
    session.tapCell({ col: 3, row: 5 });
    expect(session.getSnapshot().selection).toEqual({ kind: "move", cell: { col: 3, row: 5 } });
    expect(findStack(session.getSnapshot().state, "a1")).toMatchObject({ col: 0, row: 5 });
    session.tapCell({ col: 3, row: 5 });
    const snapshot = session.getSnapshot();
    expect(findStack(snapshot.state, "a1")).toMatchObject({ col: 3, row: 5 });
    expect(snapshot).toMatchObject({
      selection: null,
      locked: true,
      log: "Сокол (ваш) перемещается",
    });
  });

  it("касание недостижимой клетки и другой клетки снимает или меняет выбор", () => {
    const session = ready(battle(["militia:5"], ["militia:5"]));
    session.tapCell({ col: 2, row: 5 });
    session.tapCell({ col: 3, row: 5 });
    expect(session.getSnapshot().selection).toEqual({ kind: "move", cell: { col: 3, row: 5 } });
    session.tapCell({ col: 9, row: 5 });
    expect(session.getSnapshot().selection).toBeNull();
    expect(findStack(session.getSnapshot().state, "a1")).toMatchObject({ col: 0, row: 5 });
  });

  it("стрелок: первое касание врага показывает урон «от и до», второе — выстрел", () => {
    const session = ready(battle(["slinger:20"], ["militia:10"]));
    session.tapCell({ col: 14, row: 5 });
    // 20 пращников: база от 20 до 80, дальше 10 клеток — вполсилы.
    expect(session.getSnapshot().selection).toEqual({
      kind: "shoot",
      targetId: "b1",
      damage: { min: 10, max: 40 },
    });
    const seen: string[][] = [];
    session.subscribe((_, events) => seen.push(types(events)));
    session.tapCell({ col: 14, row: 5 });
    expect(seen).toEqual([["strike", "stackTurn"]]);
    expect(findStack(session.getSnapshot().state, "a1")?.shots).toBe(9);
  });

  it("враг в досягаемости: подсвечены клетки удара, касание одной из них — удар с неё", () => {
    const session = ready(place(battle(["falcon:5"], ["militia:30"]), { b1: [5, 5] }));
    session.tapCell({ col: 5, row: 5 });
    const selection = session.getSnapshot().selection;
    expect(selection).toMatchObject({
      kind: "attack",
      targetId: "b1",
      damage: { min: 16, max: 27 },
    });
    expect(selection?.kind === "attack" ? selection.cells.length : 0).toBe(6);
    // Второе касание по врагу при нескольких клетках ничего не отправляет.
    session.tapCell({ col: 5, row: 5 });
    expect(session.getSnapshot().locked).toBe(false);
    // Первое касание клетки удара только выбирает её (оранжевая), второе — бьёт.
    session.tapCell({ col: 4, row: 5 });
    expect(session.getSnapshot()).toMatchObject({
      locked: false,
      selection: { from: { col: 4, row: 5 } },
    });
    session.tapCell({ col: 6, row: 5 });
    expect(session.getSnapshot()).toMatchObject({
      locked: false,
      selection: { from: { col: 6, row: 5 } },
    });
    session.tapCell({ col: 4, row: 5 });
    session.tapCell({ col: 4, row: 5 });
    const snapshot = session.getSnapshot();
    expect(findStack(snapshot.state, "a1")).toMatchObject({ col: 4, row: 5 });
    expect(snapshot.log).toMatch(
      /^Сокол \(ваш\) бьёт: Ополченец \(враг\), урон \d+, погибло \d+; Ополченец \(враг\) отвечает/,
    );
  });

  it("клетка для удара одна — второе касание по врагу бьёт с неё", () => {
    // Ополченцы стоят вплотную к врагу в углу: свободных соседних клеток у врага нет, кроме своей.
    const state = place(battle(["militia:5", "militia:5", "militia:5"], ["militia:5"]), {
      a1: [0, 1],
      a2: [1, 0],
      a3: [1, 1],
      b1: [0, 0],
    });
    const session = ready(state);
    expect(playerStack(session.getSnapshot())?.id).toBe("a1");
    session.tapCell({ col: 0, row: 0 });
    expect(session.getSnapshot().selection).toMatchObject({
      kind: "attack",
      cells: [{ col: 0, row: 1 }],
    });
    session.tapCell({ col: 0, row: 0 });
    expect(session.getSnapshot().locked).toBe(true);
    expect(findStack(session.getSnapshot().state, "b1")?.count).toBeLessThan(5);
  });

  it("враг вне досягаемости и свой отряд выбор снимают", () => {
    const session = ready(battle(["militia:5", "militia:5"], ["militia:5"]));
    session.tapCell({ col: 2, row: 2 });
    session.tapCell({ col: 14, row: 5 });
    expect(session.getSnapshot().selection).toBeNull();
    session.tapCell({ col: 2, row: 2 });
    session.tapCell({ col: 0, row: 8 });
    expect(session.getSnapshot().selection).toBeNull();
  });

  it("удержание пальца открывает характеристики отряда, своего или чужого", () => {
    const session = ready(battle(["militia:5"], ["militia:5"]));
    session.inspectCell({ col: 14, row: 5 });
    expect(session.getSnapshot().inspected).toBe("b1");
    // Касание поля убирает показ; удержание на пустой клетке ничего не открывает.
    session.tapCell({ col: 7, row: 7 });
    expect(session.getSnapshot().inspected).toBeNull();
    session.inspectCell({ col: 7, row: 7 });
    expect(session.getSnapshot().inspected).toBeNull();
  });
});

describe("кнопки и ход компьютера", () => {
  it("«Ждать» и «Защищаться» передают ход; компьютер ходит, когда экран всё показал", () => {
    const session = ready(battle(["falcon:5"], ["militia:5"]));
    session.wait();
    expect(session.getSnapshot()).toMatchObject({ locked: true, log: "Сокол (ваш) ждёт" });
    expect(session.getSnapshot().state.activeStack).toBe("b1");
    // Пока экран показывает события, кнопки не работают.
    session.defend();
    expect(session.getSnapshot().state.activeStack).toBe("b1");
    session.animationDone();
    // Компьютер подошёл; ход вернулся к ждавшему соколу, но экран ещё показывает.
    expect(session.getSnapshot()).toMatchObject({
      locked: true,
      log: "Ополченец (враг) перемещается",
    });
    expect(findStack(session.getSnapshot().state, "b1")).toMatchObject({ col: 10, row: 5 });
    session.animationDone();
    expect(playerStack(session.getSnapshot())?.id).toBe("a1");
    session.defend();
    expect(session.getSnapshot().log).toBe("Сокол (ваш) защищается: защита +1; Раунд 2");
  });

  it("«Бежать» без героя не работает, с героем заканчивает бой поражением", () => {
    const without = ready(battle(["falcon:5"], ["militia:5"]));
    without.flee();
    expect(without.getSnapshot().state.result).toBeNull();
    const withHero = ready(battle(["falcon:5"], ["militia:5"], true));
    withHero.flee();
    expect(withHero.getSnapshot().state.result).toMatchObject({ winner: 1, reason: "fled" });
    expect(withHero.getSnapshot().log).toBe("Вы бежали с поля боя");
    withHero.animationDone();
    expect(withHero.getSnapshot().locked).toBe(false);
    expect(playerStack(withHero.getSnapshot())).toBeUndefined();
  });

  it("бой доигрывается до конца: игрок только защищается, компьютер побеждает", () => {
    const session = ready(battle(["militia:2"], ["falcon:20"]));
    for (let i = 0; i < 200 && session.getSnapshot().state.result === null; i += 1) {
      if (playerStack(session.getSnapshot()) === undefined) {
        session.animationDone();
      } else {
        session.defend();
      }
    }
    expect(session.getSnapshot().state.result).toMatchObject({ winner: 1, reason: "destroyed" });
    expect(session.getSnapshot().log).toContain("Ополченец (ваш): отряд погиб");
  });
});
