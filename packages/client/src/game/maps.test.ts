// Карты экрана: docs/mechanics/25-first-map.md. Каждая карта открывается, начинается
// и отдаёт партию — проверка ловит и испорченный файл, и новое поле, которое карта
// перестала понимать (так было с пределом времени daysLimit).
import { describe, expect, it } from "vitest";
import { MAP_COUNT, mapIndexOf, mapLabel, startGame } from "./maps.ts";

describe("карты экрана", () => {
  it("каждая карта начинается и отдаёт партию", () => {
    expect(MAP_COUNT).toBeGreaterThan(0);
    for (let index = 0; index < MAP_COUNT; index += 1) {
      const state = startGame(index);
      expect(state.day).toBe(1);
      expect(state.outcome).toBeNull();
      expect(state.heroes.length).toBeGreaterThan(0);
      expect(state.map.terrain.length).toBeGreaterThan(0);
    }
  });

  it("карта по номеру называется своим именем", () => {
    for (let index = 0; index < MAP_COUNT; index += 1) {
      const state = startGame(index);
      expect(mapIndexOf(state.map.id)).toBe(index);
      expect(mapLabel(index)).not.toBe("");
      expect(state.map.name).not.toBe("");
    }
  });

  it("неизвестный номер карты — ошибка, а не молчаливая партия", () => {
    expect(() => startGame(MAP_COUNT)).toThrow(/Карты с номером/);
  });

  it("карты соперников и первая карта знают предел времени", () => {
    const first = startGame(0);
    expect(first.map.daysLimit).toBe(120);
  });
});
