import { describe, expect, it } from "vitest";
import { applyBattleCommand } from "./commands.ts";
import { cellIndex, distance } from "./hex.ts";
import { reachableCells } from "./queries.ts";
import {
  act,
  army,
  FALCON,
  fixed,
  MILITIA,
  SLINGER,
  stack,
  startBattle,
  strikes,
  turnOf,
  withStacks,
} from "./testkit.ts";

const WALL = [
  { col: 1, row: 4 },
  { col: 1, row: 5 },
  { col: 1, row: 6 },
];

/** 10 ополченцев (броски по 3) против 10 пращников (броски по 4), ход ополченцев. */
function melee() {
  const started = startBattle(army(["militia:10"]), army(["slinger:10"])).state;
  return turnOf(
    withStacks(started, {
      a1: { creature: fixed(MILITIA, 3) },
      b1: { creature: fixed(SLINGER, 4), col: 3, row: 5 },
    }),
    "a1",
  );
}

describe("перемещение", () => {
  it("пеший идёт не дальше скорости и обходит препятствия", () => {
    const { state } = startBattle(army(["militia:1"]), army(["militia:1"]), { obstacles: WALL });
    const me = stack(state, "a1");
    const cells = reachableCells(state, me);
    expect(cells.has(cellIndex({ col: 1, row: 5 }))).toBe(false);
    expect(cells.has(cellIndex({ col: 0, row: 5 }))).toBe(false);
    expect(cells.has(cellIndex({ col: 0, row: 9 }))).toBe(true);
    expect(cells.has(cellIndex({ col: 0, row: 10 }))).toBe(false);
    // Без стены клетка (3, 5) в трёх шагах; в обход — дальше четырёх.
    expect(cells.has(cellIndex({ col: 3, row: 5 }))).toBe(false);
    for (const cell of cells.values()) {
      expect(distance(me, cell)).toBeLessThanOrEqual(4);
    }
  });

  it("летающий перелетает препятствия, но не садится на них", () => {
    const { state } = startBattle(army(["falcon:1"]), army(["militia:1"]), { obstacles: WALL });
    const cells = reachableCells(state, stack(state, "a1"));
    expect(cells.has(cellIndex({ col: 8, row: 5 }))).toBe(true);
    expect(cells.has(cellIndex({ col: 9, row: 5 }))).toBe(false);
    expect(cells.has(cellIndex({ col: 1, row: 5 }))).toBe(false);
  });

  it("принятое перемещение ставит отряд в клетку и передаёт ход", () => {
    const { state } = startBattle(army(["falcon:1"]), army(["militia:1"]));
    const moved = act(state, { type: "battleMove", to: { col: 8, row: 5 } });
    expect(moved.events).toEqual([
      { type: "stackMoved", stackId: "a1", from: { col: 0, row: 5 }, to: { col: 8, row: 5 } },
      { type: "stackTurn", stackId: "b1" },
    ]);
    expect(stack(moved.state, "a1")).toMatchObject({ col: 8, row: 5, turn: "done" });
  });

  it("нельзя: слишком далеко, на занятую клетку, на свою клетку, за поле", () => {
    const started = startBattle(army(["falcon:1"]), army(["militia:1"])).state;
    const state = withStacks(started, { b1: { col: 3, row: 5 } });
    for (const to of [
      { col: 9, row: 5 },
      { col: 3, row: 5 },
      { col: 0, row: 5 },
      { col: -1, row: 5 },
      { col: 2, row: 11 },
    ]) {
      expect(applyBattleCommand(state, { type: "battleMove", side: 0, to })).toMatchObject({
        ok: false,
        code: "CELL_UNREACHABLE",
      });
    }
  });
});

describe("удар и ответный удар — примеры из 13-battle-damage.md", () => {
  it("10 ополченцев (броски по 3) бьют 10 пращников; 7 выживших отвечают вполсилы (броски по 4)", () => {
    const result = act(melee(), { type: "battleAttack", target: "b1", from: { col: 2, row: 5 } });
    expect(result.events).toEqual([
      { type: "stackMoved", stackId: "a1", from: { col: 0, row: 5 }, to: { col: 2, row: 5 } },
      {
        type: "strike",
        kind: "melee",
        attackerId: "a1",
        targetId: "b1",
        damage: 33,
        killed: 3,
        left: 7,
        lucky: false,
      },
      {
        type: "strike",
        kind: "retaliation",
        attackerId: "b1",
        targetId: "a1",
        damage: 14,
        killed: 1,
        left: 9,
        lucky: false,
      },
      { type: "stackTurn", stackId: "b1" },
    ]);
    expect(stack(result.state, "b1")).toMatchObject({ count: 7, firstHealth: 3, retaliated: true });
    expect(stack(result.state, "a1")).toMatchObject({ count: 9, firstHealth: 10 });
  });

  it("удар с места: перемещения нет", () => {
    const state = withStacks(melee(), { a1: { col: 2, row: 5 } });
    const result = act(state, { type: "battleAttack", target: "b1", from: { col: 2, row: 5 } });
    expect(result.events.map((event) => event.type)).toEqual(["strike", "strike", "stackTurn"]);
  });

  it("отряд отвечает один раз за раунд", () => {
    const started = startBattle(army(["militia:10", "militia:10"]), army(["slinger:30"])).state;
    const state = turnOf(
      withStacks(started, {
        a1: { col: 12, row: 5 },
        a2: { col: 12, row: 6 },
        b1: { creature: { ...SLINGER, speed: 1 }, col: 13, row: 5 },
      }),
      "a1",
    );
    const first = act(state, { type: "battleAttack", target: "b1", from: { col: 12, row: 5 } });
    expect(strikes(first.events).map((s) => s.kind)).toEqual(["melee", "retaliation"]);
    const second = act(first.state, {
      type: "battleAttack",
      target: "b1",
      from: { col: 12, row: 6 },
    });
    expect(strikes(second.events).map((s) => s.kind)).toEqual(["melee"]);
    // Следующий раунд: пращники защищаются, и на новый удар снова отвечают.
    const nextRound = act(second.state, { type: "battleDefend" }).state;
    const third = act(nextRound, { type: "battleAttack", target: "b1", from: { col: 12, row: 5 } });
    expect(strikes(third.events).map((s) => s.kind)).toEqual(["melee", "retaliation"]);
  });

  it("погибшая цель не отвечает, бой заканчивается", () => {
    const started = startBattle(army(["falcon:100"]), army(["militia:1", "slinger:1"])).state;
    const state = withStacks(started, { b1: { col: 5, row: 5 }, b2: { count: 0, turn: "done" } });
    const result = act(state, { type: "battleAttack", target: "b1", from: { col: 4, row: 5 } });
    expect(result.events.map((event) => event.type)).toEqual([
      "stackMoved",
      "strike",
      "stackDied",
      "battleEnded",
    ]);
    expect(result.state.activeStack).toBeNull();
    expect(result.state.result).toEqual({
      winner: 0,
      reason: "destroyed",
      losses: [
        { stackId: "a1", lost: 0 },
        { stackId: "b1", lost: 1 },
        { stackId: "b2", lost: 1 },
      ],
    });
    expect(applyBattleCommand(result.state, { type: "battleDefend", side: 1 })).toMatchObject({
      ok: false,
      code: "BATTLE_OVER",
    });
  });

  it("нападавший погиб от ответного удара: побеждает обороняющийся", () => {
    const started = startBattle(army(["militia:1"]), army(["falcon:100"])).state;
    const state = turnOf(withStacks(started, { a1: { col: 13, row: 5, firstHealth: 1 } }), "a1");
    const result = act(state, { type: "battleAttack", target: "b1", from: { col: 13, row: 5 } });
    expect(result.state.result).toMatchObject({ winner: 1, reason: "destroyed" });
  });

  it("герои прибавляют атаку и защиту: 8 соколов (броски по 3, герой +3) бьют 20 ополченцев (герой +1)", () => {
    const started = startBattle(
      army(["falcon:8"], { hero: { attack: 3, defense: 0 } }),
      army(["militia:20"], { hero: { attack: 0, defense: 1 } }),
    ).state;
    const state = withStacks(started, {
      a1: { creature: fixed(FALCON, 3) },
      b1: { col: 5, row: 5 },
    });
    const result = act(state, { type: "battleAttack", target: "b1", from: { col: 4, row: 5 } });
    expect(strikes(result.events)[0]).toMatchObject({ damage: 28, killed: 2, left: 18 });
    expect(stack(result.state, "b1").firstHealth).toBe(8);
  });
});
