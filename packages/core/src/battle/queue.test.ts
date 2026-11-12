import { describe, expect, it } from "vitest";
import { damageRange } from "./damage.ts";
import { act, army, stack, startBattle, withStacks } from "./testkit.ts";
import { turnQueue } from "./turns.ts";

const BOTH = ["slinger:5", "militia:5"];

describe("очередь ходов — примеры из 11-battle-turns.md", () => {
  it("в начале раунда: быстрые первыми, стороны по очереди", () => {
    const { state } = startBattle(army(BOTH), army(BOTH));
    expect(turnQueue(state)).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("ждавший уходит в конец раунда", () => {
    const { state } = startBattle(army(BOTH), army(BOTH));
    const waited = act(state, { type: "battleWait" }).state;
    expect(turnQueue(waited)).toEqual(["b1", "a2", "b2", "a1"]);
  });

  it("очередь сбывается, если все просто защищаются", () => {
    let { state } = startBattle(army(["falcon:5", "militia:5"]), army(["slinger:5", "falcon:1"]));
    const expected = turnQueue(state);
    const actual: string[] = [];
    while (state.round === 1) {
      actual.push(state.activeStack ?? "");
      state = act(state, { type: "battleDefend" }).state;
    }
    expect(actual).toEqual(expected);
  });

  it("погибшие в очередь не попадают; после боя очередь пуста", () => {
    const { state } = startBattle(army(BOTH), army(BOTH));
    expect(turnQueue(withStacks(state, { b1: { count: 0 } }))).toEqual(["a1", "b2", "a2"]);
    expect(turnQueue({ ...state, activeStack: null })).toEqual([]);
  });
});

describe("урон «от и до» — примеры из 13-battle-damage.md", () => {
  it("10 ополченцев бьют 10 пращников: от 22 до 33", () => {
    const { state } = startBattle(army(["militia:10"]), army(["slinger:10"]));
    const range = damageRange(state.sides, stack(state, "a1"), stack(state, "b1"), "melee");
    expect(range).toEqual({ min: 22, max: 33 });
  });

  it("20 пращников стреляют по 5 соколам: вблизи от 20 до 80, дальше 10 клеток — от 10 до 40", () => {
    const { state } = startBattle(army(["slinger:20"]), army(["falcon:5"]));
    const far = damageRange(state.sides, stack(state, "a1"), stack(state, "b1"), "shot");
    expect(far).toEqual({ min: 10, max: 40 });
    const near = withStacks(state, { b1: { col: 10 } });
    expect(damageRange(near.sides, stack(near, "a1"), stack(near, "b1"), "shot")).toEqual({
      min: 20,
      max: 80,
    });
  });

  it("7 пращников отвечают в ближнем бою вполсилы: от 3 до 14", () => {
    const { state } = startBattle(army(["slinger:7"]), army(["militia:10"]));
    const range = damageRange(state.sides, stack(state, "a1"), stack(state, "b1"), "melee");
    expect(range).toEqual({ min: 3, max: 14 });
  });
});
