import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { SPELLS } from "@homamru/core/testkit";
import { checkMapFile, listMapFiles, loadDefaults } from "./files.ts";

// Догма 8: все файлы данных проверяются автоматически.
describe("карты из папки data/maps", () => {
  const files = listMapFiles();

  it("папка не пуста", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [basename(file), file]))("%s", (_, file) => {
    expect(checkMapFile(file)).toEqual([]);
  });
});

describe("файл заклинаний data/spells.yaml", () => {
  const { spells } = loadDefaults();

  it("двенадцать заклинаний первого круга; набор тестов ядра с ним совпадает", () => {
    expect(spells).toHaveLength(12);
    expect(spells).toEqual(SPELLS);
  });

  it("числа — как в Heroes 3 (60-spells.md)", () => {
    const rows = spells.map((spell) => [
      spell.id,
      spell.cost,
      spell.power,
      spell.value,
      spell.chance,
    ]);
    expect(rows).toEqual([
      ["magic-arrow", 5, 10, 10, 30],
      ["shield", 5, 0, 85, 10],
      ["protection-from-fire", 5, 0, 70, 3],
      ["protection-from-water", 5, 0, 70, 3],
      ["dispel", 5, 0, 0, 10],
      ["cure", 6, 5, 10, 10],
      ["bless", 5, 0, 0, 10],
      ["curse", 6, 0, 0, 0],
      ["bloodlust", 5, 0, 3, 0],
      ["stone-skin", 5, 0, 3, 5],
      ["haste", 6, 0, 3, 5],
      ["slow", 6, 0, 75, 5],
    ]);
  });
});
