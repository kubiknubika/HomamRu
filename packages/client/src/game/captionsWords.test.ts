// Надписи экрана карты: слова, которых не было в прежних тестах (24-map-screen.md).
import { createGame } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { CONTENT } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { creatureName, heroName, incomeText, lower } from "./captions.ts";

function game(): GameState {
  const created = createGame(
    {
      id: "t",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 5 }] } }],
      objects: [],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

describe("слова карты", () => {
  it("доход перечисляет только то, чего прибыло", () => {
    expect(
      incomeText({ gold: 1000, wood: 0, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 }),
    ).toBe("золото +1000");
    expect(
      incomeText({ gold: 0, wood: 2, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 }),
    ).toBe("дерево +2");
    expect(
      incomeText({ gold: 500, wood: 0, ore: 3, mercury: 0, sulfur: 0, crystal: 0, gems: 0 }),
    ).toBe("золото +500, руда +3");
    // Ничего не прибыло — пустая строка, а не «золото +0».
    expect(
      incomeText({ gold: 0, wood: 0, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 }),
    ).toBe("");
  });

  it("название существа берётся из игры, незнакомое — как записано", () => {
    const state = game();
    expect(creatureName(state, "militia")).toBe("Ополченец");
    expect(creatureName(state, "slinger")).toBe("Пращник");
    // Существа нет в файлах игры — показываем идентификатор, но не пустую строку.
    expect(creatureName(state, "dragon")).toBe("dragon");
  });

  it("имя героя берётся из списка, незнакомое — как записано", () => {
    const state = game();
    const first = state.heroKinds[0];
    expect(first).toBeDefined();
    expect(heroName(state, first?.id ?? "")).toBe(first?.name);
    expect(heroName(state, "неизвестный")).toBe("неизвестный");
  });

  it("строчные буквы: только понижение регистра, без обрезки", () => {
    expect(lower("Ополченец")).toBe("ополченец");
    expect(lower("Стена огня")).toBe("стена огня");
    expect(lower("")).toBe("");
  });
});
