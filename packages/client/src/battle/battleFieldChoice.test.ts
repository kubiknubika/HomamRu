// Решения заклинаний поля на экране боя: 70-spells-field.md. Первое касание — показать,
// повторное — колдовать; проверяются сами решения, а не подсветка.
import type { BattleState, Cell, SpellDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { fieldStart, fieldTap, teleportStacks } from "./battleField.ts";
import { createBattleSession } from "./battleSession.ts";
import { startTrialBattle } from "./trialBattle.ts";

function battle(): BattleState {
  const session = createBattleSession(startTrialBattle(1).state);
  session.animationDone();
  return session.getSnapshot().state;
}

/** Заклинание героя по идентификатору. */
function spellOf(state: BattleState, id: string): SpellDefinition {
  const found = state.sides[0].hero?.spells.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`у героя нет заклинания ${id}`);
  }
  return found;
}

/**
 * Свободная клетка поля: ни отряда, ни препятствия, ни стены осады.
 * Берём середину поля — у постройки, которая встаёт «в клетке и выше», должен быть запас.
 */
function freeCell(state: BattleState): Cell {
  for (let row = 5; row < 9; row += 1) {
    for (let col = 5; col < 10; col += 1) {
      const busy =
        state.stacks.some((stack) => stack.count > 0 && stack.col === col && stack.row === row) ||
        state.obstacles.some((item) => item.col === col && item.row === row);
      if (!busy) {
        return { col, row };
      }
    }
  }
  throw new Error("на поле нет свободной клетки");
}

describe("начало выбора заклинания поля", () => {
  it("«Землетрясение» вне осады сразу объясняет отказ", () => {
    const state = battle();
    const choice = fieldStart(state, 0, spellOf(state, "earthquake"));
    expect(choice.aim).toBeNull();
    expect(choice.hint).toContain("только в осаде");
  });

  it("мина и пески колдуются касанием любой клетки, число клеток в подсказке", () => {
    const state = battle();
    for (const id of ["quicksand", "land-mine"]) {
      const spell = spellOf(state, id);
      const choice = fieldStart(state, 0, spell);
      expect(choice.aim).toEqual({});
      // Число клеток считает ядро, а не поле `value`: пески ставят цепочку, мины — по силе.
      expect(choice.hint).toMatch(/клеток — \d+/);
    }
  });

  it("силовое поле и стена огня просят клетку, телепорт — отряд", () => {
    const state = battle();
    expect(fieldStart(state, 0, spellOf(state, "force-field")).hint).toContain("свободной клетки");
    expect(fieldStart(state, 0, spellOf(state, "fire-wall")).hint).toContain("свободной клетки");
    expect(fieldStart(state, 0, spellOf(state, "teleport")).hint).toContain("своего отряда");
  });
});

describe("касание поля: первое показывает, второе колдует", () => {
  it("мина и пески колдуются с первого касания", () => {
    const state = battle();
    for (const id of ["quicksand", "land-mine"]) {
      const tapped = fieldTap(
        state,
        0,
        spellOf(state, id),
        { targetId: null, aim: null },
        freeCell(state),
      );
      expect("cast" in tapped).toBe(true);
    }
  });

  it("«Землетрясение» вне осады не колдуется, выбор остаётся с объяснением", () => {
    const state = battle();
    const tapped = fieldTap(
      state,
      0,
      spellOf(state, "earthquake"),
      { targetId: null, aim: null },
      freeCell(state),
    );
    expect("choice" in tapped && tapped.choice.aim === null).toBe(true);
  });

  it("силовое поле: первое касание ставит прицел, повторное — колдует", () => {
    const state = battle();
    const spell = spellOf(state, "force-field");
    const cell = freeCell(state);
    const first = fieldTap(state, 0, spell, { targetId: null, aim: null }, cell);
    const aim = "choice" in first ? first.choice.aim : null;
    expect(aim).toEqual({ cell });
    const second = fieldTap(state, 0, spell, { targetId: null, aim }, cell);
    expect("cast" in second && second.cast.cell).toEqual(cell);
  });

  it("занятая клетка: подсказка, прицела нет", () => {
    const state = battle();
    const stack = state.stacks.find((item) => item.count > 0);
    const taken = { col: stack?.col ?? 0, row: stack?.row ?? 0 };
    const tapped = fieldTap(
      state,
      0,
      spellOf(state, "force-field"),
      { targetId: null, aim: null },
      taken,
    );
    expect("choice" in tapped).toBe(true);
    expect("choice" in tapped ? tapped.choice.aim : null).toBeNull();
    expect("choice" in tapped ? tapped.choice.hint : "").toContain("не поставить");
  });
});

describe("«Телепорт»", () => {
  it("годится только отряд, который можно перенести", () => {
    const state = battle();
    const spell = spellOf(state, "teleport");
    const stacks = teleportStacks(state, 0, spell);
    expect(stacks.length).toBeGreaterThan(0);
    // Каждый названный отряд действительно живой и свой.
    for (const stack of stacks) {
      expect(stack.count).toBeGreaterThan(0);
      expect(stack.side).toBe(0);
    }
  });

  it("касание отряда выбирает его, касание клетки — прицел, повтор — перенос", () => {
    const state = battle();
    const spell = spellOf(state, "teleport");
    const stack = teleportStacks(state, 0, spell)[0];
    if (stack === undefined) {
      throw new Error("некого переносить");
    }
    const picked = fieldTap(state, 0, spell, { targetId: null, aim: null }, stack);
    expect("choice" in picked ? picked.choice.targetId : null).toBe(stack.id);

    const cell = freeCell(state);
    const aimed = fieldTap(state, 0, spell, { targetId: stack.id, aim: null }, cell);
    const aim = "choice" in aimed ? aimed.choice.aim : null;
    expect(aim).toEqual({ target: stack.id, cell });
    expect("choice" in aimed ? aimed.choice.hint : "").toContain("встанет сюда");

    const again = fieldTap(state, 0, spell, { targetId: stack.id, aim }, cell);
    expect("cast" in again && again.cast).toEqual({ target: stack.id, cell });
  });

  it("касание клетки до выбора отряда возвращает к началу", () => {
    const state = battle();
    const spell = spellOf(state, "teleport");
    const tapped = fieldTap(state, 0, spell, { targetId: null, aim: null }, freeCell(state));
    expect("choice" in tapped ? tapped.choice.hint : "").toContain("своего отряда");
  });
});
