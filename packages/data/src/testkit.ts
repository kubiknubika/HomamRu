/** Помощники для тестов сохранения. В игру не входят. */
import { STATE_VERSION } from "@homamru/core";
import type { GameState } from "@homamru/core";

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
    { id: 0, resources: { gold: 700, wood: 3, ore: 4 } },
    { id: 1, resources: { gold: 5, wood: 6, ore: 7 } },
  ],
  heroes: [
    { id: "A", owner: 0, x: 0, y: 0, movement: 359 },
    { id: "B", owner: 1, x: 3, y: 3, movement: 1000 },
  ],
  objects: [
    { id: "o1", type: "pile", x: 2, y: 0, resource: "wood", amount: 8 },
    { id: "o3", type: "mine", x: 0, y: 2, kind: "gold-mine", owner: 1 },
  ],
  day: 9,
  currentPlayer: 1,
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
