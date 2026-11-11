import { describe, expect, it } from "vitest";
import { parseScenarioFile } from "./scenario.ts";

const FILE = "data/scenarios/test.yaml";

// Пример из docs/mechanics/05-diagnostics.md.
const EXAMPLE = `
name: Герой упирается в преграду
map: test-small
seed: 1
steps:
  - move: { hero: A, path: [S] }
  - endTurn: {}
  - move: { hero: A, path: [E] }
    expectError: STEP_BLOCKED
expect:
  day: 2
  heroes:
    A: { x: 1, y: 2 }
`;

describe("файл сценария", () => {
  it("разбирает пример из спецификации", () => {
    expect(parseScenarioFile(FILE, EXAMPLE)).toEqual({
      ok: true,
      value: {
        name: "Герой упирается в преграду",
        map: "test-small",
        seed: 1,
        steps: [
          { move: { hero: "A", path: ["S"] } },
          { endTurn: {} },
          { move: { hero: "A", path: ["E"] }, expectError: "STEP_BLOCKED" },
        ],
        expect: { day: 2, heroes: { A: { x: 1, y: 2 } } },
      },
    });
  });

  it("разбирает сценарий без ожиданий", () => {
    const text = "name: Пусто\nmap: test-small\nseed: 7\nsteps: []\n";
    expect(parseScenarioFile(FILE, text)).toMatchObject({ ok: true, value: { steps: [] } });
  });

  it.each([
    ["неизвестное направление", EXAMPLE.replace("[S]", "[UP]")],
    ["неизвестный код отказа", EXAMPLE.replace("STEP_BLOCKED", "NO_WAY")],
    ["неизвестную команду", EXAMPLE.replace("endTurn: {}", "dance: {}")],
    ["дробный сид", EXAMPLE.replace("seed: 1", "seed: 1.5")],
    ["лишнее поле", `${EXAMPLE}comment: лишнее\n`],
  ])("отвергает %s", (_, text) => {
    const result = parseScenarioFile(FILE, text);
    expect(result).toMatchObject({ ok: false, errors: [{ file: FILE }] });
  });
});
