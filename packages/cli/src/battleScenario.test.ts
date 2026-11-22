import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { createBattle } from "@homamru/core";
import type { BattleScenario } from "@homamru/data";
import { runBattleScenario } from "./battleScenario.ts";
import { BUILDINGS, CREATURES, HEROES, NEUTRAL_CREATURES, TAVERN } from "@homamru/core/testkit";
import {
  listBattleFiles,
  loadBattle,
  loadBuildings,
  loadCreatures,
  loadDefaults,
} from "./files.ts";

const creatures = loadCreatures();
/** Существа замков: нейтралы (порция 65) сверяются отдельным тестом. */
const castleCreatures = creatures.filter((creature) => creature.neutral !== true);
const files = listBattleFiles();
const duel = loadBattle(files.find((file) => file.endsWith("test-duel.yaml")) ?? "");

function scenarioOf(changes: Partial<BattleScenario>): BattleScenario {
  return { name: "Проверка", battle: "test-duel", seed: 1, steps: [], ...changes };
}

describe("файлы из папок data/creatures и data/battles", () => {
  // Существ замков четырнадцать: семь замка людей (74-second-castle.md), семь Чащи — с зубром
  // (docs/content/creatures.md). Числа первых четырёх — из 14-creatures.md и 31-recruitment.md.
  it("существа замков — четырнадцать, с числами из документов существ", () => {
    const rows = castleCreatures.map((c) => [
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
      ["aurochs", 15, 16, 18, 24, 110, 7, false, 0, 1300, 1],
      ["cavalier", 12, 9, 7, 12, 45, 9, false, 0, 450, 3],
      ["champion", 14, 13, 10, 16, 65, 7, false, 0, 700, 2],
      ["eagle", 9, 5, 3, 5, 25, 9, true, 0, 220, 7],
      ["ent", 10, 14, 6, 10, 55, 3, false, 0, 350, 4],
      ["falcon", 7, 5, 3, 5, 18, 8, true, 0, 200, 7],
      ["griffin", 16, 14, 15, 25, 95, 11, true, 0, 1200, 1],
      ["huntress", 6, 5, 2, 5, 15, 5, false, 12, 110, 9],
      ["kentaur", 5, 3, 2, 3, 10, 6, false, 0, 70, 14],
      ["militia", 5, 5, 2, 3, 12, 4, false, 0, 60, 14],
      ["slinger", 5, 3, 1, 4, 9, 5, false, 10, 100, 9],
      ["warden", 12, 15, 8, 12, 70, 4, false, 0, 500, 3],
      ["wyvern", 14, 12, 12, 20, 85, 7, true, 0, 900, 2],
    ]);
  });

  // С порции 60 зданий в данных больше, чем в наборе ядра: там два замка
  // (74-second-castle.md). Сверяем по замкам, а не общим списком.
  it("уровни существ в наборе боя — те же, что в данных (нужны «Клону» и «Убийце»)", () => {
    expect(CREATURES.map((c) => [c.id, c.level ?? 0]).toSorted()).toEqual(
      castleCreatures.map((c) => [c.id, c.level ?? 0]).toSorted(),
    );
  });

  // Нейтралы (порция 65) в наборе ядра отдельно от существ замков: сверяем их целиком,
  // иначе правка числа в data/creatures пройдёт мимо тестов ядра.
  it("нейтралы в наборе ядра — те же, что в данных, со всеми числами", () => {
    const mine = NEUTRAL_CREATURES.map((creature) => ({ ...creature })).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    );
    const loaded = creatures
      .filter((creature) => creature.neutral === true)
      .toSorted((a, b) => a.id.localeCompare(b.id));
    expect(loaded).toHaveLength(15);
    expect(mine).toEqual(loaded);
  });

  it("здания — те же, что в тестах ядра, в каждом замке (30-town.md)", () => {
    const loaded = loadBuildings();
    const mine = loaded.filter((building) => (building.faction ?? "castle") === "castle");
    const core = BUILDINGS.filter((building) => (building.faction ?? "castle") === "castle");
    expect(mine.map((building) => building.id).toSorted()).toEqual(
      core.map((building) => building.id).toSorted(),
    );
    // Верхние жилища людей: конюшня, палата витязей, гнездо гривы (74-second-castle.md).
    expect(mine.map((building) => building.id)).toEqual(
      expect.arrayContaining(["stables", "champion-hall", "griffin-tower"]),
    );
    // Жилища Чащи в данных есть и принадлежат второму замку.
    expect(loaded.filter((building) => building.faction === "glade").map((b) => b.id)).toEqual([
      "kentaur-glade",
      "huntress-lodge",
      "eagle-aerie",
      "ent-grove",
      "warden-hall",
      "wyvern-cliff",
      // Седьмой уровень Чащи (docs/content/creatures.md): у людей семь уровней, теперь и здесь.
      "aurochs-pen",
    ]);
  });

  it("герои и правила таверны — те же, что в тестах ядра (32-hero-hire.md)", () => {
    const { heroes, tavern } = loadDefaults();
    expect({ heroes, tavern }).toEqual({ heroes: HEROES, tavern: TAVERN });
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

  /**
   * Ничья: обе армии погибли разом. В итоге боя стоит обороняющийся (город остаётся
   * за ним), поэтому по одному `winner` ничью не отличить — это и была ошибка:
   * проверка писала «получено: defender» вместо «nobody».
   */
  it("ничья проверяется значением nobody, а не победителем из итога", () => {
    const draw = loadBattle(files.find((file) => file.endsWith("test-draw.yaml")) ?? "");
    const viaSpell = scenarioOf({
      battle: "test-draw",
      steps: [{ cast: { spell: "armageddon" } }],
      expect: { winner: "nobody" },
    });
    expect(runBattleScenario(viaSpell, draw, creatures).failures).toEqual([]);
    // Ожидание «победил обороняющийся» на ничьей — провал, а не молчаливое согласие.
    const wrong = scenarioOf({
      battle: "test-draw",
      steps: [{ cast: { spell: "armageddon" } }],
      expect: { winner: "defender" },
    });
    expect(runBattleScenario(wrong, draw, creatures).failures).toEqual([
      "Ожидался победитель defender, получено: nobody.",
    ]);
  });

  it("неверный бой — провал без исключения", () => {
    const broken = { ...duel, obstacles: [{ col: 0, row: 0 }] };
    const run = runBattleScenario(scenarioOf({}), broken, creatures);
    expect(run.ok).toBe(false);
    expect(run.failures.length).toBeGreaterThan(0);
  });
});
