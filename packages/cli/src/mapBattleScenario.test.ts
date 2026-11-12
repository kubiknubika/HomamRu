// Шаги боя в сценарии карты: docs/mechanics/23-map-battle.md, «Сценарии».
import { CREATURES } from "@homamru/core/testkit";
import type { MapDefinition } from "@homamru/core";
import type { Scenario } from "@homamru/data";
import { describe, expect, it } from "vitest";
import { runScenario } from "./scenario.ts";

const MAP: MapDefinition = {
  id: "guarded",
  name: "Поле с охранником",
  terrain: Array.from({ length: 8 }, () => "........"),
  players: [{ hero: { x: 0, y: 0, army: [{ creature: "falcon", count: 30 }] } }],
  objects: [{ type: "guard", x: 4, y: 0, creature: "militia", count: 5 }],
};

const ENTER = { move: { hero: "A", path: ["E" as const, "E" as const, "E" as const] } };

function run(steps: Scenario["steps"], expected?: Scenario["expect"]) {
  const scenario = { name: "Проверка", map: "guarded", seed: 1, steps, expect: expected };
  return runScenario(scenario, MAP, CREATURES);
}

describe("шаги боя в сценарии карты", () => {
  it("шаг боя отдаёт команду за сторону, чей отряд ходит, и печатает события боя", () => {
    const result = run([ENTER, { defend: {} }], { battle: true, outcome: "none" });
    expect(result.failures).toEqual([]);
    const text = result.lines.join("\n");
    expect(text).toContain("  Начался бой: герой A против охранника o1");
    expect(text).toContain("Идёт бой: герой A против охранника o1.");
    expect(text).toContain("Команда 2: в бою — защищаться");
    expect(text).toContain("  Бой: Отряд a1 защищается");
  });

  it("«бой до конца» доигрывает бой и печатает итог", () => {
    const result = run([ENTER, { fight: {} }], {
      battle: false,
      heroes: { A: { x: 3, y: 0, experience: 60, level: 1, skills: 0 } },
      objects: { o1: "absent" },
    });
    expect(result.failures).toEqual([]);
    const text = result.lines.join("\n");
    expect(text).toContain("Команда 2: бой до конца");
    expect(text).toMatch(/ {2}Команд боя: \d+\./);
    expect(text).toContain("  Охранник o1 побеждён");
    expect(text).toContain("  Герой A получил опыт: +60, всего 60");
  });

  it("«бой до конца» без боя — провал сценария", () => {
    expect(run([{ fight: {} }]).failures).toEqual(["Команда 1: «бой до конца», но боя нет."]);
  });

  it("отказ команды боя сверяется с ожидаемым кодом", () => {
    const steps = [
      { wait: {}, expectError: "NO_BATTLE" as const },
      ENTER,
      { shoot: "b1", expectError: "NOT_A_SHOOTER" as const },
      { endTurn: {}, expectError: "BATTLE_IN_PROGRESS" as const },
      { flee: {} },
      { endTurn: {}, expectError: "GAME_OVER" as const },
    ];
    const result = run(steps, {
      outcome: "defeat",
      heroes: { A: "absent" },
      objects: { o1: { count: 5 } },
    });
    expect(result.failures).toEqual([]);
    expect(result.lines.join("\n")).toContain("Партия окончена: поражение.");
  });

  it("несовпавшие ожидания о бое, герое и охраннике названы по одному", () => {
    const result = run([ENTER], {
      battle: false,
      outcome: "defeat",
      heroes: {
        A: { experience: 5, level: 2, skills: 3, army: [{ creature: "militia", count: 1 }] },
      },
      objects: { o1: { count: 9 }, o2: { count: 1 } },
    });
    expect(result.failures).toEqual([
      "Герой A: ожидался опыт 5, получен 0.",
      "Герой A: ожидался уровень 2, получен 1.",
      "Герой A: ожидалась сумма атаки и защиты 3, получен 0.",
      "Герой A: ожидалась армия militia 1, получена falcon 30.",
      "Охранник o1: ожидалось существ 9, получено 5.",
      "Объект o2: ожидался охранник, но его нет.",
      "Ожидалось, что боя нет, но бой идёт.",
      "Ожидался итог партии defeat, получен none.",
    ]);
    expect(run([], { battle: true, heroes: { A: "absent" } }).failures).toEqual([
      "Герой A: ожидалось, что его нет, но он есть.",
      "Ожидалось, что бой идёт, но боя нет.",
    ]);
  });
});
