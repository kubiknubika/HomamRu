/**
 * Магия героя на карте: мана, книга заклинаний, гильдия магов.
 * Спецификация: docs/mechanics/61-magic.md.
 */
import { rollGuildSpells } from "./spells.ts";
import { pay } from "./town.ts";
import { reject } from "./types.ts";
import type { CommandResult, GameEvent, GameState, HeroState, TownState } from "./types.ts";

/** Маны на единицу знания. Число — из Heroes 3. */
const MANA_PER_KNOWLEDGE = 10;
/** Сколько маны возвращается за ночь вне города с гильдией. */
const MANA_PER_DAY = 1;
/** Цена книги заклинаний, золото. Число — из Heroes 3. */
export const BOOK_PRICE = 500;
/** Без навыка «Мудрость» герой учит заклинания не выше этого круга. */
const MAX_LEARNABLE_LEVEL = 2;

export interface BuyBookCommand {
  readonly type: "buyBook";
  readonly player: number;
  readonly townId: string;
}

/** Наибольший запас маны героя. */
export function maxMana(hero: Pick<HeroState, "knowledge">): number {
  return hero.knowledge * MANA_PER_KNOWLEDGE;
}

/** Уровень гильдии магов в городе; 0 — гильдии нет. */
export function guildLevel(state: GameState, town: TownState): number {
  return Math.max(
    0,
    ...state.buildings
      .filter((building) => town.buildings.includes(building.id))
      .map((building) => building.mageGuild ?? 0),
  );
}

/** Заклинания, которые гильдия города показывает сейчас: круги не выше её уровня. */
export function guildSpells(state: GameState, town: TownState): string[] {
  const level = guildLevel(state, town);
  return town.spells.filter(
    (id) => (state.spells.find((spell) => spell.id === id)?.level ?? Infinity) <= level,
  );
}

/** Свой город, в клетке которого стоит герой. */
function townUnder(state: GameState, hero: HeroState): TownState | undefined {
  return state.objects.find(
    (object): object is TownState =>
      object.type === "town" &&
      object.owner === hero.owner &&
      object.x === hero.x &&
      object.y === hero.y,
  );
}

/**
 * Начало дня: герой в своём городе с гильдией получает всю ману, остальные — по единице.
 * Мана сверх запаса не пропадает и не растёт.
 */
export function restoreMana(state: GameState): GameState {
  const heroes = state.heroes.map((hero) => {
    const town = townUnder(state, hero);
    const full = town !== undefined && guildLevel(state, town) > 0;
    const limit = maxMana(hero);
    const mana = full ? limit : Math.min(hero.mana + MANA_PER_DAY, limit);
    return { ...hero, mana: Math.max(hero.mana, mana) };
  });
  return { ...state, heroes };
}

/**
 * Герои с книгой, стоящие в своём городе с гильдией, выучивают её заклинания.
 * Вызывается после каждой команды карты: вошёл ли герой, купил ли книгу, построена ли гильдия.
 */
export function learnSpells(state: GameState, events: GameEvent[]): GameState {
  let changed = false;
  const heroes = state.heroes.map((hero) => {
    const town = townUnder(state, hero);
    if (town === undefined || !hero.book) {
      return hero;
    }
    const fresh = guildSpells(state, town).filter((id) => {
      const level = state.spells.find((spell) => spell.id === id)?.level ?? Infinity;
      return level <= MAX_LEARNABLE_LEVEL && !hero.spells.includes(id);
    });
    if (fresh.length === 0) {
      return hero;
    }
    changed = true;
    events.push({ type: "spellsLearned", heroId: hero.id, townId: town.id, spells: fresh });
    return { ...hero, spells: [...hero.spells, ...fresh] };
  });
  return changed ? { ...state, heroes } : state;
}

/** Покупка книги заклинаний героем, стоящим в своём городе с гильдией. */
export function applyBuyBook(state: GameState, command: BuyBookCommand): CommandResult {
  const town = state.objects.find(
    (object): object is TownState =>
      object.type === "town" && object.id === command.townId && object.owner === command.player,
  );
  if (town === undefined) {
    return reject("NO_TOWN", `Города «${command.townId}» у игрока нет.`);
  }
  if (guildLevel(state, town) === 0) {
    return reject("NO_GUILD", "В городе нет гильдии магов.");
  }
  const hero = state.heroes.find(
    (candidate) => candidate.owner === command.player && townUnder(state, candidate) === town,
  );
  if (hero === undefined) {
    return reject("HERO_NOT_IN_TOWN", "Героя в городе нет.");
  }
  if (hero.book) {
    return reject("BOOK_EXISTS", "Книга заклинаний у героя уже есть.");
  }
  if ((state.players[command.player]?.resources.gold ?? 0) < BOOK_PRICE) {
    return reject("NOT_ENOUGH_RESOURCES", `Нужно золота: ${BOOK_PRICE}.`);
  }
  const paid = pay(state, command.player, { gold: BOOK_PRICE });
  const events: GameEvent[] = [
    { type: "bookBought", heroId: hero.id, townId: town.id, cost: BOOK_PRICE },
  ];
  const heroes = paid.heroes.map((candidate) =>
    candidate.id === hero.id ? { ...candidate, book: true } : candidate,
  );
  return { ok: true, state: { ...paid, heroes }, events };
}

/** Начало партии: каждому городу выбирается набор гильдии на все круги. */
export function withGuildSpells(state: GameState): GameState {
  let { rng } = state;
  const objects = state.objects.map((object) => {
    if (object.type !== "town") {
      return object;
    }
    const rolled = rollGuildSpells(rng, state.spells);
    ({ rng } = rolled);
    return { ...object, spells: rolled.value };
  });
  return { ...state, rng, objects };
}
