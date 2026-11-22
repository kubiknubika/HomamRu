// Улучшения жилищ (82-creature-upgrades.md). Владелец выбрал 2026-11-11: улучшение — это здание.
// Оно строится после базового жилища и не заменяет его: в городе появляется второй жилец
// того же уровня, и нанимать можно обоих. Новых команд нет.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { fromPicture } from "./testkit.ts";
import { stockTown } from "./town.ts";
import type { GameState, TownState } from "./types.ts";

const PICTURE = ["S...", "....", "....", "...."];
const RICH = { gold: 500_000, wood: 80, ore: 80, mercury: 40, sulfur: 40, crystal: 40, gems: 40 };

function castle(buildings: readonly string[]): GameState {
  const { state } = fromPicture(PICTURE);
  const player = state.players[0];
  if (player === undefined) {
    throw new Error("в рисунке нет игрока");
  }
  const town: TownState = {
    id: "o1",
    type: "town",
    x: 1,
    y: 1,
    owner: 0,
    faction: "castle",
    buildings: [...buildings],
    builtToday: false,
    available: [],
    garrison: [],
    spells: [],
  };
  // Как в настоящей партии: в построенных жилищах уже ждёт недельный прирост.
  const stocked = stockTown({ ...state, players: [{ ...player, resources: RICH }] }, town);
  return { ...state, objects: [stocked], players: [{ ...player, resources: RICH }] };
}

function build(state: GameState, building: string) {
  return applyCommand(state, { type: "build", player: 0, townId: "o1", building });
}

function townOf(state: GameState): TownState {
  const town = state.objects[0];
  if (town?.type !== "town") {
    throw new Error("город пропал");
  }
  return town;
}

describe("улучшения жилищ", () => {
  it("улучшение строится только после базового жилища", () => {
    const without = castle(["tavern", "fort"]);
    const refused = build(without, "militia-yard-up");
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.code).toBe("REQUIREMENT_MISSING");

    const withBase = castle(["tavern", "fort", "militia-yard"]);
    expect(build(withBase, "militia-yard-up").ok).toBe(true);
  });

  it("после улучшения в городе ждут оба: ополченцы и ветераны", () => {
    const state = castle(["tavern", "fort", "militia-yard"]);
    const built = build(state, "militia-yard-up");
    if (!built.ok) {
      throw new Error(built.message);
    }
    const waiting = townOf(built.state).available;
    expect(waiting.find((stack) => stack.creature === "militia")?.count).toBe(14);
    // Ветераны приходят своим приростом — он вдвое меньше базового.
    expect(waiting.find((stack) => stack.creature === "militia-vet")?.count).toBe(14);
  });

  it("нанять можно и базовое существо, и улучшенное", () => {
    const built = build(castle(["tavern", "fort", "militia-yard"]), "militia-yard-up");
    if (!built.ok) {
      throw new Error(built.message);
    }
    const veteran = applyCommand(built.state, {
      type: "recruit",
      player: 0,
      townId: "o1",
      creature: "militia-vet",
      count: 3,
    });
    expect(veteran.ok).toBe(true);
    // Улучшение стоило 800 золота, улучшенное существо — 140: вместе 800 + 3 × 140.
    expect(veteran.ok ? veteran.state.players[0]?.resources.gold : 0).toBe(RICH.gold - 800 - 420);
    const base = applyCommand(built.state, {
      type: "recruit",
      player: 0,
      townId: "o1",
      creature: "militia",
      count: 2,
    });
    expect(base.ok).toBe(true);
    const garrison = townOf(base.ok ? base.state : built.state).garrison;
    expect(garrison.find((stack) => stack.creature === "militia")?.count).toBe(2);
  });

  it("в начале недели растут оба жильца: и базовый, и улучшенный", () => {
    const built = build(castle(["tavern", "fort", "militia-yard"]), "militia-yard-up");
    if (!built.ok) {
      throw new Error(built.message);
    }
    // Недельный прирост — командой конца хода: семь дней, на восьмой начинается новая неделя.
    let state = built.state;
    for (let day = 0; day < 7; day += 1) {
      const ended = applyCommand(state, { type: "endTurn", player: 0 });
      if (!ended.ok) {
        throw new Error(ended.message);
      }
      state = ended.state;
    }
    const waiting = townOf(state).available;
    expect(waiting.find((stack) => stack.creature === "militia")?.count).toBe(28);
    expect(waiting.find((stack) => stack.creature === "militia-vet")?.count).toBe(28);
  });

  it("улучшенных существ нельзя нанять дважды в неделю сверх прироста", () => {
    const built = build(castle(["tavern", "fort", "militia-yard"]), "militia-yard-up");
    if (!built.ok) {
      throw new Error(built.message);
    }
    const tooMany = applyCommand(built.state, {
      type: "recruit",
      player: 0,
      townId: "o1",
      creature: "militia-vet",
      count: 15,
    });
    expect(tooMany.ok ? "" : tooMany.code).toBe("NOT_AVAILABLE");
  });
});
