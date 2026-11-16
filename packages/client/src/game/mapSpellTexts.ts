/**
 * Слова о заклинаниях карты: что сделает и почему нельзя.
 * Спецификация: docs/mechanics/73-map-spells.md. Правил игры здесь нет.
 */
import {
  isMapSpell,
  mapSpellProblem,
  mapSpellsOf,
  masteryOf,
  portalTowns,
  spellAtMastery,
  visionsReach,
} from "@homamru/core";
import type { GameState, HeroState, SpellDefinition, TownState } from "@homamru/core";
import { heroSpellLine } from "../battle/battleSpells.ts";

/** С какого уровня школы город для портала выбирает игрок. */
const CHOICE = 2;
const VISIONS_WHAT = [
  "охранников",
  "охранников и армий героев противника",
  "охранников, армий героев и гарнизонов противника",
];
const DISGUISE_WHAT = [
  "противник видит все ваши отряды как сильнейший из них",
  "противник видит все ваши отряды как сильнейший из них, без численности",
  "противник видит все ваши отряды как сильнейшее существо города, без численности",
];

/**
 * Что сделает заклинание карты у героя с уровнем школы `mastery`; заклинание — уже с навыком
 * (`spellAtMastery`).
 */
function mapSpellEffect(spell: SpellDefinition, spellPower: number, mastery: number): string {
  const step = Math.max(mastery, 1) - 1;
  if (spell.effect === "townPortal") {
    const where = mastery >= CHOICE ? "в свой город по выбору" : "в ближайший свой город";
    return `карта: переносит ${where}, запас хода −${spell.value}`;
  }
  if (spell.effect === "visions") {
    const range = visionsReach(spellPower, spell.value);
    return `карта: до конца дня точные числа ${VISIONS_WHAT[step] ?? ""} не дальше ${range} клеток`;
  }
  return `карта: до конца дня ${DISGUISE_WHAT[step] ?? ""}`;
}

export interface MapSpellRow {
  readonly id: string;
  /** «Видения — 4 маны — карта: …». */
  readonly line: string;
  /** Почему сейчас нельзя; `null` — можно. */
  readonly reason: string | null;
  /** Города на выбор: портал с продвинутой землёй. Пусто — выбирать не нужно. */
  readonly towns: readonly TownState[];
}

/** Строки окна «Колдовать»: заклинания карты из книги героя. */
export function mapSpellRows(state: GameState, hero: HeroState): MapSpellRow[] {
  return mapSpellsOf(state, hero).map((spell) => {
    const mastery = masteryOf(hero, spell);
    const choice = spell.effect === "townPortal" && mastery >= CHOICE;
    return {
      id: spell.id,
      line: bookLine(spell, hero),
      reason: mapSpellProblem(state, hero, spell),
      towns: choice ? portalTowns(state, hero) : [],
    };
  });
}

/** Что действует на героя до конца дня: строки для панели. */
export function dayEffects(hero: HeroState): string[] {
  return [
    ...(hero.visions > 0 ? ["Видения до конца дня"] : []),
    ...(hero.disguise > 0 ? ["Маскировка до конца дня"] : []),
  ];
}

/** Строка книги героя на карте и в гильдии: боевое заклинание или заклинание карты. */
export function bookLine(
  spell: SpellDefinition,
  hero: Pick<HeroState, "spellPower" | "skills">,
): string {
  if (!isMapSpell(spell)) {
    return heroSpellLine(spell, hero);
  }
  const mastery = masteryOf(hero, spell);
  const skilled = spellAtMastery(spell, mastery);
  return `${skilled.name} — ${skilled.cost} маны — ${mapSpellEffect(skilled, hero.spellPower, mastery)}`;
}
