/**
 * Выбор заклинания и его цели на экране боя: что выбрано после книги и после касания поля.
 * Спецификации: docs/mechanics/64-magic-screen.md, 68-spells-area.md.
 */
import type { BattleState, Cell, SpellAim, SpellDefinition } from "@homamru/core";
import { areaStart, areaTap } from "./battleArea.ts";
import { bookButton, massChoice, targetPreview } from "./battleSpells.ts";

type Side = 0 | 1;

/** Заклинание выбрано в книге; `targetId` — отряд, выбранный первым касанием. */
export interface SpellSelection {
  readonly kind: "spell";
  readonly spell: string;
  readonly name: string;
  readonly targetId: string | null;
  /** Что будет с выбранным отрядом: «Ополченец (враг): урон 30, погибнет 2». */
  readonly preview: string | null;
  /** Заклинание по площади (battleArea.ts): куда направлено, заденет ли своих, окно «Колдовать?». */
  readonly aim?: SpellAim | null;
  readonly own?: number;
  readonly confirm?: boolean;
  readonly hint?: string;
}

function spellOf(state: BattleState, side: Side, id: string): SpellDefinition | undefined {
  return state.sides[side].hero?.spells.find((item) => item.id === id);
}

/** Выбор сразу после книги; `null` — колдовать сейчас нельзя. */
export function spellStart(
  state: BattleState,
  side: Side,
  myTurn: boolean,
  id: string,
): SpellSelection | null {
  const hero = state.sides[side].hero;
  const spell = spellOf(state, side, id);
  if (
    spell === undefined ||
    spell.cost > (hero?.mana ?? 0) ||
    bookButton(state, side, myTurn)?.reason !== null
  ) {
    return null;
  }
  const chosen =
    spell.area === undefined ? massChoice(state, side, spell) : areaStart(state, side, spell);
  return { kind: "spell", spell: id, name: spell.name, ...chosen };
}

/**
 * Касание клетки при выбранном заклинании: `cast` — колдовать сейчас, иначе новый выбор
 * (`null` — выбор снят). Отряд под касанием выбирается, повторное касание колдует.
 */
export function spellTap(
  state: BattleState,
  side: Side,
  selection: SpellSelection,
  cell: Cell,
): { readonly cast: SpellAim } | { readonly selection: SpellSelection | null } {
  const spell = spellOf(state, side, selection.spell);
  if (spell?.area !== undefined) {
    const tapped = areaTap(state, side, spell, selection.aim ?? null, cell);
    if ("cast" in tapped) {
      return tapped;
    }
    return { selection: tapped.choice === null ? null : { ...selection, ...tapped.choice } };
  }
  const target = state.stacks.find(
    (stack) => stack.count > 0 && stack.col === cell.col && stack.row === cell.row,
  );
  const preview =
    spell === undefined || target === undefined ? null : targetPreview(state, side, spell, target);
  // У заклинания «на всех» цель выбрана с самого начала: касание любой цели колдует.
  const again = spell?.mass === true ? selection.targetId !== null : undefined;
  if (target === undefined || preview === null) {
    return { selection: null };
  }
  return (again ?? selection.targetId === target.id)
    ? { cast: { target: target.id } }
    : { selection: { ...selection, targetId: target.id, preview } };
}
