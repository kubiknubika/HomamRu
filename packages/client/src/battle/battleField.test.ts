// Заклинания поля на экране боя: docs/mechanics/70-spells-field.md. Проверочный бой — с настоящими файлами игры.
import { findStack } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { highlightsOf } from "./battleHighlights.ts";
import { cellLook, cellNote } from "./battleSiege.ts";
import { createBattleSession } from "./battleSession.ts";
import type { BattleSession } from "./battleSession.ts";
import { spellLine } from "./battleSpells.ts";
import { startTrialBattle } from "./trialBattle.ts";

function trial(): BattleSession {
  const session = createBattleSession(startTrialBattle(1).state);
  session.animationDone();
  return session;
}

const selectionOf = (session: BattleSession) => {
  const { selection } = session.getSnapshot();
  return selection?.kind === "spell" ? selection : null;
};

const marksOf = (session: BattleSession): string[] =>
  highlightsOf(session.getSnapshot()).cells.map(({ cell }) => `${cell.col},${cell.row}`);

describe("строки книги", () => {
  const hero = startTrialBattle(1).state.sides[0].hero;
  const line = (id: string): string => {
    const found = hero?.spells.find((spell) => spell.id === id);
    return found === undefined || hero === null ? "" : spellLine(found, hero);
  };

  it("что делает каждое заклинание поля", () => {
    expect(line("force-field")).toMatch(
      /^Силовое поле — \d+ маны — \d клетки, не пройти, 2 раунда$/,
    );
    expect(line("earthquake")).toMatch(/только в осаде: \d удара по укреплениям/);
    expect(line("teleport")).toMatch(/переносит ваш отряд в свободную клетку/);
    expect(line("remove-obstacle")).toMatch(/убирает препятствие/);
  });
});

describe("«Силовое поле»", () => {
  it("первое касание показывает клетки, второе колдует; поле видно и подписано", () => {
    const session = trial();
    session.chooseSpell("force-field");
    expect(selectionOf(session)?.hint).toMatch(/коснитесь свободной клетки/);
    session.tapCell({ col: 7, row: 5 });
    expect(marksOf(session)).toContain("7,5");
    expect(marksOf(session).length).toBeGreaterThanOrEqual(2);
    expect(session.getSnapshot().state.fields).toEqual([]);
    session.tapCell({ col: 7, row: 5 });
    const { state } = session.getSnapshot();
    expect(state.fields).toHaveLength(1);
    expect(cellLook(state, { col: 7, row: 5 })).toBe("forceField");
    expect(cellNote(state, { col: 7, row: 5 })).toBe(
      "Силовое поле: встать нельзя. Осталось раундов: 2.",
    );
  });

  it("занятая клетка: подсказка, выбор остаётся", () => {
    const session = trial();
    session.chooseSpell("force-field");
    const me = findStack(session.getSnapshot().state, "a1");
    session.tapCell({ col: me?.col ?? 0, row: me?.row ?? 0 });
    expect(selectionOf(session)?.hint).toBe("Силовое поле: здесь не поставить.");
    expect(session.getSnapshot().state.fields).toEqual([]);
  });
});

describe("«Телепорт»", () => {
  it("свой отряд, потом клетка, повторное касание переносит", () => {
    const session = trial();
    session.chooseSpell("teleport");
    const me = findStack(session.getSnapshot().state, "a1");
    session.tapCell({ col: me?.col ?? 0, row: me?.row ?? 0 });
    expect(selectionOf(session)?.targetId).toBe("a1");
    expect(marksOf(session)).toContain("7,5");
    session.tapCell({ col: 7, row: 5 });
    expect(marksOf(session)).toEqual(["7,5"]);
    session.tapCell({ col: 7, row: 5 });
    expect(findStack(session.getSnapshot().state, "a1")).toMatchObject({ col: 7, row: 5 });
  });
});

describe("«Землетрясение»", () => {
  it("в поле не колдуется: подсказка говорит почему", () => {
    const session = trial();
    session.chooseSpell("earthquake");
    const hint = selectionOf(session)?.hint ?? "";
    session.tapCell({ col: 7, row: 5 });
    expect(hint).toMatch(/только в осаде/);
    expect(session.getSnapshot().state.sides[0].cast).toBe(false);
  });
});

describe("ловушки", () => {
  it("«Мины»: цели нет, касание поля колдует; свои мины видны и подписаны", () => {
    const session = trial();
    session.chooseSpell("land-mine");
    expect(selectionOf(session)?.hint).toMatch(/^Мины: клеток — \d, в случайных местах/);
    session.tapCell({ col: 7, row: 5 });
    const { state } = session.getSnapshot();
    const mines = state.fields.filter((field) => field.kind === "mine");
    expect(mines.length).toBeGreaterThanOrEqual(4);
    const at = mines[0]?.cells[0] ?? { col: 0, row: 0 };
    expect(cellLook(state, at, 0)).toBe("mine");
    expect(cellNote(state, at, 0)).toMatch(/^Мина \(ваша, врагу не видна\): урон \d+/);
    // Противнику те же мины не показаны: клетка как клетка.
    expect(cellLook(state, at, 1)).toBe("field");
    expect(cellNote(state, at, 1)).toBe(null);
  });

  it("«Стена огня»: первое касание показывает клетки, второе ставит; стена видна обоим", () => {
    const session = trial();
    session.chooseSpell("fire-wall");
    session.tapCell({ col: 7, row: 5 });
    expect(marksOf(session).length).toBeGreaterThanOrEqual(2);
    session.tapCell({ col: 7, row: 5 });
    const { state } = session.getSnapshot();
    expect(cellLook(state, { col: 7, row: 5 }, 0)).toBe("fireWall");
    expect(cellLook(state, { col: 7, row: 5 }, 1)).toBe("fireWall");
    expect(cellNote(state, { col: 7, row: 5 })).toMatch(/^Стена огня: жжёт любой отряд/);
  });

  it("строки книги", () => {
    const hero = startTrialBattle(1).state.sides[0].hero;
    const line = (id: string): string => {
      const found = hero?.spells.find((spell) => spell.id === id);
      return found === undefined || hero === null ? "" : spellLine(found, hero);
    };
    expect(line("land-mine")).toMatch(
      /^Мины — \d+ маны — \d мин в случайных клетках, урон \d+ вражескому отряду$/,
    );
    expect(line("quicksand")).toMatch(
      /клеток в случайных местах, врагу не видны: пеший отряд увязает$/,
    );
    expect(line("fire-wall")).toMatch(/клетки, урон \d+ любому вошедшему, 2 раунда$/);
  });
});

describe("путь до хода", () => {
  it("первое касание клетки показывает путь по клеткам, второе — отправляет отряд", () => {
    const session = trial();
    const { state } = session.getSnapshot();
    const me = findStack(state, state.activeStack ?? "");
    const reach = highlightsOf(session.getSnapshot()).cells.filter(({ mark }) => mark === "reach");
    // Самая дальняя клетка хода: до неё точно больше одного шага, если отряд пеший.
    const far = reach
      .map(({ cell }) => cell)
      .toSorted((a, b) => Math.abs(b.col - (me?.col ?? 0)) - Math.abs(a.col - (me?.col ?? 0)))[0];
    expect(far).toBeDefined();
    session.tapCell(far ?? { col: 0, row: 0 });
    const marks = highlightsOf(session.getSnapshot()).cells;
    expect(marks.filter(({ mark }) => mark === "moveChoice")).toHaveLength(1);
    expect(marks.filter(({ mark }) => mark === "path").length).toBe(
      me?.creature.flying === true ? 0 : Math.abs((far?.col ?? 0) - (me?.col ?? 0)) - 1,
    );
    session.tapCell(far ?? { col: 0, row: 0 });
    expect(findStack(session.getSnapshot().state, me?.id ?? "")).toMatchObject(far ?? {});
  });
});
