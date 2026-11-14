// Магия на экране боя: docs/mechanics/64-magic-screen.md. Проверочный бой — с настоящими файлами игры.
import { activeStackOf, findStack } from "@homamru/core";
import type { BattleState, Cell, SpellDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { highlightsOf } from "./battleHighlights.ts";
import { describeStack } from "./battleLog.ts";
import { createBattleSession } from "./battleSession.ts";
import type { BattleSession } from "./battleSession.ts";
import { bookButton, bookCircles, roundsText, spellLine, spellTargets } from "./battleSpells.ts";
import { startTrialBattle } from "./trialBattle.ts";

function trial(): BattleSession {
  const session = createBattleSession(startTrialBattle(1).state);
  session.animationDone();
  return session;
}

function cellOf(state: BattleState, id: string): Cell {
  const stack = findStack(state, id);
  if (stack === undefined) {
    throw new Error(`Отряда ${id} нет.`);
  }
  return { col: stack.col, row: stack.row };
}

function spellOf(state: BattleState, id: string): SpellDefinition {
  const spell = state.sides[0].hero?.spells.find((item) => item.id === id);
  if (spell === undefined) {
    throw new Error(`Заклинания ${id} нет.`);
  }
  return spell;
}

const marksOf = (session: BattleSession): string[] =>
  highlightsOf(session.getSnapshot()).rings.map(({ stack, mark }) => `${stack.id}:${mark}`);

describe("проверочный бой с магией", () => {
  it("у обоих героев книга с 26 заклинаниями, сила магии 2 и 60 маны", () => {
    const { state } = startTrialBattle(1);
    for (const side of state.sides) {
      expect(side.hero).toMatchObject({ spellPower: 2, mana: 60 });
      expect(side.hero?.spells).toHaveLength(26);
    }
  });
});

describe("книга заклинаний", () => {
  it("строки книги — с силой магии героя", () => {
    const { state } = startTrialBattle(1);
    const line = (id: string) => spellLine(spellOf(state, id), { spellPower: 2, sorcery: 0 });
    expect(line("magic-arrow")).toBe("Волшебная стрела — 5 маны — урон 30");
    expect(line("bless")).toBe("Благословение — 5 маны — наибольший урон, 2 раунда");
    expect(line("slow")).toBe("Замедление — 6 маны — скорость × 75 %, 2 раунда");
    expect([1, 2, 5, 11, 21, 22].map(roundsText)).toEqual([
      "1 раунд",
      "2 раунда",
      "5 раундов",
      "11 раундов",
      "21 раунд",
      "22 раунда",
    ]);
  });

  it("кнопка «Книга»: мана на кнопке; нет героя или заклинаний — кнопки нет", () => {
    const { state } = startTrialBattle(1);
    expect(bookButton(state, 0, true)).toEqual({ mana: 60, reason: null });
    expect(bookButton(state, 0, false)).toEqual({ mana: 60, reason: "не ваш ход" });
    const hero = state.sides[0].hero;
    const withHero = (changes: object | null): BattleState => ({
      ...state,
      sides: [
        {
          ...state.sides[0],
          hero: changes === null || hero === null ? null : { ...hero, ...changes },
        },
        state.sides[1],
      ],
    });
    expect(bookButton(withHero(null), 0, true)).toBeNull();
    expect(bookButton(withHero({ spells: [] }), 0, true)).toBeNull();
    expect(bookButton(withHero({ mana: 4 }), 0, true)?.reason).toBe("не хватает маны");
  });
});

describe("выбор цели: первое касание показывает, второе колдует", () => {
  it("стрела: враги в красных кольцах, итог в строке, после второго касания мана 55", () => {
    const session = trial();
    const before = session.getSnapshot().state;
    session.chooseSpell("magic-arrow");
    expect(session.getSnapshot().selection).toMatchObject({ kind: "spell", targetId: null });
    expect(marksOf(session)).toEqual([
      "a3:active",
      "b1:spellEnemy",
      "b2:spellEnemy",
      "b3:spellEnemy",
    ]);

    session.tapCell(cellOf(before, "b1"));
    expect(session.getSnapshot().selection).toMatchObject({
      targetId: "b1",
      preview: "Ополченец (враг): урон 30, погибнет 2",
    });
    expect(marksOf(session)).toContain("b1:target");
    expect(session.getSnapshot().state).toBe(before);

    session.tapCell(cellOf(before, "b1"));
    const after = session.getSnapshot();
    expect(after.state.sides[0]).toMatchObject({ cast: true, hero: { mana: 55 } });
    expect(findStack(after.state, "b1")?.count).toBe(23);
    expect(after.log).toBe("Вы колдуете «Волшебная стрела»: Ополченец (враг), урон 30, погибло 2");
    // Ход отряда не потрачен: после показа управление снова у игрока, книга закрыта до раунда.
    session.animationDone();
    expect(activeStackOf(session.getSnapshot().state)?.id).toBe(activeStackOf(before)?.id);
    expect(session.getSnapshot().locked).toBe(false);
    expect(bookButton(session.getSnapshot().state, 0, true)?.reason).toBe(
      "в этом раунде герой уже колдовал",
    );
    session.chooseSpell("bless");
    expect(session.getSnapshot().selection).toBeNull();
  });

  it("благословение: свои в зелёных кольцах; действие видно по удержанию", () => {
    const session = trial();
    const { state } = session.getSnapshot();
    session.chooseSpell("bless");
    expect(marksOf(session)).toEqual(["a3:active", "a1:spellAlly", "a2:spellAlly", "a3:spellAlly"]);
    session.tapCell(cellOf(state, "a3"));
    expect(session.getSnapshot().selection).toMatchObject({
      preview: "Сокол (ваш): наибольший урон, 2 раунда",
    });
    session.tapCell(cellOf(state, "a3"));
    const blessed = findStack(session.getSnapshot().state, "a3");
    expect(blessed?.effects.map((effect) => effect.name)).toEqual(["Благословение"]);
    expect(blessed && describeStack(session.getSnapshot().state, blessed)).toContain(
      "заклинания: Благословение (2)",
    );
  });

  it("касание мимо цели или «Отмена» снимают выбор, заклинание не потрачено", () => {
    const session = trial();
    const { state } = session.getSnapshot();
    session.chooseSpell("magic-arrow");
    session.tapCell(cellOf(state, "a1"));
    expect(session.getSnapshot().selection).toBeNull();
    session.chooseSpell("magic-arrow");
    session.tapCell(cellOf(state, "b1"));
    session.cancel();
    expect(session.getSnapshot()).toMatchObject({ selection: null, state });
  });

  it("за противника колдует компьютер — это видно в журнале", () => {
    const session = trial();
    for (let step = 0; step < 40 && session.getSnapshot().state.result === null; step += 1) {
      if (session.getSnapshot().locked) {
        session.animationDone();
      } else {
        session.defend();
      }
    }
    expect(session.getSnapshot().history.join("\n")).toContain("Противник колдует");
  });
});

describe("заклинания кругов 2–5 в книге (67-spells-plain.md)", () => {
  const { state } = startTrialBattle(1);
  const hero = state.sides[0].hero;
  const line = (id: string): string => {
    const found = hero?.spells.find((spell) => spell.id === id);
    return found === undefined || hero === null ? "" : spellLine(found, hero);
  };

  it("строки: урон, действие со сроком, действие до конца боя", () => {
    expect(line("lightning-bolt")).toBe("Молния — 10 маны — урон 60");
    expect(line("implosion")).toBe("Взрыв — 30 маны — урон 250");
    expect(line("prayer")).toBe("Молитва — 16 маны — атака, защита и скорость +2, 2 раунда");
    expect(line("disrupting-ray")).toBe("Разрушающий луч — 10 маны — защита −3, до конца боя");
    expect(line("misfortune")).toBe("Неудача — 12 маны — удача −1, 2 раунда");
  });

  it("книга разбита по кругам, от первого", () => {
    const circles = bookCircles(hero?.spells ?? []);
    expect(circles.map((circle) => [circle.level, circle.spells.length])).toEqual([
      [1, 12],
      [2, 7],
      [3, 4],
      [4, 2],
      [5, 1],
    ]);
  });

  it("«Точность» ложится только на стрелка", () => {
    const precision = hero?.spells.find((spell) => spell.id === "precision");
    expect(precision).toBeDefined();
    const ids = precision === undefined ? [] : spellTargets(state, 0, precision).map((s) => s.id);
    expect(ids).toEqual(["a2"]);
  });
});
