// Магия на экране города: docs/mechanics/64-magic-screen.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame, townOf } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { createSession } from "./session.ts";
import { bookStatus, buildingGives } from "./townTexts.ts";

/** Партия: город игрока с гильдией магов в (1, 1); герой — в городе или в стороне. */
function game(gold: number, heroInTown: boolean): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        {
          hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] },
          resources: { gold, wood: 0, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 },
        },
      ],
      objects: [{ type: "town", x: 1, y: 1, owner: 0, buildings: ["tavern", "mage-guild"] }],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  // Героя в город ставим в обход правил: начать партию на клетке города карта не даёт.
  const at = heroInTown ? 1 : 0;
  return {
    ...created.state,
    heroes: created.state.heroes.map((hero) => ({ ...hero, x: at, y: at })),
  };
}

function statusOf(state: GameState) {
  const town = townOf(state, 0);
  return town === undefined ? undefined : bookStatus(state, town);
}

describe("гильдия магов на экране города", () => {
  it("в списке зданий сказано, что даёт гильдия", () => {
    const state = game(1000, true);
    const guild = state.buildings.find((building) => building.id === "mage-guild");
    expect(guild && buildingGives(state, guild)).toBe(
      "пять заклинаний первого круга, книга заклинаний",
    );
  });

  it("строка про книгу: четыре состояния", () => {
    expect(statusOf(game(1000, true))).toEqual({ kind: "buy", price: 500 });
    expect(statusOf(game(380, true))).toEqual({
      kind: "text",
      text: "Книга: не хватает золота 120",
    });
    expect(statusOf(game(1000, false))).toEqual({ kind: "text", text: "Героя в городе нет" });
  });

  it("покупка книги: золото −500, заклинания выучены, сообщения показаны", () => {
    const session = createSession(game(1000, true));
    session.openTown();
    session.buyBook();
    const { state, notice } = session.getSnapshot();
    expect(state.players[0]?.resources.gold).toBe(500);
    expect(state.heroes[0]).toMatchObject({ book: true });
    expect(state.heroes[0]?.spells).toHaveLength(5);
    expect(statusOf(state)).toEqual({ kind: "text", text: "Книга есть, заклинания выучены" });
    expect(JSON.stringify(notice)).toContain("Куплена книга заклинаний");
    expect(JSON.stringify(notice)).toContain("Выучены заклинания");
  });
});
