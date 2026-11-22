import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_SPELLS, OPPONENT } from "@homamru/core/testkit";
import { checkMapFile, listMapFiles, loadDefaults } from "./files.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

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

  it("54 заклинания: первый круг, три группы кругов 2–5 и три заклинания карты; набор тестов ядра — тот же", () => {
    expect(spells).toHaveLength(54);
    expect(spells).toEqual(GAME_SPELLS);
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
      ["ice-bolt", 8, 20, 10, 50],
      ["lightning-bolt", 10, 25, 10, 4],
      ["protection-from-air", 7, 0, 70, 2],
      ["precision", 8, 0, 3, 6],
      ["weakness", 8, 0, 3, 2],
      ["disrupting-ray", 10, 0, 3, 6],
      ["fortune", 7, 0, 1, 4],
      ["air-shield", 12, 0, 75, 4],
      ["protection-from-earth", 12, 0, 70, 4],
      ["mirth", 12, 0, 1, 4],
      ["misfortune", 12, 0, 1, 4],
      ["prayer", 16, 0, 2, 10],
      ["sorrow", 16, 0, 1, 5],
      ["implosion", 30, 75, 100, 1],
      ["frost-ring", 12, 10, 15, 16],
      ["fireball", 15, 10, 15, 8],
      ["inferno", 16, 10, 20, 5],
      ["meteor-shower", 16, 25, 25, 10],
      ["chain-lightning", 24, 40, 25, 10],
      ["armageddon", 24, 50, 30, 0],
      ["blind", 10, 0, 50, 4],
      ["forgetfulness", 12, 0, 50, 8],
      ["anti-magic", 15, 0, 3, 12],
      ["frenzy", 16, 0, 100, 5],
      ["counterstrike", 24, 0, 1, 5],
      ["fire-shield", 16, 0, 20, 5],
      ["hypnotize", 18, 25, 10, 4],
      ["berserk", 20, 0, 0, 5],
      ["magic-mirror", 25, 0, 20, 1],
      ["remove-obstacle", 7, 0, 0, 4],
      ["force-field", 12, 0, 2, 4],
      ["earthquake", 20, 0, 2, 4],
      ["teleport", 15, 0, 0, 8],
      ["quicksand", 8, 0, 0, 4],
      ["fire-wall", 8, 10, 10, 4],
      ["land-mine", 18, 10, 25, 8],
      ["resurrection", 20, 50, 40, 10],
      ["clone", 24, 0, 5, 5],
      ["sacrifice", 25, 1, 3, 1],
      ["visions", 4, 0, 1, 2],
      ["disguise", 4, 0, 0, 2],
      ["town-portal", 16, 0, 300, 10],
    ]);
  });
});

// Долг из порции 61, закрытый в порции 62: списка стройки два, и они независимы —
// `data/defaults.yaml` для игры и `OPPONENT.buildOrder` для тестов. Правка одного не видна
// другому, и один раз они уже разошлись. Этот тест держит их одинаковыми.
describe("список стройки компьютера", () => {
  it("в defaults.yaml и в наборе тестов ядра — один и тот же порядок", () => {
    const { opponent } = loadDefaults();
    expect(opponent.buildOrder).toEqual([...OPPONENT.buildOrder]);
  });

  it("верхних жилищ людей в нём нет: с ними 38 : 2 вместо 19 : 21 (74-second-castle.md)", () => {
    const { opponent } = loadDefaults();
    expect(opponent.buildOrder).not.toContain("stables");
    expect(opponent.buildOrder).not.toContain("griffin-tower");
  });
});

// Каталог того, чего не хватает (docs/content/), называет числа: 43 существа (28 в четырёх
// замках и 15 нейтралов), 40 зданий, 54 заклинания, 6 героев. Документ — память проекта, и если он разойдётся с данными,
// то читатель получит ложь. Этот сторож читает сам каталог и сверяет его числа с данными.
// Проверено порчей: подмена числа в creatures.md роняет первый тест.
describe("каталог docs/content и данные игры", () => {
  it("числа в каталоге — те же, что в данных", () => {
    const { creatures, buildings, spells, heroes } = loadDefaults();
    const catalog = readFileSync(join(ROOT, "docs/content/creatures.md"), "utf8");
    expect([creatures.length, buildings.length, spells.length, heroes.length]).toEqual([
      43, 40, 54, 6,
    ]);
    // «У нас» в каталоге существ — то же число, что в папке существ.
    expect(catalog).toContain(`| **${String(creatures.length)}** |`);
    expect(catalog).toContain(`**${creatures.length}**`);
  });

  it("у обоих замков по семь уровней — как записано в каталоге", () => {
    const { creatures } = loadDefaults();
    const levels = (faction: string[]) =>
      creatures
        .filter((creature) => faction.includes(creature.id))
        .map((creature) => creature.level ?? 0)
        .toSorted((a, b) => a - b);
    expect(
      levels(["militia", "slinger", "falcon", "armsman", "cavalier", "champion", "griffin"]),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(levels(["kentaur", "huntress", "eagle", "ent", "warden", "wyvern", "aurochs"])).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("ни одного артефакта: каталог говорит «0 из 134»", () => {
    const { creatures, buildings, spells } = loadDefaults();
    expect(
      [creatures, buildings, spells].map((list) => JSON.stringify(list).includes("artifact")),
    ).toEqual([false, false, false]);
  });
});
