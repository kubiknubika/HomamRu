// Выбор заклинания и его цели на экране боя: 64-magic-screen.md, 68-spells-area.md.
import type { Cell } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { spellStart, spellTap } from "./battleCasting.ts";
import { createBattleSession } from "./battleSession.ts";
import { startTrialBattle } from "./trialBattle.ts";

/** Проверочный бой с настоящими файлами игры и героем с маной. */
function battle() {
  const session = createBattleSession(startTrialBattle(1).state);
  session.animationDone();
  const snapshot = session.getSnapshot();
  return { session, snapshot, state: snapshot.state };
}

/** Заклинание героя по идентификатору или первое, если не названо. */
function spellId(state: ReturnType<typeof battle>["state"], id?: string): string {
  const spells = state.sides[0].hero?.spells ?? [];
  const found = id === undefined ? spells[0] : spells.find((spell) => spell.id === id);
  if (found === undefined) {
    throw new Error(`у героя нет заклинания ${id ?? "вообще"}`);
  }
  return found.id;
}

/** Клетка живого вражеского отряда. */
function enemyCell(state: ReturnType<typeof battle>["state"]): Cell {
  const stack = state.stacks.find((item) => item.side === 1 && item.count > 0);
  if (stack === undefined) {
    throw new Error("у обороняющегося нет отрядов");
  }
  return { col: stack.col, row: stack.row };
}

describe("выбор заклинания из книги", () => {
  it("знакомое заклинание выбирается, незнакомое — нет", () => {
    const { state } = battle();
    expect(spellStart(state, 0, true, "нет-такого")).toBeNull();
    const chosen = spellStart(state, 0, true, spellId(state));
    expect(chosen?.kind).toBe("spell");
    expect(chosen?.name.length).toBeGreaterThan(0);
  });

  it("не в свой ход колдовать нельзя", () => {
    const { state } = battle();
    expect(spellStart(state, 0, false, spellId(state))).toBeNull();
  });

  it("не хватает маны — колдовать нельзя", () => {
    const { state } = battle();
    const id = spellId(state);
    const poor = {
      ...state,
      sides: [
        { ...state.sides[0], hero: { ...state.sides[0].hero, mana: 0 } },
        state.sides[1],
      ] as typeof state.sides,
    };
    expect(spellStart(poor, 0, true, id)).toBeNull();
  });
});

describe("касание поля при выбранном заклинании", () => {
  it("первое касание отряда выбирает цель и показывает, что будет", () => {
    const { state } = battle();
    const chosen = spellStart(state, 0, true, spellId(state));
    if (chosen === null) {
      throw new Error("заклинание не выбралось");
    }
    const tapped = spellTap(state, 0, chosen, enemyCell(state));
    // Касание отряда — новый выбор с целью и предсказанием, а не колдовство.
    const selection = "selection" in tapped ? tapped.selection : null;
    expect(selection).not.toBeNull();
    expect(selection?.targetId).not.toBeNull();
    expect(selection?.preview ?? "").toContain("Ополченец");
  });

  it("касание пустой клетки снимает выбор", () => {
    const { state } = battle();
    const chosen = spellStart(state, 0, true, spellId(state));
    if (chosen === null) {
      throw new Error("заклинание не выбралось");
    }
    // Угол поля заведомо пуст: отряды стоят в середине.
    const tapped = spellTap(state, 0, chosen, { col: 0, row: 0 });
    expect("selection" in tapped ? tapped.selection : null).toBeNull();
  });
});
