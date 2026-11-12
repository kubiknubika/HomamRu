import { TEST_ARMY, CONTENT } from "@homamru/core/testkit";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import type { MapDefinition } from "@homamru/core";
import type { Scenario } from "@homamru/data";
import { listScenarioFiles, runScenarioFile } from "./files.ts";
import { runScenario } from "./scenario.ts";

const MAP: MapDefinition = {
  id: "open",
  name: "Поле",
  terrain: Array.from({ length: 8 }, () => "........"),
  players: [{ hero: { x: 0, y: 0, army: TEST_ARMY } }],
};

function scenarioOf(changes: Partial<Scenario>): Scenario {
  return { name: "Проверка", map: "open", seed: 1, steps: [], ...changes };
}

describe("сценарии из папки data/scenarios", () => {
  const files = listScenarioFiles();

  it("папка не пуста", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [basename(file), file]))("%s", (_, file) => {
    const run = runScenarioFile(file);
    expect(run.failures).toEqual([]);
    expect(run.ok).toBe(true);
  });
});

describe("проигрывание сценария", () => {
  it("печатает команды, события и состояние", () => {
    const run = runScenario(
      scenarioOf({ steps: [{ move: { hero: "A", path: ["E"] } }, { endTurn: {} }] }),
      MAP,
      CONTENT,
    );
    expect(run.ok).toBe(true);
    const text = run.lines.join("\n");
    expect(text).toContain("Сценарий: Проверка");
    expect(text).toContain("Команда 1: переместить героя A: E");
    expect(text).toContain("  Герой A: шаг (0, 0) → (1, 0), потрачено 100, осталось 900");
    expect(text).toContain("Команда 2: закончить ход");
    expect(text).toContain("День 2 (месяц 1, неделя 1, день 2). Ход игрока 1.");
    expect(text).toContain(" 0 .A......");
  });

  it("проваливается, если ожидаемого отказа не было", () => {
    const steps = [{ move: { hero: "A", path: ["E" as const] }, expectError: "STEP_BLOCKED" }];
    const run = runScenario(scenarioOf({ steps } as Partial<Scenario>), MAP, CONTENT);
    expect(run.ok).toBe(false);
    expect(run.failures).toEqual(["Команда 1: ожидался отказ STEP_BLOCKED, но она принята."]);
  });

  it("проваливается, если отказ другой или неожиданный", () => {
    const run = runScenario(
      scenarioOf({
        steps: [
          { move: { hero: "A", path: ["N"] }, expectError: "EMPTY_PATH" },
          { move: { hero: "A", path: ["W"] } },
        ],
      }),
      MAP,
      CONTENT,
    );
    expect(run.failures).toEqual([
      "Команда 1: получен отказ STEP_BLOCKED, ожидалось: EMPTY_PATH.",
      "Команда 2: получен отказ STEP_BLOCKED, ожидалось: команда будет принята.",
    ]);
  });

  it("проваливается, если конечное состояние не совпало", () => {
    const run = runScenario(
      scenarioOf({
        steps: [{ move: { hero: "A", path: ["S"] } }],
        expect: { day: 3, heroes: { A: { x: 5, y: 5, movement: 1 }, B: { x: 0, y: 0 } } },
      }),
      MAP,
      CONTENT,
    );
    expect(run.failures).toEqual([
      "Ожидался день 3, получен день 1.",
      "Герой A: ожидалась клетка (5, 5), получена (0, 1).",
      "Герой A: ожидался запас хода 1, получен 900.",
      "Ожидался герой B, но его нет.",
    ]);
  });

  it("проваливается на неверной карте", () => {
    const run = runScenario(scenarioOf({}), { ...MAP, players: [] }, CONTENT);
    expect(run.ok).toBe(false);
    expect(run.failures[0]).toContain("players");
  });
});
