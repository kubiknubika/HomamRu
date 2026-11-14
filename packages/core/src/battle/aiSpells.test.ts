// Колдующий компьютер боя: docs/mechanics/63-opponent-magic.md.
import { describe, expect, it } from "vitest";
import { spell, SPELLS } from "../spellKit.ts";
import { chooseBattleCommand } from "./ai.ts";
import { chooseCast } from "./aiSpells.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { conjure, faceToFace, mage } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { army, CREATURES, startBattle, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

const book = (...ids: readonly string[]) => ids.map((id) => spell(id));

/** Нападает герой с заклинаниями `ids`; первым ходит его отряд. */
function duel(
  ids: readonly string[],
  mine: readonly string[],
  theirs: readonly string[],
  spellPower = 2,
  mana = 100,
): BattleState {
  return startBattle(
    army(mine, { hero: { ...mage(spellPower, mana), spells: book(...ids) } }),
    army(theirs),
  ).state;
}

/** То же состояние в начале раунда: в этом раунде ещё никто не колдовал. */
function nextRound(state: BattleState): BattleState {
  return {
    ...state,
    sides: [
      { ...state.sides[0], cast: false },
      { ...state.sides[1], cast: false },
    ],
  };
}

function withoutEffects(state: BattleState): BattleState {
  return { ...state, stacks: state.stacks.map((item) => ({ ...item, effects: [] })) };
}

const cast = (state: BattleState) => {
  const command = chooseCast(state, 0);
  return command?.type === "battleCast" ? `${command.spell} → ${command.target}` : "не колдует";
};

describe("что колдует компьютер", () => {
  it("пример из спецификации: три варианта по 30 — берётся более дешёвая стрела в первую цель", () => {
    const state = duel(
      ["bless", "curse", "magic-arrow"],
      ["militia:20"],
      ["militia:30", "slinger:4"],
      2,
      12,
    );
    expect(cast(state)).toBe("magic-arrow → b1");
    // Без стрелы: благословение 20 против проклятия 30.
    expect(cast(duel(["bless", "curse"], ["militia:20"], ["militia:30", "slinger:4"], 2, 12))).toBe(
      "curse → b1",
    );
  });

  it("польза стрелы — не больше здоровья отряда: добивать одного пращника незачем", () => {
    // Стрела на 30: по пращнику (9 здоровья) польза 9, по ополченцам — 30.
    expect(cast(duel(["magic-arrow"], ["militia:20"], ["slinger:1", "militia:30"]))).toBe(
      "magic-arrow → b2",
    );
  });

  it("не хватает маны или нет заклинаний — не колдует", () => {
    expect(cast(duel(["magic-arrow"], ["militia:20"], ["militia:30"], 2, 4))).toBe("не колдует");
    expect(cast(duel([], ["militia:20"], ["militia:30"]))).toBe("не колдует");
    expect(chooseCast(duel(["magic-arrow"], ["militia:20"], ["militia:30"]), 1)).toBeUndefined();
  });

  it("уже колдовал в этом раунде — не колдует", () => {
    const state = duel(["magic-arrow"], ["militia:20"], ["militia:30"]);
    const after = applyBattleCommand(state, {
      type: "battleCast",
      side: 0,
      spell: "magic-arrow",
      target: "b1",
    });
    expect(after.ok && chooseCast(after.state, 0)).toBeUndefined();
  });

  it("действующее заклинание второй раз на тот же отряд не накладывает", () => {
    const state = duel(["bless"], ["militia:20", "militia:10"], ["militia:30"]);
    expect(cast(state)).toBe("bless → a1");
    expect(cast(nextRound(conjure(state, 0, "bless", "a1").state))).toBe("bless → a2");
  });

  it("жажда крови — только не стрелкам; ускорение — только пока отряд не дошёл до врага", () => {
    expect(cast(duel(["bloodlust"], ["slinger:20"], ["militia:30"]))).toBe("не колдует");
    expect(cast(duel(["bloodlust"], ["slinger:20", "militia:5"], ["militia:30"]))).toBe(
      "bloodlust → a2",
    );
    const far = duel(["haste"], ["militia:20"], ["militia:30"]);
    expect(cast(far)).toBe("haste → a1");
    expect(cast(faceToFace(far))).toBe("не колдует");
  });

  it("защита от огня и воды нужна только против героя со стрелой и маной", () => {
    const hero = { ...mage(2), spells: book("protection-from-fire") };
    const against = (enemy: ReturnType<typeof mage> | undefined) =>
      cast(
        startBattle(army(["militia:20"], { hero }), army(["militia:30"], { hero: enemy })).state,
      );
    expect(against(undefined)).toBe("не колдует");
    expect(against({ ...mage(2, 0), spells: book("magic-arrow") })).toBe("не колдует");
    expect(against({ ...mage(2), spells: book("bless") })).toBe("не колдует");
    expect(against({ ...mage(2), spells: book("magic-arrow") })).toBe("protection-from-fire → a1");
  });

  it("лечит раненый отряд и снимает с него проклятие; «Снять заклинания» полезное не трогает", () => {
    const fresh = startBattle(
      army(["militia:20"], { hero: { ...mage(2), spells: book("cure", "dispel", "stone-skin") } }),
      army(["militia:30"], { hero: mage(2) }),
    ).state;
    expect(cast(fresh)).toBe("stone-skin → a1");
    const skinned = nextRound(conjure(fresh, 0, "stone-skin", "a1").state);
    expect(cast(skinned)).toBe("не колдует");
    expect(cast(withStacks(skinned, { a1: { firstHealth: 3 } }))).toBe("cure → a1");
    // Проклятие снимают оба; «Снять заклинания» дешевле лечения.
    expect(cast(nextRound(conjure(withoutEffects(skinned), 1, "curse", "a1").state))).toBe(
      "dispel → a1",
    );
    // На отряде ещё и каменная кожа: её жалко — проклятие снимает лечение.
    expect(cast(nextRound(conjure(skinned, 1, "curse", "a1").state))).toBe("cure → a1");
  });

  it("сначала колдует, потом ходит отрядом: общий выбор команды", () => {
    const state = duel(["magic-arrow"], ["militia:20"], ["militia:30"]);
    const first = chooseBattleCommand(state);
    expect(first).toMatchObject({ type: "battleCast", spell: "magic-arrow", target: "b1" });
    const after = first === undefined ? undefined : applyBattleCommand(state, first);
    expect(after?.ok && chooseBattleCommand(after.state)?.type).not.toBe("battleCast");
  });
});

describe("свойства колдующего компьютера", () => {
  it("в случайных боях каждая команда принимается, бой кончается за 200 раундов, колдуют оба", () => {
    let casts = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const run = runAutoBattle(randomBattle(seed, CREATURES, SPELLS), CREATURES, seed);
      expect(run.problems, `сид ${seed}`).toEqual([]);
      expect(run.state?.result ?? null, `сид ${seed}`).not.toBeNull();
      casts += run.commands.filter((command) => command.type === "battleCast").length;
    }
    expect(casts).toBeGreaterThan(60);
  });

  it("при одном состоянии выбор один и тот же", () => {
    const state = duel(["bless", "curse", "magic-arrow"], ["militia:20"], ["militia:30"]);
    expect(chooseCast(state, 0)).toEqual(
      chooseCast(JSON.parse(JSON.stringify(state)) as BattleState, 0),
    );
  });
});
