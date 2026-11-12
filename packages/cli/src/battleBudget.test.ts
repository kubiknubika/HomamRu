import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  applyBattleCommand,
  chooseBattleCommand,
  createBattle,
  randomBattle,
  runAutoBattle,
} from "@homamru/core";
import { loadCreatures } from "./files.ts";

const CREATURES = loadCreatures();

/** Бюджет скорости из docs/mechanics/stage-2.md. Время — среднее по многим боям. */
describe("бюджет скорости боя", () => {
  it("команда — не дольше 5 мс, решение компьютера — не дольше 50 мс", () => {
    let decisions = 0;
    let decisionMs = 0;
    let commandMs = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const created = createBattle(randomBattle(seed, CREATURES), CREATURES, seed);
      let state = created.ok ? created.state : null;
      while (state !== null && state.result === null && state.round <= 200) {
        const before = performance.now();
        const command = chooseBattleCommand(state);
        const middle = performance.now();
        const result = command === undefined ? undefined : applyBattleCommand(state, command);
        commandMs += performance.now() - middle;
        decisionMs += middle - before;
        decisions += 1;
        state = result?.ok === true ? result.state : null;
      }
    }
    expect(decisions).toBeGreaterThan(1000);
    expect(commandMs / decisions).toBeLessThan(5);
    expect(decisionMs / decisions).toBeLessThan(50);
  });

  it("автобой целиком — в среднем не дольше 50 мс", () => {
    const before = performance.now();
    for (let seed = 1; seed <= 100; seed += 1) {
      runAutoBattle(randomBattle(seed, CREATURES), CREATURES, seed);
    }
    expect((performance.now() - before) / 100).toBeLessThan(50);
  });
});
