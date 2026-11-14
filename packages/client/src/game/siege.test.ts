// Осада внутри партии на экране: docs/mechanics/51-siege-screen.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { finishBattle, go } from "./screenKit.ts";
import { createSession } from "./session.ts";

/** Игрок — герой A рядом с городом противника в (4, 4); в городе такие постройки и гарнизон. */
function atTown(buildings: string[]): GameState {
  const created = createGame(
    {
      id: "siege",
      name: "Осада",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        {
          hero: { x: 3, y: 3, attack: 0, defense: 0, army: [{ creature: "militia", count: 300 }] },
        },
        {
          hero: { x: 7, y: 0, attack: 0, defense: 0, army: [{ creature: "militia", count: 1 }] },
          kind: "computer",
        },
      ],
      objects: [
        { type: "town", x: 0, y: 7, owner: 0, buildings: ["tavern"] },
        {
          type: "town",
          x: 4,
          y: 4,
          owner: 1,
          buildings,
          garrison: [{ creature: "militia", count: 5 }],
        },
      ],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

function openingOf(buildings: string[]): { shown: string[]; whole: boolean } {
  const session = createSession(atTown(buildings));
  go(session, 4, 4);
  session.enterBattle();
  const battle = session.getSnapshot().battle;
  if (battle === null) {
    throw new Error("боя нет");
  }
  const before = battle.getSnapshot().state;
  const whole = before.stacks.every((stack) => stack.count === stack.initialCount);
  const shown: string[] = [];
  battle.subscribe((_snapshot, events) => {
    shown.push(...events.map((event) => event.type));
  });
  battle.animationDone();
  return { shown, whole };
}

describe("осада в партии", () => {
  it("замок: до первого хода экран показывает выстрелы трёх башен и катапульты", () => {
    const { shown, whole } = openingOf(["tavern", "fort", "citadel", "castle"]);
    expect(whole).toBe(true);
    expect(shown).toEqual(["towerShot", "towerShot", "towerShot", "catapultShot"]);
  });

  it("форт: башен нет, показан только выстрел катапульты", () => {
    expect(openingOf(["tavern", "fort"]).shown).toEqual(["catapultShot"]);
  });

  it("город без форта: показывать нечего, сразу ход игрока", () => {
    expect(openingOf(["tavern"]).shown).toEqual([]);
  });

  it("осаду можно доиграть на экране: город взят", () => {
    const session = createSession(atTown(["tavern", "fort", "citadel"]));
    go(session, 4, 4);
    session.enterBattle();
    finishBattle(session);
    session.leaveBattle();
    expect(session.getSnapshot().state.battle).toBeNull();
    expect(session.getSnapshot().townId).toBe("o2");
  });

  it("бой, поднятый из сохранения, открывается без показа выстрелов и с той же армией", () => {
    const first = createSession(atTown(["tavern", "fort", "citadel"]));
    go(first, 4, 4);
    const saved = first.getSnapshot().state;
    const resumed = createSession(saved).getSnapshot().battle;
    expect(resumed?.getSnapshot().state).toBe(saved.battle?.state);
    expect(resumed?.getSnapshot().log).toContain("До первого хода");
  });
});
