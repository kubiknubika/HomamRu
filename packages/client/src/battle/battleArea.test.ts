// Заклинания по площади на экране боя: docs/mechanics/68-spells-area.md. Проверочный бой — с настоящими файлами игры.
import { findStack } from "@homamru/core";
import type { Cell } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { highlightsOf } from "./battleHighlights.ts";
import { createBattleSession } from "./battleSession.ts";
import type { BattleSession } from "./battleSession.ts";
import { spellLine } from "./battleSpells.ts";
import { startTrialBattle } from "./trialBattle.ts";

function trial(): BattleSession {
  const session = createBattleSession(startTrialBattle(1).state);
  session.animationDone();
  return session;
}

function cellOf(session: BattleSession, id: string): Cell {
  const stack = findStack(session.getSnapshot().state, id);
  if (stack === undefined) {
    throw new Error(`Отряда ${id} нет.`);
  }
  return { col: stack.col, row: stack.row };
}

const ringsOf = (session: BattleSession): string[] =>
  highlightsOf(session.getSnapshot())
    .rings.map(({ stack, mark }) => `${stack.id}:${mark}`)
    .filter((ring) => !ring.endsWith(":active"));

const selectionOf = (session: BattleSession) => {
  const { selection } = session.getSnapshot();
  return selection?.kind === "spell" ? selection : null;
};

describe("строки книги", () => {
  const hero = startTrialBattle(1).state.sides[0].hero;
  const line = (id: string): string => {
    const found = hero?.spells.find((spell) => spell.id === id);
    return found === undefined || hero === null ? "" : spellLine(found, hero);
  };

  it("урон и куда бьёт", () => {
    expect(line("fireball")).toBe("Огненный шар — 15 маны — урон 35, клетка и соседние");
    expect(line("frost-ring")).toBe("Кольцо холода — 12 маны — урон 35, соседние клетки");
    expect(line("inferno")).toBe("Инферно — 16 маны — урон 40, клетки в двух шагах");
    expect(line("armageddon")).toBe("Армагеддон — 24 маны — урон 130, все отряды на поле");
    expect(line("chain-lightning")).toBe(
      "Цепная молния — 24 маны — урон 105, цепь до 4 отрядов, каждому следующему вдвое меньше",
    );
  });
});

describe("«Огненный шар»: клетка, площадь, второе касание", () => {
  it("после книги — подсказка про клетку, колец нет", () => {
    const session = trial();
    session.chooseSpell("fireball");
    expect(selectionOf(session)).toMatchObject({ aim: null, preview: null });
    expect(selectionOf(session)?.hint).toBe(
      "Огненный шар: коснитесь клетки. Свои отряды в площади тоже получат урон.",
    );
    expect(ringsOf(session)).toEqual([]);
  });

  it("первое касание показывает площадь и итог, второе колдует", () => {
    const session = trial();
    session.chooseSpell("fireball");
    const cell = cellOf(session, "b1");
    session.tapCell(cell);
    expect(selectionOf(session)).toMatchObject({ aim: { cell }, own: 0, confirm: false });
    expect(selectionOf(session)?.preview).toMatch(/^враг — \d отряда?, погибнет \d+$/);
    expect(
      highlightsOf(session.getSnapshot()).cells.every((item) => item.mark === "spellArea"),
    ).toBe(true);
    expect(ringsOf(session)).toContain("b1:spellEnemy");
    session.tapCell(cell);
    const after = session.getSnapshot();
    expect(after.selection).toBeNull();
    expect(after.state.sides[0]).toMatchObject({ cast: true, hero: { mana: 45 } });
    expect(after.log).toContain("Вы колдуете «Огненный шар»");
  });

  it("пустая клетка: «никого не заденет», колдовать всё равно можно", () => {
    const session = trial();
    session.chooseSpell("fireball");
    const empty = { col: 7, row: 0 };
    session.tapCell(empty);
    expect(selectionOf(session)?.preview).toBe("никого не заденет");
    session.tapCell(empty);
    expect(session.getSnapshot().log).toBe("Вы колдуете «Огненный шар»: никого не задело");
  });

  it("заденет своих — окно «Колдовать?»; «Отмена» снимает выбор, «Колдовать» колдует", () => {
    const session = trial();
    session.chooseSpell("fireball");
    const mine = cellOf(session, "a1");
    session.tapCell(mine);
    expect(selectionOf(session)).toMatchObject({ confirm: false });
    expect(selectionOf(session)?.own).toBeGreaterThan(0);
    expect(ringsOf(session)).toContain("a1:spellOwn");
    session.tapCell(mine);
    // Второе касание не колдует: сначала окно.
    expect(selectionOf(session)).toMatchObject({ confirm: true });
    expect(session.getSnapshot().state.sides[0].cast).toBe(false);
    session.cancel();
    expect(session.getSnapshot().selection).toBeNull();

    session.chooseSpell("fireball");
    session.tapCell(mine);
    session.tapCell(mine);
    session.confirmCast();
    expect(session.getSnapshot().state.sides[0].cast).toBe(true);
  });
});

describe("«Армагеддон» и «Цепная молния»", () => {
  it("«Армагеддон»: цель выбрана сразу, заденет своих — окно", () => {
    const session = trial();
    session.chooseSpell("armageddon");
    expect(selectionOf(session)).toMatchObject({ aim: {}, own: 3 });
    expect(ringsOf(session)).toHaveLength(6);
    session.tapCell({ col: 7, row: 5 });
    expect(selectionOf(session)).toMatchObject({ confirm: true });
  });

  it("«Цепная молния»: цель — вражеский отряд; цепь задевает и своих", () => {
    const session = trial();
    session.chooseSpell("chain-lightning");
    expect(ringsOf(session)).toEqual(["b1:spellEnemy", "b2:spellEnemy", "b3:spellEnemy"]);
    session.tapCell(cellOf(session, "a1"));
    // Свой отряд первой целью не выбрать: выбор снят.
    expect(session.getSnapshot().selection).toBeNull();
    session.chooseSpell("chain-lightning");
    session.tapCell(cellOf(session, "b1"));
    expect(selectionOf(session)).toMatchObject({ aim: { target: "b1" } });
    expect(ringsOf(session)).toHaveLength(4);
  });
});
