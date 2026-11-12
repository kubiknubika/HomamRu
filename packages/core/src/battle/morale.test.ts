import { describe, expect, it } from "vitest";
import { act, army, FALCON, fixed, stack, startBattle, strikes, withStacks } from "./testkit.ts";

const SEEDS = 2400;

/** Доля сидов, на которых условие выполнилось. */
function share(check: (seed: number) => boolean): number {
  let hits = 0;
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    hits += check(seed) ? 1 : 0;
  }
  return hits / SEEDS;
}

describe("высокий боевой дух", () => {
  it.each([
    [1, 1 / 24],
    [2, 2 / 24],
    [3, 3 / 24],
  ])("+%i даёт второй ход после перемещения с шансом N из 24", (morale, chance) => {
    const mismatches: number[] = [];
    const got = share((seed) => {
      const { state } = startBattle(army(["falcon:1"], { morale }), army(["militia:1"]), { seed });
      const moved = act(state, { type: "battleMove", to: { col: 3, row: 5 } });
      const again = moved.events.some((event) => event.type === "moraleTurn");
      // Второй ход — у того же отряда; иначе ход перешёл.
      const consistent =
        moved.state.activeStack === (again ? "a1" : "b1") &&
        stack(moved.state, "a1").moraleUsed === again;
      if (!consistent) {
        mismatches.push(seed);
      }
      return again;
    });
    expect(mismatches).toEqual([]);
    expect(got).toBeGreaterThan(chance * 0.7);
    expect(got).toBeLessThan(chance * 1.3);
  });

  it("третьего хода не бывает; после «защищаться» и «ждать» второго хода нет", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const started = startBattle(army(["falcon:1"], { morale: 3 }), army(["militia:1"]), {
        seed,
      }).state;
      const used = withStacks(started, { a1: { moraleUsed: true } });
      const to = { col: 3, row: 5 };
      expect(act(used, { type: "battleMove", to }).state.activeStack).toBe("b1");
      expect(act(started, { type: "battleDefend" }).state.activeStack).toBe("b1");
      expect(act(started, { type: "battleWait" }).state.activeStack).toBe("b1");
    }
  });

  it("ждавший отряд может получить второй ход в третьей части раунда", () => {
    const got = share((seed) => {
      const { state } = startBattle(army(["falcon:1"], { morale: 3 }), army(["militia:1"]), {
        seed,
      });
      let current = act(state, { type: "battleWait" }).state;
      current = act(current, { type: "battleDefend" }).state;
      const moved = act(current, { type: "battleMove", to: { col: 3, row: 5 } });
      return moved.events.some((event) => event.type === "moraleTurn");
    });
    expect(got).toBeGreaterThan(0.125 * 0.7);
    expect(got).toBeLessThan(0.125 * 1.3);
  });
});

describe("низкий боевой дух", () => {
  it.each([
    [-1, 1 / 12],
    [-2, 2 / 12],
    [-3, 3 / 12],
  ])("%i: оцепенение в начале хода с шансом N из 12", (morale, chance) => {
    const mismatches: number[] = [];
    const got = share((seed) => {
      const { state, events } = startBattle(army(["falcon:1"], { morale }), army(["militia:1"]), {
        seed,
      });
      const froze = events.some((event) => event.type === "stackFroze");
      if (state.activeStack !== (froze ? "b1" : "a1")) {
        mismatches.push(seed);
      }
      return froze;
    });
    expect(mismatches).toEqual([]);
    expect(got).toBeGreaterThan(chance * 0.75);
    expect(got).toBeLessThan(chance * 1.25);
  });

  it("ждавший отряд во второй раз жребий оцепенения не бросает", () => {
    let waited = 0;
    const violations: number[] = [];
    for (let seed = 1; seed <= 400; seed += 1) {
      let { state } = startBattle(army(["falcon:1"], { morale: -3 }), army(["militia:1"]), {
        seed,
      });
      for (let turn = 0; turn < 12; turn += 1) {
        const active = stack(state, state.activeStack ?? "");
        if (active.id === "a1" && active.turn === "ready") {
          state = act(state, { type: "battleWait" }).state;
          // Ополченцы защищаются, и ход обязан вернуться к соколу: оцепенеть он уже не может.
          const back = act(state, { type: "battleDefend" });
          if (back.state.activeStack !== "a1" || back.events.some((e) => e.type === "stackFroze")) {
            violations.push(seed);
          }
          state = back.state;
          waited += 1;
        }
        state = act(state, { type: "battleDefend" }).state;
      }
    }
    expect(violations).toEqual([]);
    expect(waited).toBeGreaterThan(400);
  });
});

describe("удача", () => {
  it.each([
    [1, 1 / 24],
    [2, 2 / 24],
    [3, 3 / 24],
  ])("+%i удваивает базовый урон с шансом N из 24", (luck, chance) => {
    // Пример из 13-battle-damage.md: 8 соколов (броски по 3, герой +3) бьют 20 ополченцев
    // (герой +1): без удачи 28, с удачей 52.
    const damages = new Set<string>();
    const got = share((seed) => {
      const started = startBattle(
        army(["falcon:8"], { luck, hero: { attack: 3, defense: 0 } }),
        army(["militia:20"], { hero: { attack: 0, defense: 1 } }),
        { seed },
      ).state;
      const state = withStacks(started, {
        a1: { creature: fixed(FALCON, 3) },
        b1: { col: 5, row: 5 },
      });
      const from = { col: 4, row: 5 };
      const hit = strikes(act(state, { type: "battleAttack", target: "b1", from }).events)[0];
      damages.add(`${hit?.lucky}:${hit?.damage}`);
      return hit?.lucky === true;
    });
    expect([...damages].toSorted()).toEqual(["false:28", "true:52"]);
    expect(got).toBeGreaterThan(chance * 0.7);
    expect(got).toBeLessThan(chance * 1.3);
  });

  it("при нулевых духе и удаче случайные числа на жребии не тратятся", () => {
    const { state } = startBattle(army(["falcon:1"]), army(["militia:1"]));
    const moved = act(state, { type: "battleMove", to: { col: 3, row: 5 } }).state;
    expect(moved.rng).toEqual(state.rng);
  });
});
