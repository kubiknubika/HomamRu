// Заклинания жизни: «Воскрешение», «Клон», «Жертва». docs/mechanics/71-spells-life.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { chooseBattleCommand } from "./ai.ts";
import { chooseCast } from "./aiSpells.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { mage } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { act, army, CREATURES, stack, startBattle, turnOf, withStacks } from "./testkit.ts";
import { battle, cast, typesOf } from "./trapKit.ts";
import type { BattleState } from "./types.ts";

/** Бой 30 ополченцев и 10 пращников против 30 ополченцев; сила магии 2; ходит a1. */
function field(mastery = 0): BattleState {
  return battle(mastery, [
    ["militia:30", "slinger:10"],
    ["militia:30", "slinger:10"],
  ]);
}

type Aim = { readonly target?: string; readonly victim?: string };

function code(state: BattleState, id: string, aim: Aim): string {
  const result = applyBattleCommand(state, { type: "battleCast", side: 0, spell: id, ...aim });
  return result.ok ? "принята" : result.code;
}

describe("«Воскрешение»", () => {
  it("долечивает раненого и поднимает погибших: 50 × сила + 40", () => {
    // 18 из 30, у первого 4 здоровья из 12; 140 здоровья: 8 на раненого, 132 — ровно 11 существ.
    const start = withStacks(field(), { a1: { count: 18, firstHealth: 4 } });
    const { state, events } = cast(start, "resurrection", { target: "a1" });
    expect(stack(state, "a1")).toMatchObject({ count: 29, firstHealth: 12, raised: 11 });
    expect(typesOf(events)).toEqual(["fieldCast", "stackRaised"]);
    expect(events[1]).toMatchObject({ raised: 11, healed: 140, lasting: false, left: 29 });
    expect(state.sides[0].hero?.mana).toBe(180);
  });

  it("больше, чем было в начале боя, не станет", () => {
    const start = withStacks(field(3), { a1: { count: 28, firstHealth: 12 } });
    const { state } = cast(start, "resurrection", { target: "a1" });
    expect(stack(state, "a1")).toMatchObject({ count: 30, firstHealth: 12 });
  });

  it("без навыка и на базовом — до конца боя, с продвинутого — насовсем", () => {
    const lasting = [0, 1, 2, 3].map((mastery) => {
      const start = withStacks(field(mastery), { a1: { count: 18, firstHealth: 12 } });
      return stack(cast(start, "resurrection", { target: "a1" }).state, "a1").raised ?? 0;
    });
    // 140 здоровья — 11 целых существ и двенадцатое раненым, все на время; 180 и 260 — насовсем.
    expect(lasting).toEqual([12, 12, 0, 0]);
  });

  it("поднятые на время гибнут первыми и после боя идут в потери", () => {
    const start = withStacks(field(), { a1: { count: 18, firstHealth: 12 } });
    const raised = cast(start, "resurrection", { target: "a1" }).state;
    expect(stack(raised, "a1")).toMatchObject({ count: 30, raised: 12 });
    // «Волшебная стрела» врага: 10 × 2 + 10 = 30 урона — двое погибли, оба из поднятых.
    const hurt = cast(turnOf(raised, "b1"), "magic-arrow", { target: "a1" }, 1).state;
    expect(stack(hurt, "a1")).toMatchObject({ count: 28, raised: 10 });
    const fled = act(hurt, { type: "battleFlee" });
    const losses = fled.state.result?.losses.find((item) => item.stackId === "a1");
    expect(losses?.lost).toBe(12);
  });

  it("отказ: нечего поднимать, хватает только долечить, чужой отряд", () => {
    const start = field();
    expect(code(start, "resurrection", { target: "a1" })).toBe("BAD_SPELL_TARGET");
    expect(code(start, "resurrection", { target: "b1" })).toBe("BAD_SPELL_TARGET");
    expect(code(start, "resurrection", { target: "zz" })).toBe("UNKNOWN_TARGET");
    const wounded = withStacks(start, { a1: { firstHealth: 3 } });
    expect(code(wounded, "resurrection", { target: "a1" })).toBe("BAD_SPELL_TARGET");
  });

  it("погибший целиком встаёт в своей клетке; клетка занята — отказ", () => {
    const dead = withStacks(field(), { a2: { count: 0, firstHealth: 0 } });
    const { state } = cast(dead, "resurrection", { target: "a2" });
    // 140 здоровья, у пращника 9: 15 с лишним, но было 10.
    expect(stack(state, "a2")).toMatchObject({ count: 10, firstHealth: 9, raised: 10 });
    const corpse = stack(dead, "a2");
    const covered = withStacks(dead, { a1: { col: corpse.col, row: corpse.row } });
    expect(code(covered, "resurrection", { target: "a2" })).toBe("BAD_SPELL_TARGET");
  });

  it("поднятый из погибших ходит в этом раунде, если ещё не ходил", () => {
    const dead = withStacks(field(), { a2: { count: 0, firstHealth: 0, turn: "ready" } });
    const raised = cast(dead, "resurrection", { target: "a2" }).state;
    let state = raised;
    const turns: string[] = [];
    while (state.round === raised.round && state.result === null) {
      turns.push(state.activeStack ?? "");
      state = act(state, { type: "battleDefend" }).state;
    }
    expect(turns).toContain("a2");
    const acted = withStacks(field(), { a2: { count: 0, firstHealth: 0, turn: "done" } });
    let later = cast(acted, "resurrection", { target: "a2" }).state;
    const next: string[] = [];
    while (later.round === 1 && later.result === null) {
      next.push(later.activeStack ?? "");
      later = act(later, { type: "battleDefend" }).state;
    }
    expect(next).not.toContain("a2");
  });

  it("в армии победителя одни поднятые на время — одно существо остаётся", () => {
    const start = withStacks(battle(0, [["militia:30"], ["militia:1"]]), {
      a1: { count: 5, raised: 5 },
    });
    // Враг бежит: у победителя пятеро, все поднятые на время.
    const won = act(turnOf(start, "b1"), { type: "battleFlee" });
    expect(won.state.result?.winner).toBe(0);
    expect(won.state.result?.losses.find((item) => item.stackId === "a1")?.lost).toBe(29);
  });
});

/** Можно ли клонировать существо уровня `level` при уровне школы `mastery`. */
function high(level: number): (mastery: number) => string {
  return (mastery) => {
    const start = field(mastery);
    const stacks = start.stacks.map((item) =>
      item.id === "a1" ? { ...item, creature: { ...item.creature, level } } : item,
    );
    return code({ ...start, stacks }, "clone", { target: "a1" });
  };
}

describe("«Клон»", () => {
  it("рядом встаёт копия: то же существо, столько же, срок — сила магии", () => {
    const start = withStacks(field(), { a1: { count: 17, firstHealth: 5 } });
    const { state, events } = cast(start, "clone", { target: "a1" });
    const clone = stack(state, "a1c");
    expect(clone).toMatchObject({
      count: 17,
      initialCount: 17,
      firstHealth: 12,
      cloneOf: "a1",
      side: 0,
    });
    expect(clone.effects.map((effect) => [effect.effect, effect.rounds])).toEqual([["clone", 2]]);
    expect(typesOf(events)).toEqual(["fieldCast", "cloneCreated"]);
    const original = stack(state, "a1");
    expect(
      Math.abs(clone.col - original.col) + Math.abs(clone.row - original.row),
    ).toBeLessThanOrEqual(2);
  });

  it("нельзя: клон клона, второй клон, чужой отряд", () => {
    const { state } = cast(field(), "clone", { target: "a1" });
    const again = {
      ...state,
      sides: [{ ...state.sides[0], cast: false }, state.sides[1]] as const,
    };
    expect(code(again, "clone", { target: "a1" })).toBe("BAD_SPELL_TARGET");
    expect(code(again, "clone", { target: "a1c" })).toBe("BAD_SPELL_TARGET");
    expect(code(again, "clone", { target: "b1" })).toBe("BAD_SPELL_TARGET");
    expect(code(again, "clone", { target: "a2" })).toBe("принята");
  });

  it("уровень существа: без навыка — до 5, на продвинутом — до 6, на экспертном — любой", () => {
    expect([0, 1, 2, 3].map(high(5))).toEqual(["принята", "принята", "принята", "принята"]);
    expect([0, 1, 2, 3].map(high(6))).toEqual([
      "BAD_SPELL_TARGET",
      "BAD_SPELL_TARGET",
      "принята",
      "принята",
    ]);
    expect([0, 1, 2, 3].map(high(7))).toEqual([
      "BAD_SPELL_TARGET",
      "BAD_SPELL_TARGET",
      "BAD_SPELL_TARGET",
      "принята",
    ]);
  });

  it("любой урон уничтожает клон целиком", () => {
    const { state } = cast(field(), "clone", { target: "a1" });
    const { state: after, events } = cast(turnOf(state, "b1"), "magic-arrow", { target: "a1c" }, 1);
    expect(stack(after, "a1c").count).toBe(0);
    expect(events).toContainEqual({ type: "stackDied", stackId: "a1c" });
  });

  it("клон ходит в этом же раунде и исчезает, когда выходит срок", () => {
    const created = cast(field(), "clone", { target: "a1" }).state;
    let state = created;
    const turns: string[] = [];
    const gone: number[] = [];
    while (state.round <= 3 && state.result === null) {
      turns.push(`${state.round}:${state.activeStack ?? ""}`);
      const step = act(state, { type: "battleDefend" });
      if (step.events.some((event) => event.type === "cloneGone")) {
        gone.push(step.state.round);
      }
      state = step.state;
    }
    expect(turns).toContain("1:a1c");
    expect(turns).toContain("2:a1c");
    // Сила магии 2: клон живёт раунды 1 и 2, в начале третьего исчезает.
    expect(gone).toEqual([3]);
    expect(turns).not.toContain("3:a1c");
  });

  it("«Снять заклинания» по клону убирает его", () => {
    const { state } = cast(field(3), "clone", { target: "a1" });
    const { state: after, events } = cast(state, "dispel", { target: "a1c" });
    expect(stack(after, "a1c").count).toBe(0);
    expect(events).toContainEqual({ type: "cloneGone", stackId: "a1c", reason: "dispelled" });
  });

  it("клон — не армия: уцелели одни клоны — победителя нет; в итогах клонов нет", () => {
    const start = battle(0, [["militia:30"], ["militia:30"]]);
    const cloned = cast(start, "clone", { target: "a1" }).state;
    // Настоящий отряд гибнет: бой идёт, пока жив клон.
    const alone = withStacks(cloned, { a1: { count: 0, firstHealth: 0 } });
    const going = act({ ...alone, activeStack: "a1c" }, { type: "battleDefend" });
    expect(going.state.result).toBe(null);
    // Гибнет и враг: остался один клон — победителя нет.
    const empty = withStacks(alone, { b1: { count: 1, firstHealth: 1 } });
    const b1 = stack(empty, "b1");
    const near = withStacks(
      { ...empty, activeStack: "a1c" },
      { a1c: { col: b1.col - 1, row: b1.row } },
    );
    const end = act(near, {
      type: "battleAttack",
      target: "b1",
      from: { col: b1.col - 1, row: b1.row },
    });
    expect(end.state.result?.reason).toBe("bothDestroyed");
    expect(end.state.result?.losses.map((item) => item.stackId)).toEqual(["a1", "b1"]);
  });
});

describe("«Жертва»", () => {
  it("отданный гибнет; поднятый получает (сила + здоровье + прибавка) × число, насовсем", () => {
    // 10 пращников со здоровьем 9: (2 + 9 + 3) × 10 = 140 — 11 ополченцев и 8 здоровья.
    const start = withStacks(field(), { a1: { count: 10, firstHealth: 12 } });
    const { state, events } = cast(start, "sacrifice", { target: "a1", victim: "a2" });
    expect(stack(state, "a2").count).toBe(0);
    expect(stack(state, "a1")).toMatchObject({ count: 22, firstHealth: 8 });
    expect(stack(state, "a1").raised ?? 0).toBe(0);
    expect(typesOf(events).slice(0, 4)).toEqual([
      "fieldCast",
      "stackSacrificed",
      "stackDied",
      "stackRaised",
    ]);
  });

  it("хватит и раненого; отдан отряд, чей ход, — ход переходит дальше", () => {
    const start = withStacks(field(), { a2: { firstHealth: 2 } });
    const { state } = cast(start, "sacrifice", { target: "a2", victim: "a1" });
    expect(stack(state, "a2").firstHealth).toBe(9);
    expect(state.activeStack).not.toBe("a1");
    expect(state.result).toBe(null);
  });

  it("отказы: тот же отряд, чужой, клон, нет жертвы, целый отряд", () => {
    const start = withStacks(field(), { a1: { count: 10, firstHealth: 12 } });
    expect(code(start, "sacrifice", { target: "a1", victim: "a1" })).toBe("BAD_SPELL_TARGET");
    expect(code(start, "sacrifice", { target: "a1", victim: "b1" })).toBe("BAD_SPELL_TARGET");
    expect(code(start, "sacrifice", { target: "a1" })).toBe("UNKNOWN_TARGET");
    expect(code(start, "sacrifice", { target: "a2", victim: "a1" })).toBe("BAD_SPELL_TARGET");
    const cloned = cast(start, "clone", { target: "a2" }).state;
    const ready = {
      ...cloned,
      sides: [{ ...cloned.sides[0], cast: false }, cloned.sides[1]] as const,
    };
    expect(code(ready, "sacrifice", { target: "a1", victim: "a2c" })).toBe("BAD_SPELL_TARGET");
    expect(code(ready, "sacrifice", { target: "a2c", victim: "a1" })).toBe("BAD_SPELL_TARGET");
  });
});

/** Герой, знающий одно заклинание. */
function only(id: string) {
  return mage(2, 100, [spell(id)]);
}

describe("компьютер", () => {
  it("«Воскрешение» — отряду с потерями; целым — нет", () => {
    const { state } = startBattle(
      army(["militia:30"], { hero: only("resurrection") }),
      army(["militia:30"]),
    );
    const ready = turnOf(state, "a1");
    expect(chooseCast(ready, 0)).toBe(undefined);
    const hurt = withStacks(ready, { a1: { count: 10 } });
    const command = chooseCast(hurt, 0);
    expect(command).toMatchObject({ spell: "resurrection", target: "a1" });
    expect(applyBattleCommand(hurt, command ?? { type: "battleFlee", side: 0 }).ok).toBe(true);
  });

  it("«Клон» колдует, «Жертву» — никогда", () => {
    const cloner = startBattle(army(["militia:30"], { hero: only("clone") }), army(["militia:30"]));
    expect(chooseCast(turnOf(cloner.state, "a1"), 0)).toMatchObject({
      spell: "clone",
      target: "a1",
    });
    const giver = startBattle(
      army(["militia:30", "slinger:10"], { hero: only("sacrifice") }),
      army(["militia:30"]),
    );
    const hurt = withStacks(turnOf(giver.state, "a1"), { a1: { count: 5 } });
    expect(chooseCast(hurt, 0)).toBe(undefined);
  });
});

describe("автобой с полной книгой", () => {
  it("51 заклинание; бои заканчиваются без нарушений", () => {
    expect(ALL_SPELLS).toHaveLength(51);
    for (let seed = 201; seed <= 260; seed += 1) {
      const result = runAutoBattle(randomBattle(seed, CREATURES, ALL_SPELLS), CREATURES, seed);
      expect(result.problems).toEqual([]);
    }
  });
});

describe("клон и компьютер", () => {
  it("бьёт клон первым, если достаёт", () => {
    const start = battle(0, [["militia:30"], ["slinger:10"]]);
    const cloned = cast(start, "clone", { target: "a1" }).state;
    const command = chooseBattleCommand(
      turnOf({ ...cloned, sides: [cloned.sides[0], { ...cloned.sides[1], hero: null }] }, "b1"),
    );
    expect(command).toMatchObject({ type: "battleShoot", target: "a1c" });
  });
});
