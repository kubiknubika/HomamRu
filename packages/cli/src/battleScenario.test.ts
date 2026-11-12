import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { createBattle } from "@homamru/core";
import type { BattleScenario } from "@homamru/data";
import { runBattleScenario } from "./battleScenario.ts";
import { listBattleFiles, loadBattle, loadCreatures } from "./files.ts";

const creatures = loadCreatures();
const files = listBattleFiles();
const duel = loadBattle(files.find((file) => file.endsWith("test-duel.yaml")) ?? "");

function scenarioOf(changes: Partial<BattleScenario>): BattleScenario {
  return { name: "Проверка", battle: "test-duel", seed: 1, steps: [], ...changes };
}

describe("файлы из папок data/creatures и data/battles", () => {
  it("существа — четыре, с числами из 14-creatures.md и 31-recruitment.md", () => {
    const rows = creatures.map((c) => [
      c.id,
      c.attack,
      c.defense,
      c.damageMin,
      c.damageMax,
      c.health,
      c.speed,
      c.flying,
      c.shots,
      c.price,
      c.growth,
    ]);
    expect(rows).toEqual([
      ["armsman", 9, 11, 5, 8, 32, 5, false, 0, 300, 4],
      ["falcon", 7, 5, 3, 5, 18, 8, true, 0, 200, 7],
      ["militia", 5, 5, 2, 3, 12, 4, false, 0, 60, 14],
      ["slinger", 5, 3, 1, 4, 9, 5, false, 10, 100, 9],
    ]);
  });

  it("папка боёв не пуста", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [basename(file), file]))("бой %s создаётся", (name, file) => {
    const battle = loadBattle(file);
    expect(`${battle.id}.yaml`).toBe(name);
    expect(createBattle(battle, creatures, 1)).toMatchObject({ ok: true });
  });
});

describe("проигрывание сценария боя", () => {
  it("печатает команды, события и поле", () => {
    const scenario = scenarioOf({ steps: [{ move: { col: 8, row: 5 } }] });
    const run = runBattleScenario(scenario, duel, creatures);
    expect(run.failures).toEqual([]);
    const text = run.lines.join("\n");
    expect(text).toContain("Команда 1: переместиться на (8, 5)");
    expect(text).toContain("Отряд a1: (0, 5) → (8, 5)");
    expect(text).toContain("Раунд 1. Ход: обороняющийся, b1 Пращник (10).");
    expect(text).toContain(" 5   .  .  .  .  .  .  .  . a1  .  .  .  .  . b1");
  });

  it("сообщает о неожиданном отказе и о непришедшем отказе", () => {
    const scenario = scenarioOf({
      steps: [{ move: { col: 14, row: 0 } }, { defend: {}, expectError: "NO_HERO" }],
    });
    const run = runBattleScenario(scenario, duel, creatures);
    expect(run.ok).toBe(false);
    expect(run.failures).toEqual([
      "Команда 1: получен отказ CELL_UNREACHABLE, ожидалось: команда будет принята.",
      "Команда 2: ожидался отказ NO_HERO, но она принята.",
    ]);
  });

  it("сверяет ожидания в конце", () => {
    const scenario = scenarioOf({
      expect: {
        winner: "attacker",
        active: "b1",
        stacks: { a1: { count: 9, cell: { col: 1, row: 5 } }, b1: { shots: 3 }, b5: {} },
      },
    });
    expect(runBattleScenario(scenario, duel, creatures).failures).toEqual([
      "Ожидался победитель attacker, получено: нет.",
      "Ожидался ход отряда b1, сейчас ход: a1.",
      "Отряд a1: ожидалось существ 9, получено 10.",
      "Отряд a1: ожидалась клетка (1, 5), получена (0, 5).",
      "Отряд b1: ожидалось выстрелов 3, получено 10.",
      "Ожидался отряд b5, но его нет.",
    ]);
  });

  it("неверный бой — провал без исключения", () => {
    const broken = { ...duel, obstacles: [{ col: 0, row: 0 }] };
    const run = runBattleScenario(scenarioOf({}), broken, creatures);
    expect(run.ok).toBe(false);
    expect(run.failures.length).toBeGreaterThan(0);
  });
});
