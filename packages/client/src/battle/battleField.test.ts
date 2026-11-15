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
