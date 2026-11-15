// Заклинания управления отрядом: docs/mechanics/69-spells-control.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseCast } from "./aiSpells.ts";
import { applyBattleCommand } from "./commands.ts";
import { castCode, conjure, conjureAll, faceToFace, mage, plainBattle } from "./castKit.ts";
import { attackOf, damageRange, defenseOf } from "./damage.ts";
import { canShoot } from "./queries.ts";
import {
  act,
  army,
  code,
  fixed,
  MILITIA,
  stack,
  startBattle,
  strikes,
  turnOf,
  withStacks,
} from "./testkit.ts";
import type { BattleEvent, BattleState } from "./types.ts";

/** Бой как `plainBattle`, но нападающий герой знает школы на уровне `mastery`. */
function skilled(mastery: number, spellPower = 2): BattleState {
  const spells = ALL_SPELLS.map((item) => spellAtMastery(item, mastery));
  return startBattle(
    army(["militia:20", "slinger:10"], { hero: mage(spellPower, 200, spells) }),
    army(["militia:20", "slinger:10"], { hero: mage(1, 100, ALL_SPELLS) }),
  ).state;
}

/** Все защищаются до начала раунда `round`; в ответе — события по дороге. */
function until(state: BattleState, round: number): { state: BattleState; events: BattleEvent[] } {
  let current = state;
  const events: BattleEvent[] = [];
  while (current.round < round) {
    const step = act(current, { type: "battleDefend" });
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

const has = (state: BattleState, id: string, spellId: string): boolean =>
  stack(state, id).effects.some((effect) => effect.spell === spellId);

/** a1 бьёт b1 с места: отряды стоят вплотную. */
function hit(state: BattleState, attacker = "a1", from = { col: 5, row: 5 }) {
  return act(turnOf(state, attacker), { type: "battleAttack", target: "b1", from });
}

/** a1 и a2 стоят вплотную к b1. */
const pincer = (state: BattleState): BattleState =>
  withStacks(faceToFace(state), { a2: { col: 7, row: 5 } });

const answers = (state: BattleState): number => {
  const first = hit(state);
  const second = hit(first.state, "a2", { col: 7, row: 5 });
  return [...first.events, ...second.events].filter(
    (event) => event.type === "strike" && event.kind === "retaliation",
  ).length;
};

/** Вражеский герой колдует заклинание по площади в клетку a1: кого задело. */
const aim = (state: BattleState, id: string): string[] => {
  const result = applyBattleCommand(turnOf(state, "b1"), {
    type: "battleCast",
    side: 1,
    spell: id,
    cell: { col: 5, row: 5 },
  });
  return result.ok
    ? result.events.map((event) => (event.type === "spellCast" ? event.targetId : event.type))
    : [result.code];
};

describe("«Слепота»", () => {
  it("ослеплённый отряд не ходит, пока не кончится срок: сила магии 2 — два раунда", () => {
    const blind = conjure(plainBattle(), 0, "blind", "b1").state;
    const two = until(blind, 3);
    const turns = two.events.filter(
      (event) => event.type === "stackTurn" && event.stackId === "b1",
    );
    const skips = two.events.filter((event) => event.type === "stackBlind");
    // В третьем раунде слепота уже прошла: событие хода b1 может быть только там.
    expect(skips).toEqual([
      { type: "stackBlind", stackId: "b1" },
      { type: "stackBlind", stackId: "b1" },
    ]);
    expect(turns.length).toBeLessThanOrEqual(1);
    expect(has(two.state, "b1", "blind")).toBe(false);
    const three = until(two.state, 4);
    expect(three.events.some((event) => event.type === "stackBlind")).toBe(false);
  });

  it("удар снимает слепоту; ответ — вполсилы", () => {
    const close = faceToFace(plainBattle());
    const normal = strikes(hit(close).events);
    const dazed = hit(conjure(close, 0, "blind", "b1").state);
    const [first, back] = strikes(dazed.events);
    expect(first).toEqual(normal[0]);
    expect(back?.kind).toBe("retaliation");
    const full = normal[1]?.damage ?? 0;
    expect(full).toBeGreaterThan(10);
    expect([Math.floor(full / 2), Math.floor((full - 1) / 2)]).toContain(back?.damage);
    expect(has(dazed.state, "b1", "blind")).toBe(false);
    expect(dazed.events).toContainEqual({
      type: "effectEnded",
      stackId: "b1",
      spell: "blind",
      name: "Слепота",
    });
  });

  it("на экспертном уровне ослеплённый не отвечает вовсе, и ответ остаётся при нём", () => {
    const close = faceToFace(skilled(3));
    expect(spellAtMastery(spell("blind"), 3)).toMatchObject({ value: 0, mass: false, cost: 8 });
    const dazed = hit(conjure(close, 0, "blind", "b1").state);
    expect(strikes(dazed.events).map((event) => event.kind)).toEqual(["melee"]);
    expect(stack(dazed.state, "b1").retaliated).toBe(false);
  });

  it("урон от заклинания тоже снимает слепоту", () => {
    const blind = conjure(plainBattle(), 0, "blind", "b1").state;
    expect(has(conjure(blind, 0, "magic-arrow", "b1").state, "b1", "blind")).toBe(false);
    expect(has(conjure(blind, 0, "curse", "b1").state, "b1", "blind")).toBe(true);
  });
});

describe("«Забывчивость»", () => {
  it("только на стрелка с выстрелами; выстрел вдвое слабее", () => {
    const state = plainBattle();
    expect(castCode(state, 0, "forgetfulness", "b1")).toBe("BAD_SPELL_TARGET");
    expect(castCode(withStacks(state, { b2: { shots: 0 } }), 0, "forgetfulness", "b2")).toBe(
      "BAD_SPELL_TARGET",
    );
    const before = damageRange(state, stack(state, "b2"), stack(state, "a1"), "shot");
    const after = conjure(state, 0, "forgetfulness", "b2").state;
    const weak = damageRange(after, stack(after, "b2"), stack(after, "a1"), "shot");
    expect(weak.max).toBe(Math.floor(before.max / 2));
    expect(canShoot(after, stack(after, "b2"))).toBe(true);
  });

  it("на продвинутом уровне отряд не стреляет совсем", () => {
    const after = conjure(skilled(2), 0, "forgetfulness", "b2").state;
    expect(canShoot(after, stack(after, "b2"))).toBe(false);
    expect(code(turnOf(after, "b2"), { type: "battleShoot", side: 1, target: "a1" })).toBe(
      "NO_SHOTS",
    );
  });

  it("на экспертном уровне — на всех вражеских стрелков", () => {
    const state = startBattle(
      army(["militia:5"], {
        hero: mage(2, 100, [spellAtMastery(spell("forgetfulness"), 3)]),
      }),
      army(["slinger:5", "militia:5", "slinger:5"]),
    ).state;
    const { events } = conjure(state, 0, "forgetfulness", "b1");
    expect(events.map((event) => (event.type === "spellCast" ? event.targetId : ""))).toEqual([
      "b1",
      "b3",
    ]);
  });
});

describe("«Бешенство»", () => {
  it("атака растёт на защиту, защита 0; проходит после действия отряда", () => {
    // Ополченец: атака 5, защита 5.
    const mad = conjure(plainBattle(), 0, "frenzy", "a1").state;
    expect(attackOf(mad, stack(mad, "a1"), "melee")).toBe(10);
    expect(defenseOf(mad, stack(mad, "a1"))).toBe(0);
    const calm = act(turnOf(mad, "a1"), { type: "battleDefend" });
    expect(has(calm.state, "a1", "frenzy")).toBe(false);
    expect(calm.events).toContainEqual({
      type: "effectEnded",
      stackId: "a1",
      spell: "frenzy",
      name: "Бешенство",
    });
  });

  it("на экспертном уровне — 200 % защиты; удар идёт ещё с бешенством", () => {
    const close = faceToFace(skilled(3));
    const mad = conjure(close, 0, "frenzy", "a1").state;
    expect(attackOf(mad, stack(mad, "a1"), "melee")).toBe(15);
    const plainHit = strikes(hit(close).events)[0]?.damage ?? 0;
    const madHit = hit(mad);
    expect(strikes(madHit.events)[0]?.damage).toBeGreaterThan(plainHit);
    expect(has(madHit.state, "a1", "frenzy")).toBe(false);
  });

  it("чужой ход бешенства не снимает: оно ждёт действия своего отряда", () => {
    const mad = conjure(plainBattle(), 0, "frenzy", "a1").state;
    const after = act(turnOf(mad, "b1"), { type: "battleDefend" }).state;
    expect(has(after, "a1", "frenzy")).toBe(true);
  });
});

describe("«Контрудар»", () => {
  it("без него отряд отвечает раз за раунд, с ним — дважды", () => {
    const state = pincer(plainBattle());
    expect(answers(state)).toBe(1);
    expect(answers(conjure(state, 1, "counterstrike", "b1").state)).toBe(2);
  });

  it("в новом раунде лишний ответ снова цел", () => {
    const state = conjure(pincer(plainBattle()), 1, "counterstrike", "b1").state;
    const spent = hit(hit(state).state, "a2", { col: 7, row: 5 }).state;
    expect(stack(spent, "b1").effects.map((effect) => effect.used)).toEqual([1]);
    const own = conjure(plainBattle(), 0, "counterstrike", "a1").state;
    const used = withStacks(own, {
      a1: { effects: stack(own, "a1").effects.map((effect) => ({ ...effect, used: 1 })) },
    });
    expect(stack(until(used, 2).state, "a1").effects.map((effect) => effect.used)).toEqual([0]);
  });

  it("числа по уровням: +1, +1, +2, +2; на экспертном — на всех", () => {
    expect(
      [0, 1, 2, 3].map((level) => spellAtMastery(spell("counterstrike"), level).value),
    ).toEqual([1, 1, 2, 2]);
    expect(spellAtMastery(spell("counterstrike"), 3).mass).toBe(true);
  });
});

describe("«Огненный щит»", () => {
  it("ударивший получает 20 % нанесённого урона; защита от огня его уменьшает", () => {
    const shielded = conjure(faceToFace(plainBattle()), 1, "fire-shield", "b1").state;
    const { events } = hit(shielded);
    const dealt = strikes(events)[0]?.damage ?? 0;
    expect(dealt).toBeGreaterThan(20);
    const burnt = events.find((event) => event.type === "fireShield");
    expect(burnt).toMatchObject({ stackId: "b1", targetId: "a1", damage: Math.floor(dealt / 5) });
    // Щит срабатывает до ответного удара.
    expect(events.findIndex((event) => event.type === "fireShield")).toBeLessThan(
      events.findIndex((event) => event.type === "strike" && event.kind === "retaliation"),
    );
    const guarded = conjure(shielded, 0, "protection-from-fire", "a1").state;
    expect(hit(guarded).events.find((event) => event.type === "fireShield")).toMatchObject({
      damage: Math.floor((Math.floor(dealt / 5) * 70) / 100),
    });
  });

  it("на выстрел не действует", () => {
    const shielded = conjure(plainBattle(), 1, "fire-shield", "b1").state;
    const { events } = act(turnOf(shielded, "a2"), { type: "battleShoot", target: "b1" });
    expect(strikes(events)).toHaveLength(1);
    expect(events.some((event) => event.type === "fireShield")).toBe(false);
  });

  it("ударивший может погибнуть от щита: тогда ему не отвечают", () => {
    const shielded = conjure(faceToFace(plainBattle()), 1, "fire-shield", "b1").state;
    // Один ополченец бьёт на 2–3 урона: 20 % — меньше единицы, щит молчит.
    const lone = withStacks(shielded, { a1: { count: 1 } });
    expect(hit(lone).events.some((event) => event.type === "fireShield")).toBe(false);
    // Существо с уроном 50 и здоровьем 1: щит возвращает 10.
    const glass = withStacks(shielded, {
      a1: { count: 1, firstHealth: 1, creature: fixed(MILITIA, 50, { health: 1 }) },
    });
    const { state, events } = hit(glass);
    expect(stack(state, "a1").count).toBe(0);
    expect(strikes(events).map((event) => event.kind)).toEqual(["melee"]);
    expect(state.activeStack).not.toBe("a1");
  });
});

/** Код отказа; правило «одно заклинание в раунд» на время проверки снято. */
function refusal(state: BattleState, side: 0 | 1, id: string, target: string): string {
  const sides = [
    { ...state.sides[0], cast: false },
    { ...state.sides[1], cast: false },
  ] as const;
  return castCode({ ...state, sides }, side, id, target);
}

describe("«Антимагия»", () => {
  it("снимает вредное и не пускает заклинания кругов 1–3, ни чужие, ни свои", () => {
    const cursed = conjureAll(plainBattle(), [1, "curse", "a1"], [0, "bless", "a2"]);
    const { state, events } = conjure(cursed, 0, "anti-magic", "a1");
    expect(events[0]).toMatchObject({ outcome: { kind: "effect", removed: ["curse"] } });
    expect(refusal(state, 1, "magic-arrow", "a1")).toBe("BAD_SPELL_TARGET");
    expect(refusal(state, 1, "blind", "a1")).toBe("BAD_SPELL_TARGET");
    expect(refusal(state, 0, "bless", "a1")).toBe("BAD_SPELL_TARGET");
    expect(refusal(state, 0, "dispel", "a1")).toBe("BAD_SPELL_TARGET");
    // Четвёртый и пятый круг проходят.
    expect(refusal(state, 1, "chain-lightning", "a1")).toBe("принята");
    expect(refusal(state, 1, "implosion", "a1")).toBe("принята");
  });

  it("площадь его не задевает; с продвинутого уровня закрыт и четвёртый круг", () => {
    const close = faceToFace(plainBattle());
    expect(aim(close, "fireball")).toEqual(["a1", "b1"]);
    expect(aim(conjure(close, 0, "anti-magic", "a1").state, "fireball")).toEqual(["b1"]);
    expect(aim(conjure(close, 0, "anti-magic", "a1").state, "meteor-shower")).toEqual(["a1", "b1"]);
    const advanced = conjure(faceToFace(skilled(2)), 0, "anti-magic", "a1").state;
    expect(aim(advanced, "meteor-shower")).toEqual(["b1"]);
    expect(refusal(advanced, 1, "implosion", "a1")).toBe("принята");
    const expert = conjure(faceToFace(skilled(3)), 0, "anti-magic", "a1").state;
    expect(refusal(expert, 1, "implosion", "a1")).toBe("BAD_SPELL_TARGET");
  });
});

describe("компьютер", () => {
  it("слепит сильнейший вражеский отряд, когда больше нечем", () => {
    const state = startBattle(
      army(["militia:5"], { hero: mage(3, 100, [spell("blind")]) }),
      army(["militia:5", "militia:40"]),
    ).state;
    expect(chooseCast(state, 0)).toMatchObject({ spell: "blind", target: "b2" });
  });

  it("«Контрудар» без двух врагов рядом не колдует", () => {
    const state = startBattle(
      army(["militia:5"], { hero: mage(3, 100, [spell("counterstrike")]) }),
      army(["militia:5", "militia:40"]),
    ).state;
    expect(chooseCast(state, 0)).toBe(undefined);
  });
});
