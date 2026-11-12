import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { distance } from "./hex.ts";
import { act, army, startBattle, turnOf, withStacks } from "./testkit.ts";

describe("простой компьютер — правила из 15-battle-ai.md", () => {
  it("стрелок стреляет туда, где ожидаемый урон больше", () => {
    // 20 пращников, удвоенный базовый урон (1 + 4) × 20 = 100, выстрел с 14 клеток — вполсилы: 50.
    // По 30 ополченцам (защита 5) — 50; по одному соколу — не больше его удвоенного здоровья, 36.
    const { state } = startBattle(army(["slinger:20"]), army(["falcon:1", "militia:30"]));
    expect(chooseBattleCommand(turnOf(state, "a1"))).toEqual({
      type: "battleShoot",
      side: 0,
      target: "b2",
    });
  });

  it("при равном ожидаемом уроне цель — первая по порядку в армии врага", () => {
    const { state } = startBattle(army(["slinger:20"]), army(["militia:30", "militia:30"]));
    expect(chooseBattleCommand(state)).toEqual({ type: "battleShoot", side: 0, target: "b1" });
  });

  it("стрелок, к которому подошли вплотную, бьёт в ближнем бою с места", () => {
    const started = startBattle(army(["slinger:20"]), army(["militia:30"])).state;
    const state = turnOf(withStacks(started, { b1: { col: 1, row: 5 } }), "a1");
    expect(chooseBattleCommand(state)).toEqual({
      type: "battleAttack",
      side: 0,
      target: "b1",
      from: { col: 0, row: 5 },
    });
  });

  it("бьёт, если может достать; клетка удара — ближайшая к отряду", () => {
    const started = startBattle(army(["falcon:5"]), army(["militia:5"])).state;
    const state = withStacks(started, { b1: { col: 5, row: 5 } });
    expect(chooseBattleCommand(state)).toEqual({
      type: "battleAttack",
      side: 0,
      target: "b1",
      from: { col: 4, row: 5 },
    });
  });

  it("из двух досягаемых врагов бьёт того, по кому ожидаемый урон больше", () => {
    // 5 соколов: удвоенный базовый урон (3 + 5) × 5 = 40, атака 7.
    // По пращникам (защита 3): 40 × 1,2 = 48; по ополченцам (защита 5): 40 × 1,1 = 44.
    const started = startBattle(army(["falcon:5"]), army(["militia:30", "slinger:30"])).state;
    const state = withStacks(started, { b1: { col: 3, row: 4 }, b2: { col: 3, row: 6 } });
    expect(chooseBattleCommand(state)).toMatchObject({ type: "battleAttack", target: "b2" });
  });

  it("не достаёт — идёт к ближайшему врагу на клетку, откуда до него ближе всего", () => {
    const { state } = startBattle(army(["militia:5"]), army(["militia:5"]));
    expect(chooseBattleCommand(state)).toEqual({
      type: "battleMove",
      side: 0,
      to: { col: 4, row: 5 },
    });
  });

  it("пеший обходит стену, а не стоит перед ней", () => {
    const obstacles = [
      { col: 1, row: 4 },
      { col: 1, row: 5 },
      { col: 1, row: 6 },
    ];
    let { state } = startBattle(army(["militia:5"]), army(["slinger:1"]), { obstacles });
    state = turnOf(withStacks(state, { b1: { shots: 0 } }), "a1");
    const before = distance({ col: 0, row: 5 }, { col: 14, row: 5 });
    for (let turn = 0; turn < 12 && state.result === null; turn += 1) {
      const command = chooseBattleCommand(state);
      state = act(state, command ?? { type: "battleDefend" }).state;
    }
    const me = state.stacks[0] ?? { col: 0, row: 5 };
    const enemy = state.stacks[1] ?? { col: 14, row: 5 };
    expect(state.result !== null || distance(me, enemy) < before - 4).toBe(true);
  });

  it("идти некуда — защищается", () => {
    // Ополченцы в углу (0, 0): соседние клетки заняты препятствиями и своим отрядом.
    const obstacles = [
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ];
    const started = startBattle(army(["militia:5", "militia:5"]), army(["militia:5"]), {
      obstacles,
    }).state;
    const state = turnOf(
      withStacks(started, { a1: { col: 0, row: 0 }, a2: { col: 0, row: 1 } }),
      "a1",
    );
    expect(chooseBattleCommand(state)).toEqual({ type: "battleDefend", side: 0 });
  });

  it("бой окончен — команды нет", () => {
    const { state } = startBattle(
      army(["militia:5"], { hero: { attack: 0, defense: 0 } }),
      army(["militia:5"]),
    );
    const over = act(state, { type: "battleFlee" }).state;
    expect(chooseBattleCommand(over)).toBeUndefined();
  });
});
