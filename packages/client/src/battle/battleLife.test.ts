// Заклинания жизни на экране боя. docs/mechanics/71-spells-life.md.
import { findStack } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { ghostIds, highlightsOf } from "./battleHighlights.ts";
import { describeStack } from "./battleLog.ts";
import { createBattleSession } from "./battleSession.ts";
import type { BattleSession } from "./battleSession.ts";
import { spellLine } from "./battleSpells.ts";
import { startTrialBattle } from "./trialBattle.ts";

/** Пробный бой, в котором отряды игрока изменены. */
function trial(change: (id: string, index: number) => { count?: number; firstHealth?: number }) {
  const { state } = startTrialBattle(1);
  const mine = state.stacks.filter((stack) => stack.side === 0).map((stack) => stack.id);
  const changed: BattleState = {
    ...state,
    stacks: state.stacks.map((stack) => ({
      ...stack,
      ...change(stack.id, mine.indexOf(stack.id)),
    })),
  };
  const session = createBattleSession(changed);
  session.animationDone();
  return { session, mine };
}

const selectionOf = (session: BattleSession) => {
  const { selection } = session.getSnapshot();
  return selection?.kind === "spell" ? selection : null;
};

const ringsOf = (session: BattleSession, mark: string): string[] =>
  highlightsOf(session.getSnapshot())
    .rings.filter((ring) => ring.mark === mark)
    .map((ring) => ring.stack.id);

function cellOf(session: BattleSession, id: string) {
  const stack = findStack(session.getSnapshot().state, id);
  return { col: stack?.col ?? 0, row: stack?.row ?? 0 };
}

describe("строки книги", () => {
  it("что делает каждое заклинание жизни", () => {
    const hero = startTrialBattle(1).state.sides[0].hero;
    const line = (id: string): string => {
      const found = hero?.spells.find((spell) => spell.id === id);
      return found === undefined || hero === null ? "" : spellLine(found, hero);
    };
    expect(line("resurrection")).toMatch(/поднимает погибших вашего отряда на \d+ здоровья/);
    expect(line("clone")).toMatch(/копия вашего отряда .*гибнет от любого урона/);
    expect(line("sacrifice")).toMatch(/один ваш отряд гибнет, другой поднимается/);
  });
});

describe("«Воскрешение»", () => {
  it("погибший отряд виден бледным; два касания поднимают его", () => {
    const { session, mine } = trial((_, index) =>
      index === 1 ? { count: 0, firstHealth: 0 } : {},
    );
    const dead = mine[1] ?? "";
    expect(ghostIds(session.getSnapshot()).size).toBe(0);
    session.chooseSpell("resurrection");
    expect([...ghostIds(session.getSnapshot())]).toEqual([dead]);
    expect(ringsOf(session, "spellAlly")).toEqual([dead]);
    session.tapCell(cellOf(session, dead));
    expect(selectionOf(session)?.preview).toMatch(/станет \d+ из \d+/);
    expect(ringsOf(session, "target")).toEqual([dead]);
    session.tapCell(cellOf(session, dead));
    session.animationDone();
    expect(findStack(session.getSnapshot().state, dead)?.count).toBeGreaterThan(0);
    expect(ghostIds(session.getSnapshot()).size).toBe(0);
  });

  it("целым отрядам нечего возвращать: подсказка говорит, что целей нет", () => {
    const { session } = trial(() => ({}));
    session.chooseSpell("resurrection");
    expect(selectionOf(session)?.hint).toMatch(/подходящих отрядов нет/);
  });
});

describe("«Клон»", () => {
  it("два касания — и рядом стоит клон; в описании он помечен", () => {
    const { session, mine } = trial(() => ({}));
    const id = mine[0] ?? "";
    session.chooseSpell("clone");
    session.tapCell(cellOf(session, id));
    expect(selectionOf(session)?.preview).toMatch(/рядом встанет клон/);
    session.tapCell(cellOf(session, id));
    session.animationDone();
    const { state } = session.getSnapshot();
    const clone = state.stacks.find((stack) => stack.cloneOf === id);
    expect(clone?.count).toBe(findStack(state, id)?.count);
    expect(clone === undefined ? "" : describeStack(state, clone)).toMatch(
      /клон, гибнет от любого/,
    );
  });
});

describe("«Жертва»", () => {
  it("кого поднять, кого отдать, окно подтверждения — и только потом колдовство", () => {
    const { session, mine } = trial((_, index) => (index === 0 ? { count: 1 } : {}));
    const [raised = "", given = ""] = mine;
    session.chooseSpell("sacrifice");
    expect(ringsOf(session, "spellAlly")).toEqual([raised]);
    session.tapCell(cellOf(session, raised));
    expect(selectionOf(session)?.hint).toMatch(/выберите, кого отдать/);
    expect(ringsOf(session, "spellOwn")).toContain(given);
    expect(ringsOf(session, "spellOwn")).not.toContain(raised);
    session.tapCell(cellOf(session, given));
    const selection = selectionOf(session);
    expect(selection?.confirm).toBe(true);
    expect(selection?.confirmTitle).toBe("Отдать отряд?");
    expect(selection?.preview).toMatch(/погибнет целиком/);
    // Пока игрок не подтвердил, никто не погиб.
    expect(findStack(session.getSnapshot().state, given)?.count).toBeGreaterThan(0);
    session.confirmCast();
    session.animationDone();
    const { state } = session.getSnapshot();
    expect(findStack(state, given)?.count).toBe(0);
    expect(findStack(state, raised)?.count).toBeGreaterThan(1);
  });
});
