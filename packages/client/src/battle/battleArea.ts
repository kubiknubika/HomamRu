/**
 * Заклинания по площади на экране боя: куда направлено, что заденет, что подсветить.
 * Только тексты и выбор; правила — в ядре. Спецификация: docs/mechanics/68-spells-area.md.
 */
import { aimsAtCell, applyBattleCommand, areaCells, areaVictims, canTarget } from "@homamru/core";
import type { BattleState, Cell, SpellAim, SpellDefinition, StackState } from "@homamru/core";

type Side = 0 | 1;

/** Выбор цели заклинания по площади: часть `BattleSelection` вида `spell`. */
export interface AreaChoice {
  readonly targetId: null;
  /** Итог одной строкой: «враг — 2 отряда, погибнет 5; ваши — 1 отряд, погибнет 1». */
  readonly preview: string | null;
  /** Куда направлено; `null` — цель ещё не выбрана. */
  readonly aim: SpellAim | null;
  /** Сколько своих отрядов заденет. */
  readonly own: number;
  /** Игрок подтвердил цель, но заденет своих: открыто окно «Колдовать?». */
  readonly confirm: boolean;
  /** Подсказка под полем. */
  readonly hint: string;
}

/** «1 отряд», «2 отряда», «5 отрядов». */
function stacksText(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return `${count} отряд`;
  }
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)
    ? `${count} отряда`
    : `${count} отрядов`;
}

function sameAim(a: SpellAim | null, b: SpellAim): boolean {
  return (
    a !== null &&
    a.target === b.target &&
    a.cell?.col === b.cell?.col &&
    a.cell?.row === b.cell?.row
  );
}

/** Отряды, которые заденет заклинание, направленное в `aim`. */
export function areaHits(state: BattleState, spell: SpellDefinition, aim: SpellAim): StackState[] {
  const alive = state.stacks.filter((stack) => stack.count > 0);
  return areaVictims(alive, spell, aim).map((victim) => victim.stack);
}

/** Клетки под заклинанием, направленным в `aim`: у цепной молнии и «Армагеддона» их нет. */
export function areaMarks(spell: SpellDefinition, aim: SpellAim): Cell[] {
  return aim.cell === undefined ? [] : areaCells(spell, aim.cell);
}

/** Что будет, если наколдовать в `aim`; `null` — ядро такую команду не примет. */
function choiceAt(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  aim: SpellAim,
): AreaChoice | null {
  const result = applyBattleCommand(state, { type: "battleCast", side, spell: spell.id, ...aim });
  if (!result.ok) {
    return null;
  }
  const tally = { foes: 0, foesKilled: 0, own: 0, ownKilled: 0 };
  for (const event of result.events) {
    if (event.type !== "spellCast") {
      continue;
    }
    const mine = state.stacks.find((stack) => stack.id === event.targetId)?.side === side;
    tally[mine ? "own" : "foes"] += 1;
    tally[mine ? "ownKilled" : "foesKilled"] +=
      event.outcome.kind === "damage" ? event.outcome.killed : 0;
  }
  // У «Берсерка» урона нет: только кого накроет.
  const killed = (count: number): string =>
    spell.effect === "damage" ? `, погибнет ${count}` : "";
  const parts = [
    tally.foes > 0 ? `враг — ${stacksText(tally.foes)}${killed(tally.foesKilled)}` : null,
    tally.own > 0 ? `ваши — ${stacksText(tally.own)}${killed(tally.ownKilled)}` : null,
  ].filter((part) => part !== null);
  const preview = parts.length === 0 ? "никого не заденет" : parts.join("; ");
  return {
    targetId: null,
    preview,
    aim,
    own: tally.own,
    confirm: false,
    hint: `${spell.name}: ${preview}. Коснитесь ещё раз, чтобы колдовать.`,
  };
}

/** Выбор сразу после книги: у «Армагеддона» цель уже выбрана, у остальных — ещё нет. */
export function areaStart(state: BattleState, side: Side, spell: SpellDefinition): AreaChoice {
  const ready = spell.area === "all" ? choiceAt(state, side, spell, {}) : null;
  return (
    ready ?? {
      targetId: null,
      preview: null,
      aim: null,
      own: 0,
      confirm: false,
      hint: aimsAtCell(spell)
        ? `${spell.name}: коснитесь клетки. Свои отряды в площади тоже ${spell.effect === "damage" ? "получат урон" : "попадут под заклинание"}.`
        : `${spell.name}: выберите вражеский отряд в красном кольце.`,
    }
  );
}

/**
 * Касание клетки при выбранном заклинании по площади. `cast` — колдовать сейчас;
 * `choice` — новый выбор (`null` — выбор снят). Повторное касание той же цели колдует,
 * а если заденет своих — сначала открывает окно подтверждения.
 */
export function areaTap(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  current: SpellAim | null,
  cell: Cell,
): { readonly cast: SpellAim } | { readonly choice: AreaChoice | null } {
  const stack = state.stacks.find(
    (item) => item.count > 0 && item.col === cell.col && item.row === cell.row,
  );
  let aim: SpellAim | null = { cell };
  if (spell.area === "all") {
    aim = {};
  } else if (!aimsAtCell(spell)) {
    aim = stack !== undefined && canTarget(spell, side, stack) ? { target: stack.id } : null;
  }
  const choice = aim === null ? null : choiceAt(state, side, spell, aim);
  if (aim === null || choice === null || !sameAim(current, aim)) {
    return { choice };
  }
  return choice.own > 0 ? { choice: { ...choice, confirm: true } } : { cast: aim };
}
