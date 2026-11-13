// Охранники карты первой версии проходимы одним городом: docs/mechanics/25-first-map.md.
import { createGame, townOf } from "@homamru/core";
import type { MapDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadDefaults, loadMap } from "./files.ts";
import { walkThrough } from "./walkthrough.ts";

const FILE = "data/maps/four-corners.yaml";
/** Срок прохождения: десять недель. */
const MAX_DAYS = 70;
/** Тесты проходят карту по многу раз: в CI это дольше обычного предела. */
const SLOW = 120_000;

function playMap(map: MapDefinition, seed: number) {
  const created = createGame(map, seed, loadDefaults());
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return walkThrough(created.state, MAX_DAYS);
}

/**
 * Карта без противника: проходчик проверяет только охранников и хозяйство —
 * хватает ли одного города, чтобы взять всё на карте. Город противника убран,
 * чтобы проходчик не кончал партию его захватом.
 */
function loadFirstMap(): MapDefinition {
  const map = loadMap(resolve(import.meta.dirname, "../../..", FILE));
  return {
    ...map,
    players: map.players.slice(0, 1),
    objects: map.objects?.filter((object) => object.type !== "town" || object.owner === 0),
  };
}

function play(seed: number) {
  return playMap(loadFirstMap(), seed);
}

const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

describe("карта первой версии «Четыре края»", () => {
  it(
    "с сидом игры (1) проходчик проходит карту целиком и занимает все шахты",
    () => {
      const { state, complete, journal } = play(1);
      expect(journal.at(-1)).toMatch(/карта пройдена$/);
      expect(complete).toBe(true);
      expect(state.objects.map((object) => object.type).toSorted()).toEqual([
        "mine",
        "mine",
        "mine",
        "mine",
        "town",
      ]);
      expect(state.objects.every((object) => object.type !== "mine" || object.owner === 0)).toBe(
        true,
      );
    },
    SLOW,
  );

  it(
    "проходчик отстраивает город целиком и нанимает армию",
    () => {
      const { state, commands } = play(1);
      expect(townOf(state, 0)?.buildings.toSorted()).toEqual(
        state.buildings.map((building) => building.id).toSorted(),
      );
      const recruited = commands.reduce(
        (sum, command) => sum + (command.type === "recruit" ? command.count : 0),
        0,
      );
      // В начале у героя 28 существ: без найма карту не пройти.
      expect(recruited).toBeGreaterThan(100);
    },
    SLOW,
  );

  it(
    "карта не слишком трудна: проходчик проходит её за десять недель не реже чем в 3 партиях из 4",
    () => {
      const passed = SEEDS.filter((seed) => play(seed).complete);
      expect(passed.length).toBeGreaterThanOrEqual(15);
    },
    SLOW,
  );

  it(
    "и не пустяк: на прохождение уходит больше трёх недель, армии города нужны",
    () => {
      expect(play(1).state.day).toBeGreaterThan(21);
    },
    SLOW,
  );

  it(
    "без города карту не пройти: начальной армии не хватает",
    () => {
      const map = loadFirstMap();
      const townless = {
        ...map,
        objects: (map.objects ?? []).filter((object) => object.type !== "town"),
      };
      const { complete, state } = playMap(townless, 1);
      expect(complete).toBe(false);
      expect(state.outcome).toBe("defeat");
    },
    SLOW,
  );

  it(
    "прохождение повторяется: те же команды дают то же состояние",
    () => {
      const first = play(1);
      expect(play(1).commands).toEqual(first.commands);
    },
    SLOW,
  );
});
