import { describe, expect, it } from "vitest";
import { runAutoBattles, showAutoBattle } from "./autobattle.ts";
import { loadCreatures } from "./files.ts";

const creatures = loadCreatures();

describe("автобои из консоли", () => {
  it("сводка: все бои с существами из data/creatures проходят", () => {
    const run = runAutoBattles(200, creatures);
    expect(run.failures).toEqual([]);
    expect(run.lines[0]).toBe("Автобоёв: 200, с ошибками: 0.");
    expect(run.lines[1]).toMatch(/^Побед нападающего: \d+, обороняющегося: \d+\.$/);
    expect(run.lines[2]).toMatch(/^Раундов в бою: в среднем [\d.]+, самое большее \d+\./);
  });

  it("один бой печатается целиком и заканчивается итогом", () => {
    const run = showAutoBattle(3, creatures);
    expect(run.ok).toBe(true);
    const text = run.lines.join("\n");
    expect(text).toContain("Автобой, сид 3. Описание боя:");
    expect(text).toContain('"id":"auto-3"');
    expect(text).toContain("Команда 1: ");
    expect(text).toContain("Бой окончен в раунде");
  });

  it("сводка считает бои с ошибками", () => {
    // Существа, которые не могут сдвинуться с места: бой не кончается, срабатывает страховка.
    const stuck = creatures.map((creature) => ({ ...creature, speed: 0, flying: false, shots: 0 }));
    const run = runAutoBattles(3, stuck);
    expect(run.ok).toBe(false);
    expect(run.failures).toEqual([
      "Сид 1: бой не закончился за 200 раундов.",
      "Сид 2: бой не закончился за 200 раундов.",
      "Сид 3: бой не закончился за 200 раундов.",
    ]);
    expect(run.lines.at(-1)).toBe("Повторить бой с ошибкой: pnpm run play --autobattle <сид>");
  });

  it("сводка осад: все кончаются, сказано, сколько раз нападающий бежал", () => {
    const run = runAutoBattles(150, creatures, "siege");
    expect(run.failures).toEqual([]);
    expect(run.lines[0]).toBe("Осад: 150, с ошибками: 0.");
    expect(run.lines[3]).toMatch(/^Нападающий бежал из вставшей осады: \d+\.$/);
  });

  it("одна осада печатается целиком: выстрелы до первого хода, стена на поле, итог", () => {
    // Сид 2 — замок: ров и все башни.
    const run = showAutoBattle(2, creatures, "siege");
    expect(run.ok).toBe(true);
    const text = run.lines.join("\n");
    expect(text).toContain("Осада, сид 2. Описание боя:");
    expect(text).toContain('"siege":{"fortification":"castle"');
    expect(text).toMatch(/башня стреляет в a\d/);
    expect(text).toContain("Катапульта");
    expect(text).toMatch(/~ {2}=/);
    expect(text).toContain("Бой окончен в раунде");
  });

  it("сводка осад с ошибкой подсказывает свою команду повтора", () => {
    const stuck = creatures.map((creature) => ({ ...creature, speed: 0, flying: false, shots: 0 }));
    const run = runAutoBattles(1, stuck, "siege");
    expect(run.lines.at(-1)).toBe("Повторить бой с ошибкой: pnpm run play --siege <сид>");
  });
});
