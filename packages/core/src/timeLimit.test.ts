// Предел времени партии: docs/mechanics/41-victory.md. Как в Heroes 3, он — свойство карты:
// день перевалил за предел — партия кончается, побеждает сильнейший. Длинные партии
// на настоящих картах играет cli/src/rivals.test.ts.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { timeLimitResult } from "./players.ts";
import { fromPicture } from "./testkit.ts";
import type { GameEvent, GameState } from "./types.ts";

const events: GameEvent[] = [];
/** Два героя в разных углах: армии одинаковые (по 10 ополченцев из рисунка). */
const PICTURE = ["S...", "....", "....", "...B"];

function withLimit(limit: number | undefined, day = 1): GameState {
  const { state } = fromPicture(PICTURE);
  return { ...state, day, map: { ...state.map, daysLimit: limit } };
}

describe("предел времени партии", () => {
  it("без предела карты правило молчит", () => {
    expect(timeLimitResult(withLimit(undefined, 999), events)).toBeNull();
  });

  it("на дне предела и раньше партия идёт", () => {
    expect(timeLimitResult(withLimit(120, 120), events)).toBeNull();
    expect(timeLimitResult(withLimit(120, 60), events)).toBeNull();
  });

  it("день перевалил за предел — победил сильнейший, ничьей нет", () => {
    const result = timeLimitResult(withLimit(120, 121), events);
    expect(result?.outcome).toBe("victory");
    expect(result?.winner).toBe(0);
  });

  it("у второго героя армия дороже — побеждает он", () => {
    const state = withLimit(120, 121);
    const strong: GameState = {
      ...state,
      heroes: state.heroes.map((hero) =>
        hero.owner === 1 ? { ...hero, army: [{ creature: "militia", count: 99 }] } : hero,
      ),
    };
    expect(timeLimitResult(strong, events)?.winner).toBe(1);
  });

  it("после конца партии правило второй раз не срабатывает", () => {
    const ended: GameState = { ...withLimit(120, 121), outcome: "victory", winner: 1 };
    expect(timeLimitResult(ended, events)).toBeNull();
  });

  it("ход партии на карте с пределом кончается победой по сроку", () => {
    let state = withLimit(2);
    for (let count = 0; count < 20 && state.outcome === null; count += 1) {
      const result = applyCommand(state, { type: "endTurn", player: state.currentPlayer });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        break;
      }
      ({ state } = result);
    }
    expect(state.outcome).toBe("victory");
    expect(state.day).toBeGreaterThan(2);
  });
});

describe("причина конца партии по сроку", () => {
  it("событие называет срок, а не бой", async () => {
    const { formatEvent } = await import("./render.ts");
    const state = withLimit(2);
    let last: readonly GameEvent[] = [];
    let current = state;
    for (let count = 0; count < 20 && current.outcome === null; count += 1) {
      const result = applyCommand(current, { type: "endTurn", player: current.currentPlayer });
      if (!result.ok) {
        break;
      }
      last = result.events;
      ({ state: current } = result);
    }
    const over = last.find((event) => event.type === "gameOver");
    expect(over).toMatchObject({ outcome: "victory", byTime: true });
    expect(over === undefined ? "" : formatEvent(over)).toContain("срок карты вышел");
  });
});
