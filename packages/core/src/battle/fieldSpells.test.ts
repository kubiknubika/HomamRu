// Заклинания поля боя: docs/mechanics/70-spells-field.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseCast } from "./aiSpells.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { applyBattleCommand } from "./commands.ts";
import { mage } from "./castKit.ts";
import { forceFieldCells } from "./fieldCells.ts";
import { reachableCells } from "./queries.ts";
import { cellIndex } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { WALL_PARTS } from "./siege.ts";
import { act, army, CREATURES, stack, startBattle, turnOf, withStacks } from "./testkit.ts";
import type { BattleDefinition, BattleEvent, BattleState } from "./types.ts";

/** Бой: герой нападающего знает всю книгу на уровне `mastery`; первым ходит a1. */
function battle(mastery = 0, options: Parameters<typeof startBattle>[2] = {}): BattleState {
  const spells = ALL_SPELLS.map((item) => spellAtMastery(item, mastery));
  const { state } = startBattle(
    army(["militia:20", "slinger:10"], { hero: mage(2, 200, spells) }),
    army(["militia:20", "slinger:10"], { hero: mage(1, 100, spells) }),
    options,
  );
  return turnOf(state, "a1");
}

type Aim = { readonly target?: string; readonly cell?: Cell };

/** Герой нападающего колдует; правило «раз в раунд» снято. */
function cast(state: BattleState, id: string, aim: Aim = {}) {
  const ready = { ...state, sides: [{ ...state.sides[0], cast: false }, state.sides[1]] as const };
  return applyBattleCommand(ready, { type: "battleCast", side: 0, spell: id, ...aim });
}

function done(state: BattleState, id: string, aim: Aim = {}) {
  const result = cast(state, id, aim);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result;
}

const codeOf = (state: BattleState, id: string, aim: Aim = {}): string => {
  const result = cast(state, id, aim);
  return result.ok ? "принята" : result.code;
};

function siegeOf(fortification: NonNullable<BattleDefinition["siege"]>["fortification"]) {
  return { siege: { fortification, buildings: 0 } };
}

function wallHealth(state: BattleState): number {
  return WALL_PARTS.reduce((sum, part) => sum + (state.siege?.health[part] ?? 0), 0);
}

function nextRound(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  let current = state;
  const events: BattleEvent[] = [];
  while (current.round === state.round) {
    const step = act(current, { type: "battleDefend" });
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

describe("«Силовое поле»", () => {
  it("форма: клетка и клетка выше — у нападающего правее, у обороняющегося левее; с навыком три", () => {
    // Чётные ряды сдвинуты вправо.
    expect(forceFieldCells(0, { col: 5, row: 4 }, 2)).toEqual([
      { col: 5, row: 4 },
      { col: 6, row: 3 },
    ]);
    expect(forceFieldCells(1, { col: 5, row: 4 }, 2)).toEqual([
      { col: 5, row: 4 },
      { col: 5, row: 3 },
    ]);
    expect(forceFieldCells(0, { col: 5, row: 4 }, 3)).toEqual([
      { col: 5, row: 4 },
      { col: 6, row: 3 },
      { col: 5, row: 2 },
    ]);
    expect([0, 1, 2, 3].map((level) => spellAtMastery(spell("force-field"), level).value)).toEqual([
      2, 2, 3, 3,
    ]);
  });

  it("на клетки поля нельзя встать; мана потрачена, событие — о постройке", () => {
    const start = withStacks(battle(), { a1: { col: 4, row: 4 } });
    expect(reachableCells(start, stack(start, "a1")).has(cellIndex({ col: 5, row: 4 }))).toBe(true);
    const { state, events } = done(start, "force-field", { cell: { col: 5, row: 4 } });
    expect(state.sides[0].hero?.mana).toBe(188);
    expect(events.map((event) => event.type)).toEqual(["fieldCast", "fieldPlaced"]);
    expect(state.fields).toEqual([
      {
        kind: "forceField",
        cells: [
          { col: 5, row: 4 },
          { col: 6, row: 3 },
        ],
        side: 0,
        rounds: 2,
      },
    ]);
    const reach = reachableCells(state, stack(state, "a1"));
    expect(reach.has(cellIndex({ col: 5, row: 4 }))).toBe(false);
    expect(reach.has(cellIndex({ col: 6, row: 3 }))).toBe(false);
    expect(reach.has(cellIndex({ col: 5, row: 5 }))).toBe(true);
  });

  it("стоит два раунда: тот, в котором наколдовано, и следующий", () => {
    const { state } = done(battle(), "force-field", { cell: { col: 5, row: 4 } });
    const second = nextRound(state);
    expect(second.state.fields.map((field) => field.rounds)).toEqual([1]);
    const third = nextRound(second.state);
    expect(third.state.fields).toEqual([]);
    expect(third.events).toContainEqual(
      expect.objectContaining({ type: "fieldRemoved", reason: "expired" }),
    );
  });

  it("отказ: клетка занята отрядом, препятствием, другим полем или за краем", () => {
    const start = battle(0, { obstacles: [{ col: 6, row: 3 }] });
    expect(codeOf(start, "force-field", { cell: { col: 0, row: 0 } })).toBe("BAD_SPELL_CELL");
    expect(codeOf(start, "force-field", { cell: { col: 5, row: 4 } })).toBe("BAD_SPELL_CELL");
    expect(codeOf(start, "force-field", { cell: { col: 5, row: 0 } })).toBe("BAD_SPELL_CELL");
    expect(codeOf(start, "force-field")).toBe("BAD_SPELL_CELL");
    const { state } = done(start, "force-field", { cell: { col: 8, row: 4 } });
    expect(codeOf(state, "force-field", { cell: { col: 8, row: 5 } })).toBe("BAD_SPELL_CELL");
    // Отказ ничего не тратит.
    expect(state.sides[0].hero?.mana).toBe(188);
  });
});

describe("«Убрать препятствие»", () => {
  const rock = { col: 6, row: 3 };

  it("убирает препятствие: клетка свободна", () => {
    const start = battle(0, { obstacles: [rock, { col: 7, row: 7 }] });
    expect(codeOf(start, "remove-obstacle", { cell: { col: 5, row: 5 } })).toBe("BAD_SPELL_CELL");
    const { state, events } = done(start, "remove-obstacle", { cell: rock });
    expect(state.obstacles).toEqual([{ col: 7, row: 7 }]);
    expect(events).toContainEqual({ type: "obstacleRemoved", cell: rock });
  });

  it("силовое поле убирает только на экспертном уровне, целиком", () => {
    const field = { cell: { col: 5, row: 4 } };
    const basic = done(battle(2), "force-field", field).state;
    expect(codeOf(basic, "remove-obstacle", { cell: { col: 6, row: 3 } })).toBe("BAD_SPELL_CELL");
    const expert = done(battle(3), "force-field", field).state;
    const { state, events } = done(expert, "remove-obstacle", { cell: { col: 6, row: 3 } });
    expect(state.fields).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "fieldRemoved", reason: "removed" }),
    );
  });
});

describe("«Землетрясение»", () => {
  it("в поле — отказ", () => {
    expect(codeOf(battle(), "earthquake")).toBe("NOT_A_SIEGE");
  });

  it.each([
    [0, 2],
    [2, 3],
    [3, 4],
  ])("уровень школы %i: прочность укреплений меньше ровно на %i", (mastery, hits) => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const start = battle(mastery, { ...siegeOf("castle"), seed });
      const { state, events } = done(start, "earthquake");
      expect(wallHealth(start) - wallHealth(state)).toBe(hits);
      expect(events.filter((event) => event.type === "wallShaken")).toHaveLength(hits);
    }
  });

  it("бьёт только по тому, что стоит: в форте башен нет", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { events } = done(battle(3, { ...siegeOf("fort"), seed }), "earthquake");
      for (const event of events) {
        expect(event.type === "wallShaken" ? event.part : "wall1").toMatch(/^(wall\d|gate)$/);
      }
    }
  });
});

describe("«Телепорт»", () => {
  it("переносит свой отряд в свободную клетку; ход отряда остаётся при нём", () => {
    const start = battle();
    const to = { col: 12, row: 5 };
    const { state, events } = done(start, "teleport", { target: "a1", cell: to });
    expect(stack(state, "a1")).toMatchObject(to);
    expect(state.activeStack).toBe("a1");
    expect(events.map((event) => event.type)).toEqual(["fieldCast", "stackTeleported"]);
  });

  it("отказы: чужой отряд, занятая клетка, нет клетки", () => {
    const start = battle();
    const b1 = stack(start, "b1");
    expect(codeOf(start, "teleport", { target: "b1", cell: { col: 7, row: 5 } })).toBe(
      "BAD_SPELL_TARGET",
    );
    expect(codeOf(start, "teleport", { target: "a1", cell: { col: b1.col, row: b1.row } })).toBe(
      "BAD_SPELL_CELL",
    );
    expect(codeOf(start, "teleport", { target: "a1" })).toBe("BAD_SPELL_CELL");
    expect(codeOf(start, "teleport", { cell: { col: 7, row: 5 } })).toBe("UNKNOWN_TARGET");
    const walled = done(start, "force-field", { cell: { col: 7, row: 5 } }).state;
    expect(codeOf(walled, "teleport", { target: "a1", cell: { col: 7, row: 5 } })).toBe(
      "BAD_SPELL_CELL",
    );
  });

  it("в осаде: без навыка — по свою сторону и не в ров; продвинутый — в ров; экспертный — за стену", () => {
    const inside = { col: 13, row: 1 };
    // Ров — клетка перед стеной: в ряду 1 стена в столбце 11.
    const moat = { col: 10, row: 1 };
    const outside = { col: 5, row: 1 };
    const codes = (mastery: number): string[] => {
      const start = battle(mastery, siegeOf("castle"));
      return [outside, moat, inside].map((cell) =>
        codeOf(start, "teleport", { target: "a1", cell }),
      );
    };
    expect(codes(0)).toEqual(["принята", "BAD_SPELL_CELL", "BAD_SPELL_CELL"]);
    expect(codes(2)).toEqual(["принята", "принята", "BAD_SPELL_CELL"]);
    expect(codes(3)).toEqual(["принята", "принята", "принята"]);
  });

  it("перенесённый в ров получает урон рва", () => {
    const start = battle(2, siegeOf("castle"));
    const { events } = done(start, "teleport", { target: "a1", cell: { col: 10, row: 1 } });
    expect(events).toContainEqual(expect.objectContaining({ type: "moatDamage", stackId: "a1" }));
  });
});

/** Герой, знающий одно заклинание. */
function only(id: string) {
  return mage(2, 100, [spell(id)]);
}

describe("компьютер", () => {
  it("«Землетрясение» колдует, нападая в осаде с пешими; обороняясь — нет", () => {
    const attacker = startBattle(
      army(["militia:20"], { hero: only("earthquake") }),
      army(["militia:20"], { hero: only("earthquake") }),
      siegeOf("castle"),
    ).state;
    expect(chooseCast(attacker, 0)).toMatchObject({ spell: "earthquake" });
    expect(chooseCast(attacker, 1)).toBe(undefined);
    const field = startBattle(
      army(["militia:20"], { hero: only("earthquake") }),
      army(["militia:20"]),
    );
    expect(chooseCast(field.state, 0)).toBe(undefined);
  });

  it("«Телепорт» — отряд ближнего боя к вражескому стрелку; команду ядро принимает", () => {
    const start = startBattle(
      army(["militia:20"], { hero: only("teleport") }),
      army(["slinger:10"]),
    );
    const state = turnOf(start.state, "a1");
    const command = chooseCast(state, 0);
    expect(command).toMatchObject({ spell: "teleport", target: "a1" });
    expect(applyBattleCommand(state, command ?? { type: "battleFlee", side: 0 }).ok).toBe(true);
  });

  it("«Силовое поле» и «Убрать препятствие» не колдует", () => {
    const { state } = startBattle(
      army(["militia:20"], {
        hero: mage(2, 100, [spell("force-field"), spell("remove-obstacle")]),
      }),
      army(["slinger:10"]),
      { obstacles: [{ col: 6, row: 3 }] },
    );
    expect(chooseCast(state, 0)).toBe(undefined);
  });
});

describe("автобой с полной книгой", () => {
  it("48 заклинаний; бои заканчиваются без нарушений", () => {
    expect(ALL_SPELLS).toHaveLength(48);
    for (let seed = 1; seed <= 40; seed += 1) {
      const run = runAutoBattle(randomBattle(seed, CREATURES, ALL_SPELLS), CREATURES, seed);
      expect(run.problems).toEqual([]);
    }
  });
});
