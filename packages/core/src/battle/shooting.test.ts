import { describe, expect, it } from "vitest";
import { applyBattleCommand } from "./commands.ts";
import { canShoot } from "./queries.ts";
import {
  act,
  army,
  code,
  fixed,
  SLINGER,
  stack,
  startBattle,
  strikes,
  turnOf,
  withStacks,
} from "./testkit.ts";

/** 20 пращников (броски по 4) и 5 соколов в столбце `targetCol` того же ряда; ход пращников. */
function shooting(targetCol: number) {
  const started = startBattle(army(["slinger:20"]), army(["falcon:5"])).state;
  return turnOf(
    withStacks(started, { a1: { creature: fixed(SLINGER, 4) }, b1: { col: targetCol } }),
    "a1",
  );
}

describe("выстрел — примеры из 13-battle-damage.md", () => {
  it("20 пращников (броски по 4) стреляют по 5 соколам с 10 клеток: полный урон, ответа нет", () => {
    const result = act(shooting(10), { type: "battleShoot", target: "b1" });
    expect(result.events).toEqual([
      {
        type: "strike",
        kind: "shot",
        attackerId: "a1",
        targetId: "b1",
        damage: 80,
        killed: 4,
        left: 1,
        lucky: false,
      },
      { type: "stackTurn", stackId: "b1" },
    ]);
    expect(stack(result.state, "b1").firstHealth).toBe(10);
    expect(stack(result.state, "a1")).toMatchObject({ shots: 9, count: 20 });
  });

  it("с 11 клеток — вполсилы", () => {
    const result = act(shooting(11), { type: "battleShoot", target: "b1" });
    expect(strikes(result.events)).toMatchObject([{ damage: 40, killed: 2, left: 3 }]);
    expect(stack(result.state, "b1").firstHealth).toBe(14);
  });

  it("препятствия стрельбе не мешают", () => {
    const withWall = { ...shooting(10), obstacles: [{ col: 5, row: 5 }] };
    const result = act(withWall, { type: "battleShoot", target: "b1" });
    expect(strikes(result.events)).toMatchObject([{ damage: 80 }]);
  });

  it("стрелок бьёт вблизи вполсилы и без траты выстрелов", () => {
    // 20 пращников, броски по 4: база 80, атака 5 против защиты 5, половина → 40.
    const state = shooting(1);
    expect(canShoot(state, stack(state, "a1"))).toBe(false);
    const result = act(state, { type: "battleAttack", target: "b1", from: { col: 0, row: 5 } });
    expect(strikes(result.events)[0]).toMatchObject({ kind: "melee", damage: 40 });
    expect(stack(result.state, "a1").shots).toBe(10);
  });
});

describe("отказы — таблица из 12-battle-actions.md", () => {
  const started = startBattle(
    army(["slinger:5", "militia:5"]),
    army(["slinger:5"], { hero: { attack: 0, defense: 0 } }),
  ).state;

  it("чужой ход", () => {
    expect(code(started, { type: "battleDefend", side: 1 })).toBe("NOT_YOUR_STACK");
  });

  it("цель: нет такого отряда, отряд погиб, свой отряд", () => {
    const dead = withStacks(started, { b1: { count: 0 } });
    const from = { col: 1, row: 2 };
    expect(code(started, { type: "battleShoot", side: 0, target: "b9" })).toBe("UNKNOWN_TARGET");
    expect(code(dead, { type: "battleShoot", side: 0, target: "b1" })).toBe("UNKNOWN_TARGET");
    expect(code(started, { type: "battleShoot", side: 0, target: "a2" })).toBe("TARGET_IS_ALLY");
    expect(code(started, { type: "battleAttack", side: 0, target: "b9", from })).toBe(
      "UNKNOWN_TARGET",
    );
    expect(code(started, { type: "battleAttack", side: 0, target: "a2", from })).toBe(
      "TARGET_IS_ALLY",
    );
  });

  it("удар: клетка не соседняя с целью — раньше, чем «не дойти»", () => {
    const far = { col: 9, row: 9 };
    const near = { col: 13, row: 5 };
    expect(code(started, { type: "battleAttack", side: 0, target: "b1", from: far })).toBe(
      "NOT_ADJACENT",
    );
    expect(code(started, { type: "battleAttack", side: 0, target: "b1", from: near })).toBe(
      "CELL_UNREACHABLE",
    );
  });

  it("выстрел: не стрелок, нет выстрелов, враг рядом", () => {
    const afterA1 = act(started, { type: "battleDefend" }).state;
    const afterB1 = act(afterA1, { type: "battleDefend" }).state;
    expect(afterB1.activeStack).toBe("a2");
    expect(code(afterB1, { type: "battleShoot", side: 0, target: "b1" })).toBe("NOT_A_SHOOTER");
    const empty = withStacks(started, { a1: { shots: 0 }, b1: { col: 1, row: 2 } });
    expect(code(empty, { type: "battleShoot", side: 0, target: "b1" })).toBe("NO_SHOTS");
    const close = withStacks(started, { b1: { col: 1, row: 2 } });
    expect(code(close, { type: "battleShoot", side: 0, target: "b1" })).toBe("ENEMY_ADJACENT");
  });

  it("ждать второй раз за раунд нельзя; бежать без героя нельзя", () => {
    expect(code(started, { type: "battleFlee", side: 0 })).toBe("NO_HERO");
    let state = act(started, { type: "battleWait" }).state;
    state = act(state, { type: "battleDefend" }).state;
    state = act(state, { type: "battleDefend" }).state;
    expect(state.activeStack).toBe("a1");
    expect(code(state, { type: "battleWait", side: 0 })).toBe("ALREADY_WAITED");
  });

  it("отказ не меняет состояние и не тратит случайных чисел", () => {
    const copy = JSON.parse(JSON.stringify(started)) as unknown;
    applyBattleCommand(started, { type: "battleShoot", side: 0, target: "a2" });
    applyBattleCommand(started, { type: "battleMove", side: 0, to: { col: 14, row: 10 } });
    expect(started).toEqual(copy);
  });

  it("бегство: бой проигран, потери записаны", () => {
    const state = act(started, { type: "battleDefend" }).state;
    const fled = act(state, { type: "battleFlee" });
    expect(fled.events.map((event) => event.type)).toEqual(["sideFled", "battleEnded"]);
    expect(fled.state.result).toMatchObject({ winner: 0, reason: "fled" });
    expect(code(fled.state, { type: "battleDefend", side: 0 })).toBe("BATTLE_OVER");
  });
});
