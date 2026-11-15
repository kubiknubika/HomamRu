/**
 * Заклинания поля боя на экране: выбор клетки и отряда, подсказки, что подсветить.
 * Только тексты и выбор; правила — в ядре. Спецификация: docs/mechanics/70-spells-field.md.
 */
import {
  applyBattleCommand,
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  forceFieldCells,
  removableAt,
  teleportCells,
} from "@homamru/core";
import type { BattleState, Cell, SpellAim, SpellDefinition, StackState } from "@homamru/core";

type Side = 0 | 1;

/** Выбор цели заклинания поля: часть `BattleSelection` вида `spell`. */
export interface FieldChoice {
  /** У «Телепорта» — выбранный отряд. */
  readonly targetId: string | null;
  readonly preview: string | null;
  /** Куда направлено; `null` — цель ещё не выбрана. */
  readonly aim: SpellAim | null;
  readonly own: number;
  readonly confirm: boolean;
  readonly hint: string;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

function accepted(state: BattleState, side: Side, spell: SpellDefinition, aim: SpellAim): boolean {
  return applyBattleCommand(state, { type: "battleCast", side, spell: spell.id, ...aim }).ok;
}

function choice(hint: string, aim: SpellAim | null = null, targetId: string | null = null) {
  return { targetId, preview: aim === null ? null : hint, aim, own: 0, confirm: false, hint };
}

const AGAIN = "Коснитесь ещё раз, чтобы колдовать.";

/** Свои отряды, которые «Телепорт» может перенести. */
export function teleportStacks(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
): StackState[] {
  return state.stacks.filter((stack) =>
    // Годится ли отряд, видно по первой же клетке: остальные отличаются только местом.
    teleportCells(state, stack, spell.value)
      .slice(0, 1)
      .some((cell) => accepted(state, side, spell, { target: stack.id, cell })),
  );
}

/** Клетки, с которых «Убрать препятствие» что-нибудь уберёт. */
function removableCells(state: BattleState, spell: SpellDefinition): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      if (removableAt(state, { col, row }, spell.value) !== undefined) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

/** Выбор сразу после книги: у «Землетрясения» цели нет, оно выбрано сразу. */
export function fieldStart(state: BattleState, side: Side, spell: SpellDefinition): FieldChoice {
  switch (spell.effect) {
    case "earthquake":
      return accepted(state, side, spell, {})
        ? choice(
            `${spell.name}: ударов по укреплениям — ${spell.value}. Коснитесь поля, чтобы колдовать.`,
            {},
          )
        : choice(`${spell.name}: колдуют только в осаде, пока есть что ломать.`);
    case "forceField":
      return choice(`${spell.name}: коснитесь свободной клетки — поле встанет в ней и выше.`);
    case "removeObstacle":
      return choice(
        removableCells(state, spell).length > 0
          ? `${spell.name}: коснитесь подсвеченной клетки.`
          : `${spell.name}: убирать на поле нечего.`,
      );
    default:
      return choice(`${spell.name}: коснитесь своего отряда, потом клетки, куда его перенести.`);
  }
}

function sameAim(a: SpellAim | null | undefined, b: SpellAim): boolean {
  return (
    a !== null &&
    a !== undefined &&
    a.target === b.target &&
    a.cell?.col === b.cell?.col &&
    a.cell?.row === b.cell?.row
  );
}

/**
 * Касание клетки при выбранном заклинании поля: `cast` — колдовать сейчас, иначе новый выбор.
 * Первое касание показывает, что будет; повторное касание той же цели колдует.
 */
export function fieldTap(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  current: { readonly targetId: string | null; readonly aim?: SpellAim | null },
  cell: Cell,
): { readonly cast: SpellAim } | { readonly choice: FieldChoice } {
  if (spell.effect === "earthquake") {
    return accepted(state, side, spell, {})
      ? { cast: {} }
      : { choice: fieldStart(state, side, spell) };
  }
  if (spell.effect === "teleport") {
    const stack = state.stacks.find((item) => item.count > 0 && sameCell(item, cell));
    if (stack !== undefined) {
      return {
        choice: teleportStacks(state, side, spell).includes(stack)
          ? choice(
              `${spell.name}: ${stack.creature.name}. Коснитесь подсвеченной клетки.`,
              null,
              stack.id,
            )
          : choice(`${spell.name}: этот отряд перенести нельзя. Коснитесь своего отряда.`),
      };
    }
    const target = current.targetId;
    if (target === null) {
      return { choice: fieldStart(state, side, spell) };
    }
    const aim = { target, cell };
    if (!accepted(state, side, spell, aim)) {
      return {
        choice: choice(
          `${spell.name}: сюда перенести нельзя. Коснитесь подсвеченной клетки.`,
          null,
          target,
        ),
      };
    }
    return sameAim(current.aim, aim)
      ? { cast: aim }
      : { choice: choice(`${spell.name}: отряд встанет сюда. ${AGAIN}`, aim, target) };
  }
  const aim = { cell };
  if (!accepted(state, side, spell, aim)) {
    const why = spell.effect === "forceField" ? "здесь не поставить" : "здесь убирать нечего";
    return { choice: choice(`${spell.name}: ${why}.`) };
  }
  if (sameAim(current.aim, aim)) {
    return { cast: aim };
  }
  const what =
    spell.effect === "forceField" ? "поле встанет в подсвеченных клетках" : "будет убрано";
  return { choice: choice(`${spell.name}: ${what}. ${AGAIN}`, aim) };
}

/** Клетки, которые подсветить при выбранном заклинании поля. */
export function fieldMarks(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  current: { readonly targetId: string | null; readonly aim?: SpellAim | null },
): Cell[] {
  const aimed = current.aim?.cell;
  if (spell.effect === "forceField") {
    return aimed === undefined ? [] : forceFieldCells(side, aimed, spell.value);
  }
  if (spell.effect === "removeObstacle") {
    if (aimed === undefined) {
      return removableCells(state, spell);
    }
    const built = state.fields.find((field) => field.cells.some((item) => sameCell(item, aimed)));
    return built === undefined ? [aimed] : [...built.cells];
  }
  const stack = state.stacks.find((item) => item.id === current.targetId);
  if (spell.effect !== "teleport" || stack === undefined) {
    return [];
  }
  return aimed === undefined ? teleportCells(state, stack, spell.value) : [aimed];
}
