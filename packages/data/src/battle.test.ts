import { describe, expect, it } from "vitest";
import { parseBattleFile, parseBattleScenarioFile, parseCreatureFile } from "./battle.ts";

const CREATURE = {
  id: "militia",
  name: "Ополченец",
  attack: 5,
  defense: 5,
  damageMin: 2,
  damageMax: 3,
  health: 12,
  speed: 4,
  flying: false,
  shots: 0,
};

const BATTLE = `
id: test
name: Проверка
obstacles: [[6, 3]]
attacker:
  hero: { attack: 1, defense: 2 }
  morale: 1
  luck: 0
  army:
    - { creature: militia, count: 20 }
defender:
  morale: 0
  luck: 0
  army:
    - { creature: slinger, count: 8 }
`;

describe("файл существа", () => {
  it("верный файл читается", () => {
    const result = parseCreatureFile("militia.json", JSON.stringify(CREATURE));
    expect(result).toMatchObject({ ok: true, value: CREATURE });
  });

  it.each([
    ["урон «от» больше «до»", { damageMin: 4 }],
    ["нулевое здоровье", { health: 0 }],
    ["нулевая скорость", { speed: 0 }],
    ["дробная атака", { attack: 1.5 }],
    ["отрицательные выстрелы", { shots: -1 }],
    ["лишнее поле", { magic: 1 }],
    ["плохой идентификатор", { id: "Ополченец" }],
  ])("отклоняется: %s", (_name, changes) => {
    const text = JSON.stringify({ ...CREATURE, ...changes });
    expect(parseCreatureFile("x.json", text)).toMatchObject({ ok: false });
  });
});

describe("файл боя", () => {
  it("верный файл читается, клетки становятся парами столбец–ряд", () => {
    expect(parseBattleFile("test.yaml", BATTLE)).toMatchObject({
      ok: true,
      value: {
        id: "test",
        obstacles: [{ col: 6, row: 3 }],
        attacker: { hero: { attack: 1, defense: 2 }, army: [{ creature: "militia", count: 20 }] },
        defender: { morale: 0 },
      },
    });
  });

  it("файл без армии или с лишним полем отклоняется", () => {
    const renamed = BATTLE.replace("defender:", "enemy:");
    expect(parseBattleFile("x.yaml", renamed)).toMatchObject({ ok: false });
    expect(parseBattleFile("x.yaml", `${BATTLE}weather: rain\n`)).toMatchObject({ ok: false });
  });
});

describe("файл сценария боя", () => {
  it("читает шаги всех видов", () => {
    const text = `
name: Проверка
battle: test-duel
seed: 3
steps:
  - move: [8, 5]
  - attack: { target: b1, from: [13, 5] }
  - shoot: a1
    expectError: ENEMY_ADJACENT
  - wait: {}
  - defend: {}
  - flee: {}
expect:
  winner: defender
  stacks:
    a1: { count: 3, cell: [1, 2] }
`;
    expect(parseBattleScenarioFile("s.yaml", text)).toMatchObject({
      ok: true,
      value: {
        steps: [
          { move: { col: 8, row: 5 } },
          { attack: { target: "b1", from: { col: 13, row: 5 } } },
          { shoot: "a1", expectError: "ENEMY_ADJACENT" },
          { wait: {} },
          { defend: {} },
          { flee: {} },
        ],
        expect: { winner: "defender", stacks: { a1: { count: 3, cell: { col: 1, row: 2 } } } },
      },
    });
  });

  it("неизвестный код отказа и неизвестный шаг отклоняются", () => {
    const head = "name: П\nbattle: b\nseed: 1\nsteps:\n";
    const badCode = `${head}  - wait: {}\n    expectError: NOPE\n`;
    expect(parseBattleScenarioFile("s.yaml", badCode)).toMatchObject({ ok: false });
    expect(parseBattleScenarioFile("s.yaml", `${head}  - dance: {}\n`)).toMatchObject({
      ok: false,
    });
  });
});
