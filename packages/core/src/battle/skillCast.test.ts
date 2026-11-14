// Заклинания в бою у героя с навыками школ: docs/mechanics/65-hero-skills.md.
import { describe, expect, it } from "vitest";
import { spell, SPELLS } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseCast } from "./aiSpells.ts";
import { spellTargetsOf, spellValue } from "./cast.ts";
import { conjure, faceToFace } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { damageRange } from "./damage.ts";
import { fixedDamage } from "./effects.ts";
import { act, army, stack, startBattle, strikes, turnOf } from "./testkit.ts";
import type { BattleState } from "./types.ts";

/** Герой, колдующий все заклинания на уровне школы `mastery`. */
function master(mastery: number, spellPower = 2, mana = 100, sorcery = 0) {
  const spells = SPELLS.map((item) => spellAtMastery(item, mastery));
  return { attack: 0, defense: 0, spellPower, mana, sorcery, spells };
}

/** 20 ополченцев и 10 пращников против 20 ополченцев и 10 пращников; герои — одного уровня школ. */
function battle(mastery: number, sorcery = 0): BattleState {
  return startBattle(
    army(["militia:20", "slinger:10"], { hero: master(mastery, 2, 100, sorcery) }),
    army(["militia:20", "slinger:10"], { hero: master(mastery) }),
  ).state;
}

const effectsOf = (state: BattleState, id: string): string[] =>
  stack(state, id).effects.map((effect) => effect.spell);

const arrowDamage = (mastery: number): unknown =>
  conjure(battle(mastery), 0, "magic-arrow", "b1").events.map((event) =>
    event.type === "spellCast" ? [event.targetId, event.outcome] : null,
  );
const blessed = (mastery: number) => stack(conjure(battle(mastery), 0, "bless", "a1").state, "a1");
const cursed = (mastery: number) => stack(conjure(battle(mastery), 0, "curse", "b1").state, "b1");
const fresh = (state: BattleState): BattleState => ({
  ...state,
  sides: [
    { ...state.sides[0], cast: false },
    { ...state.sides[1], cast: false },
  ],
});
/** Нападающий знает только эти заклинания, на уровне школы `mastery`. */
function knowing(mastery: number, ...ids: readonly string[]): BattleState {
  const state = battle(mastery);
  const hero = state.sides[0].hero;
  if (hero === null) {
    throw new Error("Героя нет.");
  }
  const spells = hero.spells.filter((item) => ids.includes(item.id));
  return { ...state, sides: [{ ...state.sides[0], hero: { ...hero, spells } }, state.sides[1]] };
}

describe("цена и сила с навыком", () => {
  it("базовый: заклинание дешевле на 1 ману, действует как без навыка", () => {
    const result = conjure(battle(1), 0, "magic-arrow", "b1");
    expect(result.events[0]).toMatchObject({
      manaLeft: 96,
      outcome: { kind: "damage", damage: 30 },
    });
    expect(conjure(battle(1), 0, "cure", "a1").state.sides[0].hero?.mana).toBe(95);
  });

  it("продвинутый: стрела 10 × сила + 20, экспертный: + 30 — по одному отряду", () => {
    expect(arrowDamage(2)).toMatchObject([["b1", { damage: 40 }]]);
    expect(arrowDamage(3)).toMatchObject([["b1", { damage: 50 }]]);
  });

  it("«Волшебство» увеличивает урон заклинаний, дробь отбрасывается; лечение не трогает", () => {
    const hero = { spellPower: 2, sorcery: 15 };
    // 30 × 1,15 = 34,5 → 34.
    expect(spellValue(spell("magic-arrow"), hero)).toBe(34);
    expect(spellValue(spell("magic-arrow"), { spellPower: 2, sorcery: 5 })).toBe(31);
    expect(spellValue(spell("cure"), hero)).toBe(20);
    const result = conjure(battle(0, 15), 0, "magic-arrow", "b1");
    expect(result.events[0]).toMatchObject({ outcome: { damage: 34 } });
  });

  it("продвинутые числа действий: +6 атаки и защиты, +5 скорости, 70 % и 50 %", () => {
    let state = battle(2);
    for (const [id, target] of [
      ["bloodlust", "a1"],
      ["stone-skin", "a1"],
      ["haste", "a1"],
      ["shield", "a2"],
      ["protection-from-fire", "a2"],
    ] as const) {
      ({ state } = conjure(state, 0, id, target));
    }
    ({ state } = conjure(state, 0, "slow", "b1"));
    const values = (id: string): number[] => stack(state, id).effects.map((effect) => effect.value);
    expect(values("a1")).toEqual([6, 6, 5]);
    expect(values("a2")).toEqual([70, 50]);
    expect(values("b1")).toEqual([50]);
  });
});

describe("«Благословение» и «Проклятие» с навыком", () => {
  it("без навыка и на базовом — наибольший и наименьший урон; на продвинутом — на единицу дальше", () => {
    // Ополченец: урон 2–3.
    expect([0, 1, 2, 3].map((mastery) => fixedDamage(blessed(mastery)))).toEqual([3, 3, 4, 4]);
    expect([0, 1, 2, 3].map((mastery) => fixedDamage(cursed(mastery)))).toEqual([2, 2, 1, 1]);
  });

  it("проклятое существо с наименьшим уроном 1 бьёт на 1, не на 0", () => {
    const state = conjure(battle(2), 0, "curse", "b2").state;
    const slinger = stack(state, "b2");
    const weak = { ...slinger, creature: { ...slinger.creature, damageMin: 1 } };
    expect(fixedDamage(weak)).toBe(1);
  });

  it("удар благословлённого на продвинутом: 20 ополченцев × 4 урона", () => {
    const state = faceToFace(conjure(battle(2), 0, "bless", "a1").state);
    const estimate = damageRange(state, stack(state, "a1"), stack(state, "b1"), "melee");
    expect(estimate.min).toBe(estimate.max);
    const result = act(turnOf(state, "a1"), {
      type: "battleAttack",
      target: "b1",
      from: { col: 5, row: 5 },
    });
    // Атака 5 против защиты 5: урон без поправок — 80.
    expect(strikes(result.events)[0]).toMatchObject({ damage: 80 });
    expect(estimate.max).toBe(80);
  });
});

describe("экспертный уровень: заклинание на все отряды", () => {
  it("«Благословение» ложится на все свои отряды; мана тратится один раз", () => {
    const result = conjure(battle(3), 0, "bless", "a2");
    expect(
      result.events.map((event) => (event.type === "spellCast" ? event.targetId : "")),
    ).toEqual(["a1", "a2"]);
    expect(result.state.sides[0].hero?.mana).toBe(96);
    expect(effectsOf(result.state, "a1")).toEqual(["bless"]);
    expect(effectsOf(result.state, "a2")).toEqual(["bless"]);
    expect(effectsOf(result.state, "b1")).toEqual([]);
  });

  it("«Замедление» и «Проклятие» — на все чужие", () => {
    let state = conjure(battle(3), 0, "slow", "b1").state;
    ({ state } = conjure(state, 0, "curse", "b2"));
    expect(effectsOf(state, "b1")).toEqual(["slow", "curse"]);
    expect(effectsOf(state, "b2")).toEqual(["slow", "curse"]);
    expect(effectsOf(state, "a1")).toEqual([]);
  });

  it("«Лечение» лечит все свои отряды на 5 × сила + 30", () => {
    let state = conjure(battle(0), 1, "magic-arrow", "a1").state;
    ({ state } = conjure(state, 1, "magic-arrow", "a2"));
    const expert = { ...state, sides: [battle(3).sides[0], state.sides[1]] as const };
    const result = conjure(expert, 0, "cure", "a1");
    expect(result.events).toMatchObject([
      { targetId: "a1", outcome: { kind: "heal" } },
      { targetId: "a2", outcome: { kind: "heal" } },
    ]);
    for (const id of ["a1", "a2"]) {
      const healed = stack(result.state, id);
      expect(healed.firstHealth).toBe(healed.creature.health);
    }
  });

  it("погибший и машины целью не становятся; заклинание на одного — только на него", () => {
    const state = battle(3);
    const bless = spellAtMastery(spell("bless"), 3);
    const target = stack(state, "a1");
    const dead = state.stacks.map((item) => (item.id === "a2" ? { ...item, count: 0 } : item));
    expect(spellTargetsOf(dead, bless, 0, target).map((item) => item.id)).toEqual(["a1"]);
    const single = spellAtMastery(spell("bless"), 2);
    expect(spellTargetsOf(state.stacks, single, 0, target).map((item) => item.id)).toEqual(["a1"]);
  });
});

describe("«Снять заклинания» с навыком", () => {
  it("без навыка и на базовом — только со своего отряда", () => {
    const state = turnOf(battle(1), "a1");
    const result = applyBattleCommand(state, {
      type: "battleCast",
      side: 0,
      spell: "dispel",
      target: "b1",
    });
    expect(result).toMatchObject({ ok: false, code: "BAD_SPELL_TARGET" });
  });

  it("продвинутый — с любого отряда: с чужого снимается его «Благословение»", () => {
    let state = conjure(battle(2), 1, "bless", "b1").state;
    ({ state } = conjure(state, 1, "bless", "b2"));
    const result = conjure(state, 0, "dispel", "b1");
    expect(result.events).toMatchObject([
      { targetId: "b1", outcome: { kind: "dispel", removed: ["bless"] } },
    ]);
    expect(effectsOf(result.state, "b1")).toEqual([]);
    expect(effectsOf(result.state, "b2")).toEqual(["bless"]);
  });

  it("экспертный — со всех отрядов на поле, своих и чужих", () => {
    let state = conjure(battle(2), 1, "bless", "b1").state;
    ({ state } = conjure(state, 1, "slow", "a1"));
    ({ state } = conjure(state, 0, "haste", "a2"));
    const expert = { ...state, sides: [battle(3).sides[0], state.sides[1]] as const };
    const result = conjure(expert, 0, "dispel", "a1");
    expect(result.events).toHaveLength(4);
    expect(result.state.stacks.flatMap((item) => item.effects)).toEqual([]);
  });
});

describe("компьютер боя и навыки", () => {
  it("польза заклинания на все отряды — сумма по отрядам: оно выгоднее стрелы", () => {
    // На одном отряде «Проклятие» уступает стреле, на двух — уже нет.
    const single = chooseCast(fresh(knowing(2, "magic-arrow", "curse")), 0);
    const mass = chooseCast(fresh(knowing(3, "curse")), 0);
    expect(single).toMatchObject({ type: "battleCast" });
    expect(mass).toMatchObject({ type: "battleCast", spell: "curse" });
    const result = applyBattleCommand(turnOf(fresh(knowing(3, "curse")), "a1"), {
      type: "battleCast",
      side: 0,
      spell: "curse",
      target: mass?.type === "battleCast" ? mass.target : "",
    });
    expect(result.ok ? result.events.length : 0).toBe(2);
  });

  it("«Снять заклинания» на всех: не колдует, когда своих благословений снимет больше, чем чужих", () => {
    const expert = knowing(3, "dispel").sides[0];
    const basic = battle(1);
    // Оба героя пока колдуют на один отряд: у врага благословлён b1.
    let state = conjure(basic, 1, "bless", "b1").state;
    expect(chooseCast(fresh({ ...state, sides: [expert, state.sides[1]] }), 0)).toMatchObject({
      spell: "dispel",
    });
    // У своих — два благословения, у врага одно: снимать невыгодно.
    ({ state } = conjure(state, 0, "bless", "a1"));
    ({ state } = conjure(state, 0, "bless", "a2"));
    expect(chooseCast(fresh({ ...state, sides: [expert, state.sides[1]] }), 0)).toBeUndefined();
  });

  it("продвинутое «Снять заклинания» снимает благословение с чужого отряда", () => {
    let state = knowing(2, "dispel");
    ({ state } = conjure(state, 1, "bless", "b1"));
    expect(chooseCast(fresh(state), 0)).toEqual({
      type: "battleCast",
      side: 0,
      spell: "dispel",
      target: "b1",
    });
  });
});
