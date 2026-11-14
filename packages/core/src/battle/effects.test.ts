// Действия заклинаний первого круга: docs/mechanics/62-battle-spells.md, числа — 60-spells.md.
import { describe, expect, it } from "vitest";
import { SPELLS } from "../spellKit.ts";
import { chooseBattleCommand } from "./ai.ts";
import { conjure, conjureAll, faceToFace, mage, magicBattle } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { battleProblems } from "./invariants.ts";
import { activeStackOf } from "./queries.ts";
import { speedOf } from "./effects.ts";
import { act, army, stack, startBattle, strikes, turnOf, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

/** Урон первого удара: 20 ополченцев a1 бьют 20 ополченцев b1 в ближнем бою. */
function meleeDamage(state: BattleState): number | undefined {
  const struck = act(turnOf(faceToFace(state), "a1"), {
    type: "battleAttack",
    target: "b1",
    from: { col: 5, row: 5 },
  });
  return strikes(struck.events)[0]?.damage;
}

/** Урон выстрела: 10 пращников a2 стреляют по b1 с пяти клеток. */
function shotDamage(state: BattleState): number | undefined {
  const placed = withStacks(state, { a2: { col: 1, row: 5 }, b1: { col: 6, row: 5 } });
  const shot = act(turnOf(placed, "a2"), { type: "battleShoot", target: "b1" });
  return strikes(shot.events)[0]?.damage;
}

function effectsOf(state: BattleState, id: string): string[] {
  return stack(state, id).effects.map((effect) => `${effect.spell}:${effect.rounds}`);
}

function nextRound(state: BattleState): ReturnType<typeof act> {
  let current = state;
  const events = [];
  while (current.round === state.round) {
    const next = act(current, { type: "battleDefend" });
    events.push(...next.events);
    current = next.state;
  }
  return { state: current, events };
}

describe("урон отряда", () => {
  it("«Благословение» — всегда наибольший урон, «Проклятие» — наименьший, без бросков", () => {
    // Ополченец бьёт на 2–3; атака равна защите: 20 × 3 = 60 и 20 × 2 = 40.
    const blessed = conjure(magicBattle(), 0, "bless", "a1").state;
    expect(meleeDamage(blessed)).toBe(60);
    const cursed = conjure(magicBattle(), 1, "curse", "a1").state;
    expect(meleeDamage(cursed)).toBe(40);
    // Пращник бьёт на 1–4: десять пращников — 40 и 10.
    expect(shotDamage(conjure(magicBattle(), 0, "bless", "a2").state)).toBe(40);
    expect(shotDamage(conjure(magicBattle(), 1, "curse", "a2").state)).toBe(10);
  });

  it("без заклинаний урон бросается: от 40 до 60", () => {
    const damage = meleeDamage(magicBattle()) ?? 0;
    expect(damage).toBeGreaterThanOrEqual(40);
    expect(damage).toBeLessThanOrEqual(60);
  });

  it("«Жажда крови»: +3 атаки в ближнем бою, выстрелу не помогает", () => {
    const melee = conjureAll(magicBattle(), [0, "bless", "a1"], [0, "bloodlust", "a1"]);
    // 60 × (1 + 3 × 5 %) = 69.
    expect(meleeDamage(melee)).toBe(69);
    const shot = conjureAll(magicBattle(), [0, "bless", "a2"], [0, "bloodlust", "a2"]);
    expect(shotDamage(shot)).toBe(40);
  });

  it("«Каменная кожа»: +3 защиты — и от удара, и от выстрела", () => {
    const melee = conjureAll(magicBattle(), [0, "bless", "a1"], [1, "stone-skin", "b1"]);
    // 60 × (1 − 3 × 2,5 %) = 55,5 → 55.
    expect(meleeDamage(melee)).toBe(55);
    const shot = conjureAll(magicBattle(), [0, "bless", "a2"], [1, "stone-skin", "b1"]);
    // 40 × 0,925 = 37.
    expect(shotDamage(shot)).toBe(37);
  });

  it("«Щит»: урон ближнего боя × 85 %, выстрел проходит целиком", () => {
    const melee = conjureAll(magicBattle(), [0, "bless", "a1"], [1, "shield", "b1"]);
    expect(meleeDamage(melee)).toBe(51);
    const shot = conjureAll(magicBattle(), [0, "bless", "a2"], [1, "shield", "b1"]);
    expect(shotDamage(shot)).toBe(40);
  });

  it("«Щит» и «Каменная кожа» вместе: 60 × 0,925 × 0,85 = 47,175 → 47", () => {
    const both = conjureAll(
      magicBattle(),
      [0, "bless", "a1"],
      [1, "shield", "b1"],
      [1, "stone-skin", "b1"],
    );
    expect(meleeDamage(both)).toBe(47);
  });

  it("ответный удар тоже считается с заклинаниями", () => {
    const state = conjureAll(magicBattle(), [1, "bless", "b1"], [0, "shield", "a1"]);
    const struck = act(turnOf(faceToFace(state), "a1"), {
      type: "battleAttack",
      target: "b1",
      from: { col: 5, row: 5 },
    });
    const [first, answer] = strikes(struck.events);
    // Отвечают уцелевшие ополченцы наибольшим уроном 3, щит оставляет 85 %.
    expect(answer).toMatchObject({ kind: "retaliation" });
    expect(answer?.damage).toBe(Math.floor(((first?.left ?? 0) * 3 * 85) / 100));
  });
});

describe("защита от школы магии", () => {
  it("«Волшебная стрела» всех четырёх школ: любая защита оставляет 70 % урона", () => {
    const fire = conjure(magicBattle(), 1, "protection-from-fire", "b1").state;
    expect(conjure(fire, 0, "magic-arrow", "b1").events[0]).toMatchObject({
      outcome: { damage: 21 },
    });
    const water = conjure(magicBattle(), 1, "protection-from-water", "b1").state;
    expect(conjure(water, 0, "magic-arrow", "b1").events[0]).toMatchObject({
      outcome: { damage: 21 },
    });
  });

  it("две защиты сразу не складываются: всё те же 70 %", () => {
    const both = conjureAll(
      magicBattle(),
      [1, "protection-from-fire", "b1"],
      [1, "protection-from-water", "b1"],
    );
    expect(effectsOf(both, "b1")).toEqual(["protection-from-fire:1", "protection-from-water:1"]);
    expect(conjure(both, 0, "magic-arrow", "b1").events[0]).toMatchObject({
      outcome: { damage: 21 },
    });
  });

  it("от удара отряда защита от школы не спасает", () => {
    const state = conjureAll(magicBattle(), [0, "bless", "a1"], [1, "protection-from-fire", "b1"]);
    expect(meleeDamage(state)).toBe(60);
  });
});

describe("скорость", () => {
  it("«Ускорение» +3, «Замедление» — 75 % с отбрасыванием дроби", () => {
    const state = conjureAll(magicBattle(), [0, "haste", "a1"], [0, "slow", "b1"]);
    // Ополченец: 4 + 3 = 7 и ⌊4 × 0,75⌋ = 3.
    expect(speedOf(stack(state, "a1"))).toBe(7);
    expect(speedOf(stack(state, "b1"))).toBe(3);
    expect(speedOf(stack(state, "a2"))).toBe(5);
    // Скорость 1 замедление доводит до нуля: отряд стоит на месте.
    const snail = { ...stack(state, "b1"), creature: { ...stack(state, "b1").creature, speed: 1 } };
    expect(speedOf(snail)).toBe(0);
  });

  it("ускоренный отряд ходит раньше в следующем раунде", () => {
    const start = magicBattle(3);
    expect(start.activeStack).toBe("a2");
    const hasted = nextRound(conjure(start, 0, "haste", "a1").state).state;
    expect(hasted.activeStack).toBe("a1");
  });

  it("«Ускорение» и «Замедление» снимают друг друга", () => {
    const slowed = conjure(magicBattle(), 1, "slow", "a1").state;
    const hasted = conjure(slowed, 0, "haste", "a1");
    expect(hasted.events[0]).toMatchObject({ outcome: { kind: "effect", removed: ["slow"] } });
    expect(effectsOf(hasted.state, "a1")).toEqual(["haste:2"]);
    const again = conjure(hasted.state, 1, "slow", "a1");
    expect(again.events[0]).toMatchObject({ outcome: { removed: ["haste"] } });
    expect(effectsOf(again.state, "a1")).toEqual(["slow:1"]);
  });
});

describe("замена и снятие", () => {
  it("«Благословение» и «Проклятие» снимают друг друга", () => {
    const cursed = conjure(magicBattle(), 1, "curse", "a1").state;
    const blessed = conjure(cursed, 0, "bless", "a1");
    expect(blessed.events[0]).toMatchObject({ outcome: { removed: ["curse"] } });
    expect(effectsOf(blessed.state, "a1")).toEqual(["bless:2"]);
    expect(meleeDamage(blessed.state)).toBe(60);
  });

  it("то же заклинание второй раз не складывается: срок начинается заново", () => {
    const first = conjure(magicBattle(3), 0, "stone-skin", "a1").state;
    const later = nextRound(first).state;
    expect(effectsOf(later, "a1")).toEqual(["stone-skin:2"]);
    const renewed = conjure(later, 0, "stone-skin", "a1");
    expect(renewed.events[0]).toMatchObject({ outcome: { rounds: 3, removed: [] } });
    expect(effectsOf(renewed.state, "a1")).toEqual(["stone-skin:3"]);
  });

  it("«Снять заклинания» снимает со своего отряда всё: и полезное, и вредное", () => {
    const state = conjureAll(magicBattle(), [0, "bless", "a1"], [1, "slow", "a1"]);
    const cleared = conjure(state, 0, "dispel", "a1");
    expect(cleared.events[0]).toMatchObject({
      outcome: { kind: "dispel", removed: ["bless", "slow"] },
    });
    expect(effectsOf(cleared.state, "a1")).toEqual([]);
    // Снимать нечего — заклинание всё равно принято, мана потрачена.
    const empty = conjure(cleared.state, 0, "dispel", "a1");
    expect(empty.events[0]).toMatchObject({ outcome: { removed: [] }, manaLeft: 85 });
  });

  it("«Лечение»: лечит раненого, мёртвых не поднимает, снимает только вредное", () => {
    const hurt = withStacks(magicBattle(), { a1: { count: 15, firstHealth: 3 } });
    const state = conjureAll(hurt, [0, "bless", "a1"], [1, "curse", "a2"], [1, "slow", "a1"]);
    // Сила магии 2: 5 × 2 + 10 = 20, но до полного здоровья не хватает только 9.
    const cured = conjure(state, 0, "cure", "a1");
    expect(cured.events[0]).toMatchObject({
      outcome: { kind: "heal", healed: 9, removed: ["slow"] },
    });
    expect(stack(cured.state, "a1")).toMatchObject({ count: 15, firstHealth: 12 });
    expect(effectsOf(cured.state, "a1")).toEqual(["bless:2"]);
    // Здоровый отряд: лечить нечего, но проклятие снимается.
    const clean = conjure(cured.state, 0, "cure", "a2");
    expect(clean.events[0]).toMatchObject({ outcome: { healed: 0, removed: ["curse"] } });
  });

  it("«Лечение» не лечит больше своей силы", () => {
    const base = magicBattle(0);
    const big = { ...stack(base, "a1").creature, health: 50 };
    const hurt = withStacks(base, { a1: { creature: big, firstHealth: 5 } });
    // Сила магии 0: 5 × 0 + 10 = 10.
    expect(conjure(hurt, 0, "cure", "a1").events[0]).toMatchObject({ outcome: { healed: 10 } });
  });
});

describe("срок действия", () => {
  it("срок равен силе магии; убывает в начале каждого следующего раунда", () => {
    const cast = conjure(magicBattle(2), 0, "bless", "a1").state;
    expect(effectsOf(cast, "a1")).toEqual(["bless:2"]);
    const second = nextRound(cast);
    expect(effectsOf(second.state, "a1")).toEqual(["bless:1"]);
    expect(second.events.some((event) => event.type === "effectEnded")).toBe(false);
    const third = nextRound(second.state);
    expect(effectsOf(third.state, "a1")).toEqual([]);
    expect(third.events).toContainEqual({
      type: "effectEnded",
      stackId: "a1",
      spell: "bless",
      name: "Благословение",
    });
  });

  it("сила магии 1: действие держится только до конца раунда, в котором наложено", () => {
    // У героя обороняющегося сила магии 1.
    const cast = conjure(magicBattle(), 1, "stone-skin", "b1").state;
    expect(effectsOf(cast, "b1")).toEqual(["stone-skin:1"]);
    expect(effectsOf(nextRound(cast).state, "b1")).toEqual([]);
  });

  it("сила магии 0: действие всё равно держится до конца раунда", () => {
    const cast = conjure(magicBattle(0), 0, "bless", "a1").state;
    expect(effectsOf(cast, "a1")).toEqual(["bless:1"]);
    expect(meleeDamage(cast)).toBe(60);
    expect(effectsOf(nextRound(cast).state, "a1")).toEqual([]);
  });

  it("о конце действия на погибшем отряде не сообщается", () => {
    const cast = conjure(magicBattle(1), 0, "bless", "a2").state;
    const dead = withStacks(cast, { a2: { count: 0, turn: "done" } });
    const next = nextRound(turnOf(dead, "a1"));
    expect(next.events.some((event) => event.type === "effectEnded")).toBe(false);
  });
});

describe("свойства боя с магией", () => {
  it("случайные заклинания в случайных боях: мана, сроки и действия всегда в порядке", () => {
    const ids = SPELLS.map((item) => item.id);
    let casts = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      let state = startBattle(
        army(["militia:30", "slinger:12", "falcon:6"], { hero: mage((seed % 4) + 1, 60) }),
        army(["militia:30", "armsman:5"], { hero: mage(seed % 3, 40) }),
        { seed },
      ).state;
      for (let step = 0; step < 400 && state.result === null; step += 1) {
        const side = activeStackOf(state)?.side ?? 0;
        const targets = state.stacks.filter((item) => item.count > 0);
        const spellId = ids[(seed * 7 + step * 3) % ids.length] ?? "";
        const target = targets[(seed + step) % targets.length]?.id ?? "";
        const cast = applyBattleCommand(state, {
          type: "battleCast",
          side,
          spell: spellId,
          target,
        });
        casts += cast.ok ? 1 : 0;
        state = cast.ok ? cast.state : state;
        expect(battleProblems(state)).toEqual([]);
        const command = chooseBattleCommand(state);
        if (state.result !== null || command === undefined) {
          break;
        }
        const next = applyBattleCommand(state, command);
        expect(next.ok).toBe(true);
        state = next.ok ? next.state : state;
        expect(battleProblems(state)).toEqual([]);
      }
      expect(state.result).not.toBeNull();
    }
    expect(casts).toBeGreaterThan(100);
  });
});
