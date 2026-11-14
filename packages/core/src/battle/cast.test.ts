// Правила из docs/mechanics/62-battle-spells.md: кто, когда и на кого колдует.
import { describe, expect, it } from "vitest";
import { spell, SPELLS } from "../spellKit.ts";
import { canTarget, castableSpells, spellValue } from "./cast.ts";
import { castCode, conjure, costOf, mage, magicBattle } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { renderBattle } from "./render.ts";
import { untilNextRound } from "./siegeKit.ts";
import { act, army, code, stack, startBattle, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

function nextRound(state: BattleState): BattleState {
  let current = state;
  while (current.round === state.round) {
    current = act(current, { type: "battleDefend" }).state;
  }
  return current;
}

describe("волшебная стрела", () => {
  it("урон = 10 × сила магии + 10; мана тратится, ход отряда остаётся", () => {
    const state = magicBattle(2, 30);
    const result = act(state, { type: "battleCast", spell: "magic-arrow", target: "b1" });
    // 30 урона по ополченцам с 12 здоровья: двое гибнут, третий ранен на 6.
    expect(stack(result.state, "b1")).toMatchObject({ count: 18, firstHealth: 6 });
    expect(result.events).toEqual([
      {
        type: "spellCast",
        side: 0,
        spell: "magic-arrow",
        name: "Волшебная стрела",
        targetId: "b1",
        manaLeft: 25,
        outcome: { kind: "damage", damage: 30, killed: 2, left: 18 },
      },
    ]);
    expect(result.state.sides[0]).toMatchObject({ cast: true, hero: { mana: 25 } });
    expect(result.state.activeStack).toBe(state.activeStack);
    expect(result.state.rng).toEqual(state.rng);
  });

  it.each([
    [0, 10],
    [1, 20],
    [2, 30],
    [10, 110],
  ])("сила магии %i — урон %i", (power, damage) => {
    expect(spellValue(spell("magic-arrow"), power)).toBe(damage);
  });

  it("урон ровно в здоровье отряда убивает его; последний отряд — бой окончен", () => {
    // 20 ополченцев × 12 = 240 здоровья; сила магии 23 даёт ровно 240.
    const exact = act(magicBattle(23), { type: "battleCast", spell: "magic-arrow", target: "b1" });
    expect(exact.state.result).toMatchObject({ winner: 0 });
    expect(exact.events.map((event) => event.type)).toEqual([
      "spellCast",
      "stackDied",
      "battleEnded",
    ]);
    // На единицу урона меньше (сила 22 — 230): один ополченец остаётся.
    const short = act(magicBattle(22), { type: "battleCast", spell: "magic-arrow", target: "b1" });
    expect(stack(short.state, "b1")).toMatchObject({ count: 1, firstHealth: 10 });
    expect(short.state.result).toBeNull();
  });
});

describe("отказы", () => {
  it("без героя — NO_HERO; чужой ход — NOT_YOUR_STACK", () => {
    const { state } = startBattle(army(["militia:20"]), army(["militia:20"]));
    expect(castCode(state, 0, "magic-arrow", "b1")).toBe("NO_HERO");
    const battle = magicBattle();
    // Ходит a2: обороняющийся колдовать не может.
    expect(code(battle, { type: "battleCast", side: 1, spell: "magic-arrow", target: "a1" })).toBe(
      "NOT_YOUR_STACK",
    );
  });

  it("незнакомое заклинание, нет цели, цель мертва, цель не та", () => {
    const state = magicBattle();
    expect(castCode(state, 0, "fireball", "b1")).toBe("UNKNOWN_SPELL");
    expect(castCode(state, 0, "magic-arrow", "zz")).toBe("UNKNOWN_TARGET");
    expect(castCode(withStacks(state, { a2: { count: 0 } }), 0, "bless", "a2")).toBe(
      "UNKNOWN_TARGET",
    );
    expect(castCode(state, 0, "magic-arrow", "a1")).toBe("BAD_SPELL_TARGET");
    expect(castCode(state, 0, "bless", "b1")).toBe("BAD_SPELL_TARGET");
    expect(castCode(state, 0, "dispel", "b1")).toBe("BAD_SPELL_TARGET");
    expect(castCode(state, 0, "curse", "a1")).toBe("BAD_SPELL_TARGET");
  });

  it("герой без книги заклинаний не знает: любое — UNKNOWN_SPELL", () => {
    const { state } = startBattle(
      army(["militia:20"], { hero: { attack: 0, defense: 0, spellPower: 5, mana: 50 } }),
      army(["militia:20"]),
    );
    expect(castCode(state, 0, "magic-arrow", "b1")).toBe("UNKNOWN_SPELL");
    expect(castableSpells(state, 0)).toEqual([]);
  });

  it("маны ровно в цену — колдует и остаётся с нулём; на единицу меньше — NOT_ENOUGH_MANA", () => {
    expect(castCode(magicBattle(2, 4), 0, "magic-arrow", "b1")).toBe("NOT_ENOUGH_MANA");
    expect(castCode(magicBattle(2, 5), 0, "slow", "b1")).toBe("NOT_ENOUGH_MANA");
    const spent = conjure(magicBattle(2, 5), 0, "magic-arrow", "b1").state;
    expect(spent.sides[0].hero?.mana).toBe(0);
    expect(castCode({ ...spent, round: 2 }, 0, "magic-arrow", "b1")).toBe("ALREADY_CAST");
  });

  it("отказ ничего не меняет", () => {
    const state = magicBattle(2, 4);
    const result = applyBattleCommand(state, {
      type: "battleCast",
      side: 0,
      spell: "magic-arrow",
      target: "b1",
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_ENOUGH_MANA" });
  });

  it("порядок отказов: сначала заклинание, потом «уже колдовал», потом мана, потом цель", () => {
    const cast = act(magicBattle(2, 9), { type: "battleCast", spell: "magic-arrow", target: "b1" });
    // Осталось 4 маны, герой уже колдовал.
    expect(castCode(cast.state, 0, "fireball", "zz")).toBe("UNKNOWN_SPELL");
    expect(castCode(cast.state, 0, "magic-arrow", "zz")).toBe("ALREADY_CAST");
    const rested = nextRound(cast.state);
    expect(castCode(rested, 0, "magic-arrow", "zz")).toBe("NOT_ENOUGH_MANA");
    expect(castCode(magicBattle(), 0, "magic-arrow", "zz")).toBe("UNKNOWN_TARGET");
  });
});

describe("одно заклинание в раунд", () => {
  it("второе в том же раунде — ALREADY_CAST; в следующем раунде снова можно", () => {
    const first = act(magicBattle(), { type: "battleCast", spell: "bless", target: "a1" }).state;
    expect(code(first, { type: "battleCast", side: 0, spell: "magic-arrow", target: "b1" })).toBe(
      "ALREADY_CAST",
    );
    // Ход другого отряда той же стороны запрета не снимает.
    expect(castCode(first, 0, "magic-arrow", "b1")).toBe("ALREADY_CAST");
    const second = nextRound(first);
    expect(second.round).toBe(2);
    expect(second.sides[0].cast).toBe(false);
    expect(castCode(second, 0, "magic-arrow", "b1")).toBe("принята");
  });

  it("стороны колдуют независимо: каждая по разу", () => {
    const first = conjure(magicBattle(), 0, "curse", "b1").state;
    const answered = {
      ...first,
      sides: [{ ...first.sides[0], cast: true }, first.sides[1]] as const,
    };
    expect(castCode(answered, 1, "magic-arrow", "a1")).toBe("принята");
    expect(castCode(answered, 0, "magic-arrow", "b1")).toBe("ALREADY_CAST");
  });

  it("список доступных заклинаний: по мане; после колдовства — пусто", () => {
    const state = magicBattle(2, 5);
    const cheap = SPELLS.filter((item) => item.cost <= 5).map((item) => item.id);
    expect(castableSpells(state, 0).map((item) => item.id)).toEqual(cheap);
    expect(cheap).not.toContain("slow");
    const cast = act(state, { type: "battleCast", spell: "bless", target: "a1" }).state;
    expect(castableSpells(cast, 0)).toEqual([]);
    expect(costOf("slow")).toBe(6);
  });
});

describe("цели", () => {
  it("на осадную машину ложится только урон", () => {
    const { state } = startBattle(
      army(["militia:20"], { hero: mage(2) }),
      army(["militia:20"], { hero: mage(2) }),
      { siege: { fortification: "fort", buildings: 0 } },
    );
    const catapult = stack(state, "ac");
    expect(canTarget(spell("bless"), 0, catapult)).toBe(false);
    expect(canTarget(spell("cure"), 0, catapult)).toBe(false);
    expect(canTarget(spell("slow"), 1, catapult)).toBe(false);
    expect(canTarget(spell("magic-arrow"), 1, catapult)).toBe(true);
    expect(castCode(state, 0, "stone-skin", "ac")).toBe("BAD_SPELL_TARGET");
    const hit = conjure(state, 1, "magic-arrow", "ac");
    expect(hit.events[0]).toMatchObject({ outcome: { kind: "damage", damage: 30, killed: 0 } });
  });

  it("печать боя: мана и заклинания героя, действия на отряде", () => {
    const state = conjure(magicBattle(2, 30), 0, "bless", "a1").state;
    const text = renderBattle(state);
    expect(text).toContain("Герой (нападающий): мана 25; Волшебная стрела (5), Щит (5)");
    expect(text).toContain("в этом раунде уже колдовал");
    expect(text).toContain("«Благословение» (раундов: 2)");
    expect(untilNextRound(state).some((event) => event.type === "effectEnded")).toBe(false);
  });
});
