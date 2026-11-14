// Карта первой версии «Четыре края» для двоих: числа из docs/mechanics/25-first-map.md
// проверяются партиями компьютера с компьютером. Поменяли карту так, что партии
// перестали кончаться или стали пустяком, — тесты упадут.
import type { MapDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { loadDefaults, loadRivalsMap } from "./files.ts";
import { runComputerGames } from "./rivals.ts";

const map = loadRivalsMap("four-corners");
const content = loadDefaults();
const GAMES = 20;
/** Раньше партия кончаться не должна: карта не пустяк. */
const SHORTEST_DAYS = 21;
/** Тесты играют по многу партий: в CI это дольше обычного предела. */
const SLOW = 120_000;

/** Та же карта, но игроки поменялись краями: первым ходит юго-восток. */
function swapped(original: MapDefinition): MapDefinition {
  const [first, second] = original.players;
  if (first === undefined || second === undefined) {
    throw new Error("На карте должно быть два игрока.");
  }
  return {
    ...original,
    players: [
      { ...second, kind: first.kind },
      { ...first, kind: second.kind },
    ],
    objects: original.objects?.map((object) =>
      object.type === "town" ? { ...object, owner: 1 - object.owner } : object,
    ),
  };
}

function statsOf(lines: readonly string[]): { wins: number[]; from: number; to: number } {
  const wins = /игрок 1 — (\d+), игрок 2 — (\d+)/.exec(lines[1] ?? "");
  const days = /от (\d+) до (\d+)/.exec(lines[2] ?? "");
  return {
    wins: [Number(wins?.[1]), Number(wins?.[2])],
    from: Number(days?.[1]),
    to: Number(days?.[2]),
  };
}

describe("карта первой версии «Четыре края»", () => {
  it("на карте два игрока: человек на северо-западе, компьютер на юго-востоке, у каждого город", () => {
    expect(map.players.map((player) => player.kind ?? "human")).toEqual(["human", "computer"]);
    const towns = (map.objects ?? []).filter((object) => object.type === "town");
    expect(towns.map((town) => town.owner)).toEqual([0, 1]);
    expect(map.players[0]?.resources).toEqual(map.players[1]?.resources);
    expect(map.players[0]?.hero.army).toEqual(map.players[1]?.hero.army);
  });

  it(
    "партии двух компьютеров кончаются победой в срок, но не раньше трёх недель",
    () => {
      const run = runComputerGames(GAMES, map, content);
      expect(run.failures).toEqual([]);
      const { from, to } = statsOf(run.lines);
      expect(from).toBeGreaterThanOrEqual(SHORTEST_DAYS);
      expect(to).toBeLessThanOrEqual(120);
    },
    SLOW,
  );

  it(
    "с северо-запада первый игрок побеждает",
    () => {
      const northWestFirst = statsOf(runComputerGames(GAMES, map, content).lines);
      expect(northWestFirst.wins[0]).toBeGreaterThan(GAMES / 2);
    },
    SLOW,
  );

  // На шаге 7.2 магия сломала это свойство (первый игрок с юго-востока не побеждал ни разу);
  // починено двумя правилами компьютера: «враг рядом» и «за гарнизоном» (42-opponent.md).
  it(
    "край не решает: первый игрок побеждает и с юго-востока",
    () => {
      const southEastFirst = runComputerGames(GAMES, swapped(map), content);
      expect(statsOf(southEastFirst.lines).wins[0]).toBeGreaterThan(GAMES / 2);
    },
    SLOW,
  );
});
