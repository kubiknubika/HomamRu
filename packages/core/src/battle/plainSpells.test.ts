// Заклинания кругов 2–5, первая группа: docs/mechanics/67-spells-plain.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { spellAtMastery } from "../spells.ts";
import { chooseCast } from "./aiSpells.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { canTarget } from "./cast.ts";
import { castCode, conjure, conjureAll, mage, plainBattle } from "./castKit.ts";
import { attackOf, defenseOf } from "./damage.ts";
import { damagePercent, luckOf, moraleOf, speedOf } from "./effects.ts";
import { renderBattle } from "./render.ts";
import { isMachine } from "./siege.ts";
import { siege } from "./siegeKit.ts";
import { act, army, CREATURES, stack, startBattle } from "./testkit.ts";
import type { BattleState } from "./types.ts";

const book = (...ids: readonly string[]) => ids.map((id) => spell(id));

/** Бой с удачей и боевым духом сторон: у обоих героев вся книга. */
function moodBattle(luck: number, morale: number): BattleState {
  const hero = mage(2, 100, ALL_SPELLS);
  return startBattle(
    army(["militia:20"], { hero, luck, morale }),
    army(["militia:20"], { hero, luck, morale }),
  ).state;
}

/** Нападает герой с заклинаниями `ids`; у врага удача `luck`. */
function duel(ids: readonly string[], luck: number): BattleState {
  return startBattle(
    army(["militia:20"], { hero: { ...mage(2), spells: book(...ids) } }),
    army(["militia:20"], { luck }),
  ).state;
}

function nextRound(state: BattleState): BattleState {
  let current = state;
  while (current.round === state.round) {
    current = act(current, { type: "battleDefend" }).state;
  }
  return current;
}

describe("урон по одному отряду", () => {
  it.each([
    // Сила магии 2: 20 × 2 + 10; 25 × 2 + 10; 75 × 2 + 100. У ополченца 12 здоровья.
    ["ice-bolt", 50, 4],
    ["lightning-bolt", 60, 5],
    ["implosion", 250, 20],
  ])("%s: урон %i, убито %i", (id, damage, killed) => {
    const { events } = conjure(plainBattle(), 0, id, "b1");
    expect(events[0]).toMatchObject({ outcome: { kind: "damage", damage, killed } });
  });

  it("на экспертном уровне всё равно один отряд", () => {
    for (const id of ["ice-bolt", "lightning-bolt", "implosion", "disrupting-ray"]) {
      expect(spellAtMastery(spell(id), 3).mass).toBe(false);
    }
    expect(spellAtMastery(spell("implosion"), 3)).toMatchObject({ cost: 25, value: 300 });
  });

  it("«Взрыв» на катапульту и башни не ложится, «Молния» — ложится", () => {
    const { state } = siege("castle");
    const machines = state.stacks.filter(isMachine);
    expect(machines.length).toBeGreaterThan(0);
    for (const machine of machines) {
      const foe = machine.side === 0 ? 1 : 0;
      expect(canTarget(spell("implosion"), foe, machine)).toBe(false);
      expect(canTarget(spell("lightning-bolt"), foe, machine)).toBe(true);
    }
  });

  it("защита от воздуха ослабляет «Молнию» до 70 %, от земли — «Взрыв»", () => {
    const guarded = conjureAll(
      plainBattle(),
      [1, "protection-from-air", "b1"],
      [1, "protection-from-earth", "b1"],
    );
    expect(conjure(guarded, 0, "lightning-bolt", "b1").events[0]).toMatchObject({
      outcome: { damage: 42 },
    });
    expect(conjure(guarded, 0, "implosion", "b1").events[0]).toMatchObject({
      outcome: { damage: 175 },
    });
    expect(conjure(guarded, 0, "ice-bolt", "b1").events[0]).toMatchObject({
      outcome: { damage: 50 },
    });
  });
});

describe("атака и защита", () => {
  it("«Точность»: только стрелку, только при стрельбе", () => {
    const state = plainBattle();
    expect(castCode(state, 0, "precision", "a1")).toBe("BAD_SPELL_TARGET");
    const after = conjure(state, 0, "precision", "a2").state;
    expect(attackOf(after, stack(after, "a2"), "shot")).toBe(8);
    expect(attackOf(after, stack(after, "a2"), "melee")).toBe(5);
  });

  it("«Слабость»: атака −3 и в ближнем бою, и при стрельбе; снимает «Жажду крови»", () => {
    const lusty = conjure(plainBattle(), 1, "bloodlust", "b1").state;
    expect(attackOf(lusty, stack(lusty, "b1"), "melee")).toBe(8);
    const weak = conjure(lusty, 0, "weakness", "b1");
    expect(weak.events[0]).toMatchObject({ outcome: { kind: "effect", removed: ["bloodlust"] } });
    expect(attackOf(weak.state, stack(weak.state, "b1"), "melee")).toBe(2);
    const shooter = conjure(plainBattle(), 0, "weakness", "b2").state;
    expect(attackOf(shooter, stack(shooter, "b2"), "shot")).toBe(2);
  });

  it("«Слабость» может увести атаку ниже нуля", () => {
    const expert = { ...mage(2), spells: [spellAtMastery(spell("weakness"), 2)] };
    const { state } = startBattle(army(["militia:20"], { hero: expert }), army(["militia:20"]));
    const after = conjure(state, 0, "weakness", "b1").state;
    expect(attackOf(after, stack(after, "b1"), "melee")).toBe(-1);
  });

  it("«Молитва»: атака, защита и скорость +2", () => {
    const state = plainBattle();
    const after = conjure(state, 0, "prayer", "a1").state;
    const [before, blessed] = [stack(state, "a1"), stack(after, "a1")];
    expect(attackOf(after, blessed, "melee")).toBe(attackOf(state, before, "melee") + 2);
    expect(attackOf(after, blessed, "shot")).toBe(attackOf(state, before, "shot") + 2);
    expect(defenseOf(after, blessed)).toBe(defenseOf(state, before) + 2);
    expect(speedOf(blessed)).toBe(speedOf(before) + 2);
  });

  it("«Воздушный щит»: от выстрела доходит 75 %, от удара — всё", () => {
    const after = conjure(plainBattle(), 0, "air-shield", "a1").state;
    expect(damagePercent(stack(after, "a1"), "shot")).toBe(75);
    expect(damagePercent(stack(after, "a1"), "melee")).toBe(100);
  });
});

describe("«Разрушающий луч»", () => {
  const thrice = conjureAll(
    plainBattle(),
    [0, "disrupting-ray", "b1"],
    [0, "disrupting-ray", "b1"],
    [0, "disrupting-ray", "b1"],
  );

  it("складывается: три луча — защита −9, действие одно", () => {
    expect(defenseOf(thrice, stack(thrice, "b1"))).toBe(-4);
    expect(stack(thrice, "b1").effects).toMatchObject([
      { spell: "disrupting-ray", value: 9, stacks: 3 },
    ]);
    expect(renderBattle(thrice)).toContain("«Разрушающий луч» (до конца боя, ×3)");
  });

  it("срока нет: в событии 0 раундов, через пять раундов действует", () => {
    const first = conjure(plainBattle(), 0, "disrupting-ray", "b1");
    expect(first.events[0]).toMatchObject({ outcome: { kind: "effect", rounds: 0 } });
    let state = thrice;
    for (let round = 0; round < 5; round += 1) {
      state = nextRound(state);
    }
    expect(stack(state, "b1").effects).toMatchObject([{ value: 9, stacks: 3 }]);
  });

  it("«Снять заклинания» и «Лечение» его снимают", () => {
    for (const id of ["dispel", "cure"]) {
      const after = conjure(thrice, 1, id, "b1").state;
      expect(stack(after, "b1").effects).toEqual([]);
    }
  });
});

describe("удача и боевой дух отряда", () => {
  it("«Удача» +1, «Радость» +1; «Неудача» и «Печаль» их снимают", () => {
    const happy = conjureAll(moodBattle(1, 1), [0, "fortune", "a1"], [0, "mirth", "a1"]);
    expect(luckOf(happy, stack(happy, "a1"))).toBe(2);
    expect(moraleOf(happy, stack(happy, "a1"))).toBe(2);
    const sad = conjureAll(happy, [1, "misfortune", "a1"], [1, "sorrow", "a1"]);
    expect(stack(sad, "a1").effects.map((effect) => effect.spell)).toEqual([
      "misfortune",
      "sorrow",
    ]);
    expect(luckOf(sad, stack(sad, "a1"))).toBe(0);
    expect(moraleOf(sad, stack(sad, "a1"))).toBe(0);
  });

  it("пределы: удача от 0 до 3, боевой дух от −3 до 3", () => {
    const top = conjureAll(moodBattle(3, 3), [0, "fortune", "a1"], [0, "mirth", "a1"]);
    expect([luckOf(top, stack(top, "a1")), moraleOf(top, stack(top, "a1"))]).toEqual([3, 3]);
    const low = conjureAll(moodBattle(0, -3), [0, "misfortune", "b1"], [0, "sorrow", "b1"]);
    expect([luckOf(low, stack(low, "b1")), moraleOf(low, stack(low, "b1"))]).toEqual([0, -3]);
  });

  it("действует на отряд, а не на сторону", () => {
    const state = conjure(plainBattle(), 0, "sorrow", "b1").state;
    expect(moraleOf(state, stack(state, "b1"))).toBe(-1);
    expect(moraleOf(state, stack(state, "b2"))).toBe(0);
  });
});

describe("компьютер", () => {
  it("«Неудачу» на отряд без удачи не колдует, на удачливый — колдует", () => {
    expect(chooseCast(duel(["misfortune"], 0), 0)).toBeUndefined();
    expect(chooseCast(duel(["misfortune"], 2), 0)).toMatchObject({ spell: "misfortune" });
  });

  it("«Разрушающий луч» колдует и второй раз на тот же отряд", () => {
    const state = duel(["disrupting-ray"], 0);
    const cast = conjure(state, 0, "disrupting-ray", "b1").state;
    // Следующий раунд: герой снова может колдовать.
    const once = { ...cast, sides: [{ ...cast.sides[0], cast: false }, cast.sides[1]] as const };
    expect(chooseCast(once, 0)).toMatchObject({ spell: "disrupting-ray", target: "b1" });
  });

  it("автобои с полной книгой заканчиваются и не нарушают проверок", () => {
    const cast = new Set<string>();
    for (let seed = 1; seed <= 80; seed += 1) {
      const run = runAutoBattle(randomBattle(seed, CREATURES, ALL_SPELLS), CREATURES, seed);
      expect(run.problems, `сид ${seed}`).toEqual([]);
      expect(run.state?.result ?? null, `сид ${seed}`).not.toBeNull();
      for (const command of run.commands) {
        if (command.type === "battleCast") {
          cast.add(command.spell);
        }
      }
    }
    expect(cast.size).toBeGreaterThan(8);
  });
});
