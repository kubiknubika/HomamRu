// Карта первой версии проходима: docs/mechanics/25-first-map.md.
import { createGame } from "@homamru/core";
import { parseMapFile } from "@homamru/data";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCreatures } from "./files.ts";
import { walkThrough } from "./walkthrough.ts";

const FILE = "data/maps/four-corners.yaml";

function play(seed: number) {
  const creatures = loadCreatures();
  const map = parseMapFile(
    FILE,
    readFileSync(new URL(`../../../${FILE}`, import.meta.url), "utf8"),
    creatures,
  );
  if (!map.ok) {
    throw new Error(map.errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  }
  const created = createGame(map.value, seed, creatures);
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return walkThrough(created.state, 60);
}

const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

describe("карта первой версии «Четыре края»", () => {
  it("с сидом игры (1) проходчик проходит карту целиком и занимает все шахты", () => {
    const { state, complete, journal } = play(1);
    expect(journal.at(-1)).toMatch(/карта пройдена$/);
    expect(complete).toBe(true);
    expect(state.objects.map((object) => object.type)).toEqual(["mine", "mine", "mine", "mine"]);
    // Все 17 кучек собраны: золото 6300, дерево 40, руда 31; сверху — доход шахт.
    const resources = state.players[0]?.resources ?? { gold: 0, wood: 0, ore: 0 };
    expect(resources.gold).toBeGreaterThanOrEqual(6300);
    expect(resources.wood).toBeGreaterThanOrEqual(40);
    expect(resources.ore).toBeGreaterThanOrEqual(31);
  });

  it("карта не слишком трудна: проходчик проходит её не реже чем в 3 партиях из 4", () => {
    const passed = SEEDS.filter((seed) => play(seed).complete);
    expect(passed.length).toBeGreaterThanOrEqual(15);
  });

  it("и не пустяк: к концу у проходчика остаётся меньше двух третей армии", () => {
    // В начале 60 существ.
    const left = play(1).state.heroes[0]?.army.reduce((sum, stack) => sum + stack.count, 0);
    expect(left).toBeLessThan(40);
  });

  it("прохождение повторяется: те же команды дают то же состояние", () => {
    const first = play(1);
    expect(play(1).commands).toEqual(first.commands);
  });
});
