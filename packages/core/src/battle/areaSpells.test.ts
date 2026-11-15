// Урон по площади: docs/mechanics/68-spells-area.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseCast } from "./aiSpells.ts";
import { areaCells } from "./area.ts";
import { conjure, mage, plainBattle } from "./castKit.ts";
import { battleProblems } from "./invariants.ts";
import { act, army, code, stack, startBattle, withStacks } from "./testkit.ts";
import type { BattleEvent, BattleState } from "./types.ts";

/**
 * Ополченцы вплотную посреди поля: a1 в (5, 5), b1 в (6, 5); пращник b2 — в двух шагах от b1,
 * в (8, 5); пращник a2 остался у края. Сила магии 2, первым ходит a2.
 */
function field(spellPower = 2): BattleState {
  return withStacks(plainBattle(spellPower), {
    a1: { col: 5, row: 5 },
    b1: { col: 6, row: 5 },
    b2: { col: 8, row: 5 },
  });
}

/** Кого задело и на сколько: `["a1", 35]`. */
function hits(events: readonly BattleEvent[]): (readonly [string, number])[] {
  return events.flatMap((event) =>
    event.type === "spellCast" && event.outcome.kind === "damage"
      ? [[event.targetId, event.outcome.damage] as const]
      : [],
  );
}

const AT_B1 = { col: 6, row: 5 };

const count = (id: string): number => areaCells(spell(id), AT_B1).length;

function book(...ids: readonly string[]) {
  return { ...mage(2), spells: ids.map((id) => spellAtMastery(spell(id), 0)) };
}

/** Нападает герой с одним заклинанием. */
function duel(id: string, mine: readonly string[], theirs: readonly string[]): BattleState {
  return startBattle(army(mine, { hero: book(id) }), army(theirs)).state;
}

describe("площадь", () => {
  it("клеток: шар и метеоритный дождь — 7, кольцо — 6, инферно — 19", () => {
    expect(["fireball", "meteor-shower", "frost-ring", "inferno"].map(count)).toEqual([
      7, 7, 6, 19,
    ]);
    // У края поля клеток меньше.
    expect(areaCells(spell("fireball"), { col: 0, row: 0 })).toHaveLength(4);
  });

  it("«Огненный шар»: клетка и соседние, своим тот же урон", () => {
    const result = act(field(), { type: "battleCast", spell: "fireball", cell: AT_B1 });
    expect(hits(result.events)).toEqual([
      ["a1", 35],
      ["b1", 35],
    ]);
    expect(stack(result.state, "a1").count).toBe(18);
    expect(result.state.sides[0]).toMatchObject({ cast: true, hero: { mana: 85 } });
  });

  it("«Кольцо холода» саму клетку не задевает", () => {
    const result = act(field(), { type: "battleCast", spell: "frost-ring", cell: AT_B1 });
    expect(hits(result.events)).toEqual([["a1", 35]]);
  });

  it("«Инферно» достаёт на два шага, «Метеоритный дождь» — на один", () => {
    const inferno = act(field(), { type: "battleCast", spell: "inferno", cell: AT_B1 });
    expect(hits(inferno.events)).toEqual([
      ["a1", 40],
      ["b1", 40],
      ["b2", 40],
    ]);
    const meteors = act(field(), { type: "battleCast", spell: "meteor-shower", cell: AT_B1 });
    expect(hits(meteors.events)).toEqual([
      ["a1", 75],
      ["b1", 75],
    ]);
  });

  it("впустую: мана потрачена, событие одно", () => {
    const result = act(field(), {
      type: "battleCast",
      spell: "fireball",
      cell: { col: 7, row: 0 },
    });
    expect(result.events).toEqual([
      { type: "spellMissed", side: 0, spell: "fireball", name: "Огненный шар", manaLeft: 85 },
    ]);
    expect(result.state.sides[0].cast).toBe(true);
  });

  it("защита от школы — у кого она есть", () => {
    const guarded = conjure(field(), 1, "protection-from-fire", "b1").state;
    const result = act(guarded, { type: "battleCast", spell: "fireball", cell: AT_B1 });
    expect(hits(result.events)).toEqual([
      ["a1", 35],
      ["b1", 24],
    ]);
  });

  it("отказы: нет клетки, клетка за полем", () => {
    const state = field();
    expect(code(state, { type: "battleCast", side: 0, spell: "fireball", target: "b1" })).toBe(
      "BAD_SPELL_CELL",
    );
    const outside = { col: 15, row: 5 };
    expect(code(state, { type: "battleCast", side: 0, spell: "inferno", cell: outside })).toBe(
      "BAD_SPELL_CELL",
    );
  });
});

describe("«Цепная молния»", () => {
  it("каждому следующему вдвое меньше; перескакивает на ближайшего, и на своего", () => {
    const result = act(field(), { type: "battleCast", spell: "chain-lightning", target: "b1" });
    expect(hits(result.events)).toEqual([
      ["b1", 105],
      ["a1", 52],
      ["b2", 26],
      ["a2", 13],
    ]);
  });

  it("длина цепи: 4 без навыка и на базовом, 5 на продвинутом и экспертном", () => {
    const lengths = [0, 1, 2, 3].map(
      (mastery) => spellAtMastery(spell("chain-lightning"), mastery).chainLength,
    );
    expect(lengths).toEqual([4, 4, 5, 5]);
  });

  it("отрядов меньше длины — цепь короче; ни один не задет дважды", () => {
    const { state } = startBattle(
      army(["militia:20"], { hero: book("chain-lightning") }),
      army(["militia:20"]),
    );
    const result = act(state, { type: "battleCast", spell: "chain-lightning", target: "b1" });
    expect(hits(result.events).map(([id]) => id)).toEqual(["b1", "a1"]);
  });

  it("отказы: свой отряд первой целью, нет цели", () => {
    const state = field();
    const cast = { type: "battleCast", side: 0, spell: "chain-lightning" } as const;
    expect(code(state, { ...cast, target: "a1" })).toBe("BAD_SPELL_TARGET");
    expect(code(state, cast)).toBe("UNKNOWN_TARGET");
  });
});

describe("«Армагеддон»", () => {
  it("урон всем отрядам обеих сторон, цель не нужна", () => {
    const result = act(field(), { type: "battleCast", spell: "armageddon" });
    expect(hits(result.events)).toEqual([
      ["a1", 130],
      ["a2", 130],
      ["b1", 130],
      ["b2", 130],
    ]);
    // Пращники (90 здоровья) погибли у обеих сторон, ополченцы (240) остались: бой идёт.
    expect(["a2", "b2"].map((id) => stack(result.state, id).count)).toEqual([0, 0]);
    expect(result.state.result).toBeNull();
  });

  it("обе армии погибли: победителя нет, проверки состояния молчат", () => {
    const { state } = startBattle(
      army(["militia:5"], { hero: book("armageddon") }),
      army(["militia:5"]),
    );
    const result = act(state, { type: "battleCast", spell: "armageddon" });
    expect(result.state.result).toMatchObject({ winner: 1, reason: "bothDestroyed" });
    expect(result.state.stacks.every((item) => item.count === 0)).toBe(true);
    expect(battleProblems(result.state)).toEqual([]);
    expect(result.events.at(-1)).toMatchObject({ type: "battleEnded" });
  });
});

describe("заклинание убило отряд, чей был ход", () => {
  it("ход переходит к следующему отряду", () => {
    // Ходит единственный сокол; «Армагеддон» убивает его, ополченцы остаются.
    const { state } = startBattle(
      army(["falcon:1", "militia:20"], { hero: book("armageddon") }),
      army(["militia:20"]),
    );
    expect(state.activeStack).toBe("a1");
    const result = act(state, { type: "battleCast", spell: "armageddon" });
    expect(stack(result.state, "a1").count).toBe(0);
    expect(result.state.result).toBeNull();
    expect(result.state.activeStack).not.toBe("a1");
    expect(battleProblems(result.state)).toEqual([]);
  });
});

describe("компьютер", () => {
  it("шар кладёт туда, где заденет больше чужих и не заденет своих", () => {
    const state = withStacks(duel("fireball", ["militia:20"], ["militia:20", "militia:20"]), {
      a1: { col: 5, row: 5 },
      b1: { col: 6, row: 5 },
      b2: { col: 7, row: 5 },
    });
    // Клетка (6, 4) и соседние: оба чужих внутри, свой в (5, 5) — снаружи; номер клетки наименьший.
    expect(chooseCast(state, 0)).toEqual({
      type: "battleCast",
      side: 0,
      spell: "fireball",
      cell: { col: 6, row: 4 },
    });
  });

  it("«Армагеддон»: колдует, когда чужим хуже, и не колдует, когда хуже своим", () => {
    expect(chooseCast(duel("armageddon", ["militia:1"], ["militia:20"]), 0)).toEqual({
      type: "battleCast",
      side: 0,
      spell: "armageddon",
    });
    expect(chooseCast(duel("armageddon", ["militia:20"], ["militia:1"]), 0)).toBeUndefined();
  });

  it("в книге 45 заклинаний", () => {
    expect(ALL_SPELLS).toHaveLength(45);
  });
});
