import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_SPELLS } from "@homamru/core/testkit";
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

  it("45 заклинаний: первый круг и три группы кругов 2–5; набор тестов ядра — тот же", () => {
    expect(spells).toHaveLength(45);
    expect(spells).toEqual(ALL_SPELLS);
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
      ["ice-bolt", 8, 20, 10, 0],
      ["lightning-bolt", 10, 25, 10, 0],
      ["protection-from-air", 7, 0, 70, 0],
      ["precision", 8, 0, 3, 0],
      ["weakness", 8, 0, 3, 0],
      ["disrupting-ray", 10, 0, 3, 0],
      ["fortune", 7, 0, 1, 0],
      ["air-shield", 12, 0, 75, 0],
      ["protection-from-earth", 12, 0, 70, 0],
      ["mirth", 12, 0, 1, 0],
      ["misfortune", 12, 0, 1, 0],
      ["prayer", 16, 0, 2, 0],
      ["sorrow", 16, 0, 1, 0],
      ["implosion", 30, 75, 100, 0],
      ["frost-ring", 12, 10, 15, 0],
      ["fireball", 15, 10, 15, 0],
      ["inferno", 16, 10, 20, 0],
      ["meteor-shower", 16, 25, 25, 0],
      ["chain-lightning", 24, 40, 25, 0],
      ["armageddon", 24, 50, 30, 0],
      ["blind", 10, 0, 50, 0],
      ["forgetfulness", 12, 0, 50, 0],
      ["anti-magic", 15, 0, 3, 0],
      ["frenzy", 16, 0, 100, 0],
      ["counterstrike", 24, 0, 1, 0],
      ["fire-shield", 16, 0, 20, 0],
      ["hypnotize", 18, 25, 10, 0],
      ["berserk", 20, 0, 0, 0],
      ["magic-mirror", 25, 0, 20, 0],
      ["remove-obstacle", 7, 0, 0, 0],
      ["force-field", 12, 0, 2, 0],
      ["earthquake", 20, 0, 2, 0],
      ["teleport", 15, 0, 0, 0],
    ]);
  });
});
