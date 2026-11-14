/**
 * Заклинания на экране боя: что написано в книге, на кого ложится заклинание, что оно сделает.
 * Только тексты и выбор; правила — в ядре. Спецификация: docs/mechanics/64-magic-screen.md.
 */
import { applyBattleCommand, canTarget, spellValue } from "@homamru/core";
import type { BattleEvent, BattleState, SpellDefinition, StackState } from "@homamru/core";

type Side = 0 | 1;
type CastOutcome = Extract<BattleEvent, { type: "spellCast" }>["outcome"];

/** «1 раунд», «2 раунда», «5 раундов». */
export function roundsText(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return `${count} раунд`;
  }
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)
    ? `${count} раунда`
    : `${count} раундов`;
}

const LASTING: Partial<Record<SpellDefinition["effect"], (value: number) => string>> = {
  maxDamage: () => "наибольший урон",
  minDamage: () => "наименьший урон",
  meleeAttack: (value) => `атака в ближнем бою +${value}`,
  defense: (value) => `защита +${value}`,
  meleeDamagePercent: (value) => `урон в ближнем бою × ${value} %`,
  speed: (value) => `скорость +${value}`,
  speedPercent: (value) => `скорость × ${value} %`,
  spellDamagePercent: (value) => `урон от заклинаний этой школы × ${value} %`,
};

/** Что сделает заклинание у героя с такой силой магии: «урон 30», «наибольший урон, 2 раунда». */
function spellEffectText(spell: SpellDefinition, spellPower: number): string {
  if (spell.effect === "damage") {
    return `урон ${spellValue(spell, spellPower)}`;
  }
  if (spell.effect === "heal") {
    return `лечит ${spellValue(spell, spellPower)} здоровья, снимает вредные заклинания`;
  }
  if (spell.effect === "dispel") {
    return "снимает все заклинания";
  }
  const what = LASTING[spell.effect]?.(spell.value) ?? spell.effect;
  // Срок действия — сила магии, но не меньше раунда (62-battle-spells.md).
  return `${what}, ${roundsText(Math.max(1, spellPower))}`;
}

/** Строка книги: «Волшебная стрела — 5 маны — урон 30». */
export function spellLine(spell: SpellDefinition, spellPower: number): string {
  return `${spell.name} — ${spell.cost} маны — ${spellEffectText(spell, spellPower)}`;
}

export interface BookButton {
  /** Мана героя — число на кнопке. */
  readonly mana: number;
  /** Почему книгу сейчас не открыть; `null` — можно. */
  readonly reason: string | null;
}

/** Кнопка «Книга»; `null` — кнопки нет: у игрока нет героя или у героя нет заклинаний. */
export function bookButton(state: BattleState, side: Side, myTurn: boolean): BookButton | null {
  const hero = state.sides[side].hero;
  if (hero === null || hero.spells.length === 0) {
    return null;
  }
  const { mana } = hero;
  if (!myTurn) {
    return { mana, reason: "не ваш ход" };
  }
  if (state.sides[side].cast) {
    return { mana, reason: "в этом раунде герой уже колдовал" };
  }
  if (hero.spells.every((spell) => spell.cost > mana)) {
    return { mana, reason: "не хватает маны" };
  }
  return { mana, reason: null };
}

/** Отряды, на которые заклинание игрока может лечь. */
export function spellTargets(state: BattleState, side: Side, spell: SpellDefinition): StackState[] {
  return state.stacks.filter((stack) => stack.count > 0 && canTarget(spell, side, stack));
}

function outcomeText(outcome: CastOutcome, spell: SpellDefinition, spellPower: number): string {
  switch (outcome.kind) {
    case "damage":
      return `урон ${outcome.damage}, погибнет ${outcome.killed}`;
    case "heal":
      return `вылечит ${outcome.healed}`;
    case "dispel":
      return "заклинания будут сняты";
    default:
      return spellEffectText(spell, spellPower);
  }
}

/**
 * Что будет, если наколдовать заклинание на отряд: «Ополченец (враг): урон 30, погибнет 2».
 * `null` — ядро такую команду не примет.
 */
export function castPreview(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  target: StackState,
): string | null {
  const result = applyBattleCommand(state, {
    type: "battleCast",
    side,
    spell: spell.id,
    target: target.id,
  });
  const cast = result.ok ? result.events.find((event) => event.type === "spellCast") : undefined;
  if (cast === undefined) {
    return null;
  }
  const whose = target.side === side ? "ваш" : "враг";
  const power = state.sides[side].hero?.spellPower ?? 0;
  return `${target.creature.name} (${whose}): ${outcomeText(cast.outcome, spell, power)}`;
}

/** Заклинания на отряде одной строкой: «Благословение (2), Замедление (1)»; пусто — `null`. */
export function effectsText(stack: StackState): string | null {
  return stack.effects.length === 0
    ? null
    : stack.effects.map((effect) => `${effect.name} (${effect.rounds})`).join(", ");
}
