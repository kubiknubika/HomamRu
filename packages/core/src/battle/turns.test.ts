import { describe, expect, it } from "vitest";
import { act, army, fixed, MILITIA, stack, startBattle, strikes, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

const BOTH = ["slinger:5", "militia:5"];

/** Проводит несколько ходов: каждый отряд ждёт (если ещё можно) или защищается. */
function order(state: BattleState, turns: number, pick: (id: string) => "wait" | "defend") {
  const ids: string[] = [];
  let current = state;
  for (let i = 0; i < turns; i += 1) {
    const id = current.activeStack ?? "";
    ids.push(id);
    const waits = pick(id) === "wait" && stack(current, id).turn === "ready";
    current = act(current, { type: waits ? "battleWait" : "battleDefend" }).state;
  }
  return { ids, state: current };
}

describe("очерёдность — примеры из 11-battle-turns.md", () => {
  it("быстрые первыми; при равной скорости — сторона, ходившая не последней", () => {
    const { state } = startBattle(army(BOTH), army(BOTH));
    const { ids, state: after } = order(state, 5, () => "defend");
    expect(ids).toEqual(["a1", "b1", "a2", "b2", "a1"]);
    expect(after.round).toBe(2);
  });

  it("ждавший ходит последним, и следующий раунд начинает другая сторона", () => {
    const { state } = startBattle(army(BOTH), army(BOTH));
    const { ids, state: after } = order(state, 6, (id) => (id === "a1" ? "wait" : "defend"));
    expect(ids).toEqual(["a1", "b1", "a2", "b2", "a1", "b1"]);
    expect(after.round).toBe(2);
  });

  it("внутри стороны при равной скорости — по порядку в армии", () => {
    const { state } = startBattle(
      army(["militia:1", "militia:1", "militia:1"]),
      army(["falcon:1"]),
    );
    expect(order(state, 4, () => "defend").ids).toEqual(["b1", "a1", "a2", "a3"]);
  });

  it("в третьей части раунда ждавшие ходят от медленных к быстрым", () => {
    const { state } = startBattle(army(["falcon:5", "militia:5"]), army(["slinger:5"]));
    const { ids } = order(state, 6, () => "wait");
    expect(ids).toEqual(["a1", "b1", "a2", "a2", "b1", "a1"]);
  });

  it("ждавший во время второго хода от духа ходит во второй части — раньше остальных ждавших", () => {
    const started = startBattle(army(["falcon:5"]), army(["militia:5"])).state;
    // Сокол уже получил второй ход и теперь ждёт; ополченцы ждали раньше.
    const state = withStacks(started, { a1: { moraleUsed: true }, b1: { turn: "waiting" } });
    const after = act(state, { type: "battleWait" }).state;
    expect(stack(after, "a1").turn).toBe("waitingAfterMorale");
    expect(after.activeStack).toBe("a1");
    expect(() => act(after, { type: "battleWait" })).toThrow(/ALREADY_WAITED/);
    expect(act(after, { type: "battleDefend" }).state.activeStack).toBe("b1");
  });

  it("новый раунд возвращает право на ответный удар и второй ход", () => {
    const started = startBattle(army(["militia:5"]), army(["militia:5"])).state;
    const state = withStacks(started, {
      a1: { moraleUsed: true },
      b1: { retaliated: true, moraleUsed: true },
    });
    const after = order(state, 2, () => "defend").state;
    expect(after.round).toBe(2);
    expect(after.stacks.map((s) => [s.retaliated, s.moraleUsed, s.turn])).toEqual([
      [false, false, "ready"],
      [false, false, "ready"],
    ]);
  });
});

describe("защищаться", () => {
  it("прибавка считается с защитой героя и снимается в начале следующего хода отряда", () => {
    const { state } = startBattle(
      army(["militia:5"], { hero: { attack: 0, defense: 5 } }),
      army(["militia:5"]),
    );
    const defended = act(state, { type: "battleDefend" });
    // Защита 5 + 5 героя = 10 → +2 (таблица из 11-battle-turns.md).
    expect(defended.events[0]).toEqual({ type: "stackDefends", stackId: "a1", bonus: 2 });
    expect(stack(defended.state, "a1").defendBonus).toBe(2);
    const next = act(defended.state, { type: "battleDefend" }).state;
    expect(next.activeStack).toBe("a1");
    expect(stack(next, "a1").defendBonus).toBe(0);
    expect(stack(next, "b1").defendBonus).toBe(1);
  });

  it("прибавка уменьшает урон по отряду", () => {
    // 10 ополченцев с бросками по 3: база 30. Защита 5 → урон 30; защита 5 + 1 → 30 × 39 / 40 = 29.
    const started = startBattle(army(["militia:10"]), army(["militia:10"])).state;
    const placed = withStacks(started, {
      a1: { creature: fixed(MILITIA, 3) },
      b1: { col: 2, row: 5 },
    });
    const from = { col: 1, row: 5 };
    const plain = act(placed, { type: "battleAttack", target: "b1", from });
    expect(strikes(plain.events)[0]).toMatchObject({ damage: 30 });
    const guarded = withStacks(placed, { b1: { defendBonus: 1 } });
    const hit = act(guarded, { type: "battleAttack", target: "b1", from });
    expect(strikes(hit.events)[0]).toMatchObject({ damage: 29 });
  });
});
