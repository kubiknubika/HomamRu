// «Гипноз», «Берсерк», «Волшебное зеркало»: docs/mechanics/69-spells-control.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseBattleCommand } from "./ai.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { applyBattleCommand } from "./commands.ts";
import { castCode, conjure, mage, plainBattle } from "./castKit.ts";
import { commanderOf } from "./effects.ts";
import { commandingSide } from "./queries.ts";
import {
  act,
  army,
  code,
  CREATURES,
  stack,
  startBattle,
  strikes,
  turnOf,
  withStacks,
} from "./testkit.ts";
import type { BattleEvent, BattleState } from "./types.ts";

/** Бой как `plainBattle`, но нападающий герой знает школы на уровне `mastery`. */
function skilled(mastery: number, seed = 1): BattleState {
  const spells = ALL_SPELLS.map((item) => spellAtMastery(item, mastery));
  return startBattle(
    army(["militia:20", "slinger:10"], { hero: mage(2, 200, spells) }),
    army(["militia:20", "slinger:10"], { hero: mage(1, 100, ALL_SPELLS) }),
    { seed },
  ).state;
}

/** b1 — пять ополченцев (60 здоровья) в (6, 5), рядом b2 в (7, 5); a1 — в (5, 5). */
function close(state: BattleState): BattleState {
  return withStacks(state, {
    a1: { col: 5, row: 5 },
    b1: { col: 6, row: 5, count: 5 },
    b2: { col: 7, row: 5 },
  });
}

const has = (state: BattleState, id: string, spellId: string): boolean =>
  stack(state, id).effects.some((effect) => effect.spell === spellId);

function until(state: BattleState, round: number): { state: BattleState; events: BattleEvent[] } {
  let current = state;
  const events: BattleEvent[] = [];
  while (current.round < round && current.result === null) {
    const step = act(current, { type: "battleDefend" });
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

/** Герой стороны 0 колдует в клетку. */
function castAt(state: BattleState, id: string, col: number, row: number) {
  const ready = { ...state, sides: [{ ...state.sides[0], cast: false }, state.sides[1]] as const };
  const result = applyBattleCommand(ready, {
    type: "battleCast",
    side: 0,
    spell: id,
    cell: { col, row },
  });
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result;
}

const castOn = (events: readonly BattleEvent[]): string[] =>
  events.flatMap((event) => (event.type === "spellCast" ? [event.targetId] : []));

describe("«Гипноз»", () => {
  it("берёт отряд со здоровьем не больше 25 × сила магии + 10", () => {
    // Сила магии 2: порог 60. У ополченца 12 здоровья.
    const state = plainBattle();
    expect(castCode(state, 0, "hypnotize", "b1")).toBe("BAD_SPELL_TARGET");
    expect(castCode(withStacks(state, { b1: { count: 6 } }), 0, "hypnotize", "b1")).toBe(
      "BAD_SPELL_TARGET",
    );
    expect(castCode(withStacks(state, { b1: { count: 5 } }), 0, "hypnotize", "b1")).toBe("принята");
    expect([1, 2, 3].map((level) => spellAtMastery(spell("hypnotize"), level).value)).toEqual([
      10, 20, 50,
    ]);
  });

  it("отрядом командует колдовавший: бьёт прежних товарищей, своих новых — нет", () => {
    const state = turnOf(conjure(close(plainBattle()), 0, "hypnotize", "b1").state, "b1");
    expect(commandingSide(state)).toBe(0);
    expect(code(state, { type: "battleDefend", side: 1 })).toBe("NOT_YOUR_STACK");
    const from = { col: 6, row: 5 };
    expect(code(state, { type: "battleAttack", side: 0, target: "a1", from })).toBe(
      "TARGET_IS_ALLY",
    );
    const hit = act(state, { type: "battleAttack", target: "b2", from });
    expect(strikes(hit.events)[0]).toMatchObject({ attackerId: "b1", targetId: "b2" });
    // Отряды колдовавшего его не бьют; прежние товарищи — бьют.
    expect(
      code(turnOf(state, "a1"), {
        type: "battleAttack",
        side: 0,
        target: "b1",
        from: { col: 5, row: 5 },
      }),
    ).toBe("TARGET_IS_ALLY");
    expect(
      code(turnOf(state, "b2"), {
        type: "battleAttack",
        side: 1,
        target: "b1",
        from: { col: 7, row: 5 },
      }),
    ).toBe("принята");
  });

  it("срок — сила магии: потом отряд снова слушается хозяина", () => {
    const state = conjure(close(plainBattle()), 0, "hypnotize", "b1").state;
    const second = until(state, 2).state;
    expect(commanderOf(stack(second, "b1"))).toBe(0);
    const third = until(second, 3);
    expect(commanderOf(stack(third.state, "b1"))).toBe(1);
    expect(third.events).toContainEqual({
      type: "effectEnded",
      stackId: "b1",
      spell: "hypnotize",
      name: "Гипноз",
    });
  });

  it("заклинание «на всех» отряд под гипнозом пропускает", () => {
    const state = conjure(close(skilled(3)), 0, "hypnotize", "b1").state;
    expect(castOn(conjure(state, 0, "slow", "b2").events)).toEqual(["b2"]);
    expect(castOn(conjure(state, 0, "bless", "a1").events)).toEqual(["a1", "a2"]);
  });

  it("последний отряд врага под гипнозом — бой не кончен; компьютер ходит им как своим", () => {
    const start = startBattle(
      army(["militia:20"], { hero: mage(2, 100, ALL_SPELLS) }),
      army(["militia:5", "militia:5"]),
    ).state;
    const state = turnOf(conjure(start, 0, "hypnotize", "b1").state, "b1");
    expect(state.result).toBe(null);
    const quiet = { ...state, sides: [{ ...state.sides[0], cast: true }, state.sides[1]] as const };
    const command = chooseBattleCommand(quiet);
    expect(command?.side).toBe(0);
    expect(code(quiet, command ?? { type: "battleFlee", side: 0 })).toBe("принята");
  });

  it("«Берсерк» снимает гипноз", () => {
    const state = conjure(close(plainBattle()), 0, "hypnotize", "b1").state;
    const { state: after } = castAt(turnOf(state, "a1"), "berserk", 6, 5);
    expect(has(after, "b1", "hypnotize")).toBe(false);
  });
});

describe("«Берсерк»", () => {
  it("без навыка — одна клетка; отряд в свой ход сам бьёт ближайшего, хоть своего", () => {
    const { state, events } = castAt(turnOf(close(plainBattle()), "a1"), "berserk", 6, 5);
    expect(castOn(events)).toEqual(["b1"]);
    const round = until(state, 2);
    const index = round.events.findIndex((event) => event.type === "berserkTurn");
    // a1 и b2 от b1 на одном расстоянии: ближайший — тот, кто раньше в списке армий.
    expect(round.events[index]).toEqual({ type: "berserkTurn", stackId: "b1", targetId: "a1" });
    expect(round.events[index + 1]).toMatchObject({
      type: "strike",
      attackerId: "b1",
      targetId: "a1",
    });
    expect(round.events.some((event) => event.type === "stackTurn" && event.stackId === "b1")).toBe(
      false,
    );
    expect(has(round.state, "b1", "berserk")).toBe(false);
  });

  it("бьёт товарища, если он ближе", () => {
    const far = withStacks(close(plainBattle()), { a1: { col: 0, row: 5 } });
    const { state } = castAt(turnOf(far, "a1"), "berserk", 6, 5);
    const round = until(state, 2);
    expect(round.events).toContainEqual({ type: "berserkTurn", stackId: "b1", targetId: "b2" });
    expect(strikes(round.events)[0]).toMatchObject({ attackerId: "b1", targetId: "b2" });
  });

  it("на продвинутом уровне — клетка и соседние, на экспертном — два шага; свои тоже", () => {
    const wide = withStacks(close(skilled(2)), { a2: { col: 3, row: 5 } });
    expect(castOn(castAt(turnOf(wide, "a1"), "berserk", 6, 5).events)).toEqual(["a1", "b1", "b2"]);
    const wider = withStacks(close(skilled(3)), { a2: { col: 4, row: 5 } });
    expect(castOn(castAt(turnOf(wider, "a1"), "berserk", 6, 5).events)).toEqual([
      "a1",
      "a2",
      "b1",
      "b2",
    ]);
  });

  it("стрелок в берсерке стреляет в ближайшего; не дотянувшийся идёт к нему", () => {
    const apart = withStacks(plainBattle(), { b1: { col: 14, row: 0 }, b2: { col: 14, row: 10 } });
    const shot = until(castAt(turnOf(apart, "a1"), "berserk", 14, 10).state, 2);
    expect(shot.events).toContainEqual(
      expect.objectContaining({ type: "strike", kind: "shot", attackerId: "b2" }),
    );
    expect(stack(shot.state, "b2").shots).toBe(9);
    const walk = until(castAt(turnOf(apart, "a1"), "berserk", 14, 0).state, 2);
    expect(walk.events).toContainEqual(
      expect.objectContaining({ type: "stackMoved", stackId: "b1" }),
    );
    // Удара не было: берсерк проходит в начале следующего раунда.
    expect(has(walk.state, "b1", "berserk")).toBe(false);
  });

  it("накрыл отряд, чей был ход, — тот сразу действует сам", () => {
    const state = turnOf(close(plainBattle()), "a1");
    const { state: after, events } = castAt(state, "berserk", 5, 5);
    expect(events).toContainEqual({ type: "berserkTurn", stackId: "a1", targetId: "b1" });
    expect(after.activeStack).not.toBe("a1");
    expect(stack(after, "a1").turn).toBe("done");
  });
});

/** Колдует «Проклятие» на b1 под зеркалом при разных жребиях. */
function outcomes(): { reflected: BattleEvent[][]; passed: BattleEvent[][] } {
  const reflected: BattleEvent[][] = [];
  const passed: BattleEvent[][] = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    const mirrored = conjure(skilled(0, seed), 1, "magic-mirror", "b1").state;
    const events = [...conjure(mirrored, 0, "curse", "b1").events];
    (events.some((event) => event.type === "spellReflected") ? reflected : passed).push(events);
  }
  return { reflected, passed };
}

describe("«Волшебное зеркало»", () => {
  it("отражает с шансом 20 %: заклинание ложится на отряд колдовавшего", () => {
    const { reflected, passed } = outcomes();
    // 60 жребиев по 20 %: в среднем 12.
    expect(reflected.length).toBeGreaterThan(4);
    expect(reflected.length).toBeLessThan(22);
    for (const events of reflected) {
      expect(events[0]).toMatchObject({ type: "spellReflected", stackId: "b1", spell: "curse" });
      expect(["a1", "a2"]).toContain(castOn(events)[0]);
      expect(castOn(events)).toHaveLength(1);
    }
    for (const events of passed) {
      expect(castOn(events)).toEqual(["b1"]);
    }
  });

  it("отражённое заклинание — вредное: его снимет «Лечение»", () => {
    const marks: boolean[] = [];
    for (let seed = 1; seed <= 60; seed += 1) {
      const mirrored = conjure(skilled(0, seed), 1, "magic-mirror", "b1").state;
      const cursed = conjure(mirrored, 0, "curse", "b1");
      if (cursed.events.some((event) => event.type === "spellReflected")) {
        const to = castOn(cursed.events)[0] ?? "";
        marks.push(...stack(cursed.state, to).effects.map((effect) => effect.negative));
      }
    }
    expect(marks.length).toBeGreaterThan(0);
    expect(marks).not.toContain(false);
  });

  it("без зеркала жребий не бросается; свои заклинания и площадь зеркало не трогает", () => {
    const state = close(plainBattle());
    expect(conjure(state, 0, "curse", "b1").state.rng).toEqual(state.rng);
    const mirrored = conjure(state, 1, "magic-mirror", "b1").state;
    expect(conjure(mirrored, 1, "bless", "b1").state.rng).toEqual(mirrored.rng);
    const ball = castAt(turnOf(mirrored, "a1"), "fireball", 6, 5);
    expect(ball.state.rng).toEqual(mirrored.rng);
    expect(castOn(ball.events)).toContain("b1");
  });
});

describe("автобой с полной книгой", () => {
  it("48 заклинаний; бои заканчиваются без нарушений", () => {
    expect(ALL_SPELLS).toHaveLength(48);
    // 155, 395 — компьютер ходит отрядом под гипнозом; 425, 930 — отряд в берсерке бьёт внутри чужой команды.
    const seeds = [...Array.from({ length: 40 }, (_, index) => index + 1), 155, 395, 425, 930];
    for (const seed of seeds) {
      const run = runAutoBattle(randomBattle(seed, CREATURES, ALL_SPELLS), CREATURES, seed);
      expect(run.problems).toEqual([]);
    }
  });
});
