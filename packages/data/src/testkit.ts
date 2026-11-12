/** Помощники для тестов сохранения. В игру не входят. */
import { STATE_VERSION } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { CONTENT } from "@homamru/core/testkit";
import type { SaveDefaults } from "./defaults.ts";
import { parseDump } from "./dump.ts";
import { parseMapFile } from "./map.ts";
import { chooseSave, decodeSave } from "./save.ts";
import { readState } from "./state.ts";

/** Начальные значения из контента — как их дал бы файл `data/defaults.yaml`. */
export const TEST_DEFAULTS: SaveDefaults = {
  ...CONTENT,
  heroArmy: [{ creature: "militia", count: 10 }],
};

export const TEST_TERRAIN = ["....", ".#..", "....", "...."];

/** Состояние этой версии со всеми параметрами, отличными от начальных. */
export const FULL_STATE: GameState = {
  version: STATE_VERSION,
  rng: { s: 77 },
  map: {
    id: "m",
    name: "Карта",
    width: 4,
    height: 4,
    terrain: TEST_TERRAIN,
    starts: [
      { x: 0, y: 3 },
      { x: 3, y: 0 },
    ],
  },
  players: [
    {
      id: 0,
      kind: "human",
      eliminated: false,
      townlessDays: null,
      resources: { gold: 700, wood: 3, ore: 4 },
      tavern: [],
    },
    {
      id: 1,
      kind: "human",
      eliminated: false,
      townlessDays: null,
      resources: { gold: 5, wood: 6, ore: 7 },
      tavern: [
        { kind: "milava", army: [{ creature: "militia", count: 13 }] },
        {
          kind: "ratibor",
          army: [
            { creature: "militia", count: 20 },
            { creature: "slinger", count: 4 },
          ],
        },
      ],
    },
  ],
  heroes: [
    {
      id: "A",
      owner: 0,
      kind: "velena",
      name: "Велена",
      x: 0,
      y: 0,
      movement: 359,
      attack: 3,
      defense: 2,
      army: [
        { creature: "militia", count: 17 },
        { creature: "falcon", count: 4 },
      ],
      experience: 2100,
      level: 3,
    },
    {
      id: "B",
      owner: 1,
      kind: "gorislav",
      name: "Горислав",
      x: 3,
      y: 3,
      movement: 1000,
      attack: 0,
      defense: 1,
      army: [{ creature: "slinger", count: 9 }],
      experience: 5,
      level: 1,
    },
  ],
  objects: [
    { id: "o1", type: "pile", x: 2, y: 0, resource: "wood", amount: 8 },
    { id: "o3", type: "mine", x: 0, y: 2, kind: "gold-mine", owner: 1 },
    { id: "o4", type: "guard", x: 3, y: 1, creature: "falcon", count: 12, power: 12_840 },
    {
      id: "o5",
      type: "town",
      x: 2,
      y: 2,
      owner: 1,
      buildings: ["tavern", "fort", "militia-yard", "citadel"],
      builtToday: true,
      available: [{ creature: "militia", count: 31 }],
      garrison: [
        { creature: "militia", count: 4 },
        { creature: "falcon", count: 2 },
      ],
    },
  ],
  day: 9,
  currentPlayer: 1,
  creatures: CONTENT.creatures,
  buildings: CONTENT.buildings,
  heroKinds: CONTENT.heroes,
  tavern: CONTENT.tavern,
  opponent: CONTENT.opponent,
  battle: null,
  outcome: null,
  winner: null,
};

/** Собирает текст записи с верной контрольной суммой для произвольного JSON — тем же FNV-1a. */
export function withChecksumOf(json: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}\n${json}`;
}

/** Чтение с начальными значениями тестов — чтобы не повторять их в каждом вызове. */
export const readTestState = (raw: unknown) => readState(raw, TEST_DEFAULTS);
export const decodeTestSave = (text: string) => decodeSave(text, TEST_DEFAULTS);
export const chooseTestSave = (copies: readonly [string | null, string | null]) =>
  chooseSave(copies, TEST_DEFAULTS);
export const parseTestDump = (text: string) => parseDump(text, TEST_DEFAULTS);
export const parseTestMap = (file: string, text: string) => parseMapFile(file, text, CONTENT);
