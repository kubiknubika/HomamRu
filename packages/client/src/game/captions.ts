/**
 * Надписи экрана карты: подписи объектов, предупреждение о бое, короткие сообщения.
 * Спецификация: docs/mechanics/24-map-screen.md. Правил игры здесь нет — только слова.
 */
import {
  MINE_INCOME,
  objectAt,
  quantityRange,
  quantityWord,
  RESOURCES,
  townIncome,
} from "@homamru/core";
import type {
  ArmyStack,
  GameState,
  GuardState,
  HeroState,
  ObjectState,
  Position,
  Resources,
  TownState,
} from "@homamru/core";
import { humanOf } from "./view.ts";
import type { Fight } from "./view.ts";

export const RESOURCE_NAMES = { gold: "золото", wood: "дерево", ore: "руда" } as const;
export const MINE_NAMES = {
  sawmill: "Лесопилка",
  "ore-pit": "Рудник",
  "gold-mine": "Золотая шахта",
} as const;
export const STAT_NAMES = { attack: "атака", defense: "защита" } as const;

/** Название существа для игрока; незнакомое — как записано. */
export function creatureName(state: GameState, creatureId: string): string {
  return state.creatures.find((creature) => creature.id === creatureId)?.name ?? creatureId;
}

/**
 * Существо, слово о численности и его границы: точного числа до боя игрок не видит,
 * а по одному слову не понять, что больше.
 */
function describeGuard(state: GameState, guard: GuardState): string {
  const { count } = guard;
  return `${creatureName(state, guard.creature)}, ${quantityWord(count)} (${quantityRange(count)})`;
}

function ownerText(state: GameState, owner: number | null): string {
  if (owner === null) {
    return "ничья";
  }
  return owner === humanOf(state) ? "ваша" : "противника";
}

/** Армия словами, без точных чисел: «Ополченец — много (20–49); пращник — несколько (5–9)». */
function armyWords(state: GameState, army: readonly ArmyStack[]): string {
  return army
    .map((stack) => {
      const { count } = stack;
      return `${lower(creatureName(state, stack.creature))} — ${quantityWord(count)} (${quantityRange(count)})`;
    })
    .join("; ");
}

function describeEnemyHero(state: GameState, hero: HeroState): string {
  return `Герой противника: ${heroName(state, hero.kind)}. Армия: ${armyWords(state, hero.army)}`;
}

function describeGarrison(state: GameState, town: TownState): string {
  return town.garrison.length === 0
    ? "Гарнизон пуст"
    : `Гарнизон: ${armyWords(state, town.garrison)}`;
}

/** Подпись объекта по удержанию пальца: что это, чьё, сколько даёт. */
function describeObject(state: GameState, object: ObjectState): string {
  if (object.type === "pile") {
    return `Кучка: ${RESOURCE_NAMES[object.resource]} ${object.amount}`;
  }
  if (object.type === "guard") {
    return `Охранник: ${describeGuard(state, object)}`;
  }
  if (object.type === "town") {
    return object.owner === humanOf(state)
      ? `Город, ваш. В день: золото +${townIncome(state, object)}`
      : `Город противника. ${describeGarrison(state, object)}`;
  }
  const { resource, amount } = MINE_INCOME[object.kind];
  const owner = ownerText(state, object.owner);
  return `${MINE_NAMES[object.kind]}, ${owner}. В день: ${RESOURCE_NAMES[resource]} +${amount}`;
}

/** Подпись клетки по удержанию пальца: объект и герой противника, если они там есть. */
export function describeCell(state: GameState, cell: Position): string | null {
  const me = humanOf(state);
  const object = objectAt(state, cell.x, cell.y);
  const enemy = state.heroes.find(
    (hero) => hero.owner !== me && hero.x === cell.x && hero.y === cell.y,
  );
  const parts = [
    object === undefined ? null : describeObject(state, object),
    enemy === undefined ? null : describeEnemyHero(state, enemy),
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(". ");
}

/** Подпись к пути, который кончается боем или захватом. */
export function fightWarning(state: GameState, fight: Fight): string {
  if (fight.kind === "guard") {
    return `${describeGuard(state, fight.guard)} — будет бой`;
  }
  if (fight.kind === "capture") {
    return "Город противника, гарнизон пуст — город будет захвачен";
  }
  if (fight.kind === "town") {
    return `Город противника. ${describeGarrison(state, fight.town)} — будет бой`;
  }
  const garrison =
    fight.town === null || fight.town.garrison.length === 0
      ? ""
      : `. ${describeGarrison(state, fight.town)}`;
  return `${describeEnemyHero(state, fight.hero)}${garrison} — будет бой`;
}

/** Только то, чего прибыло: «дерево +2, золото +1000». */
export function incomeText(income: Resources): string {
  return RESOURCES.filter((resource) => income[resource] > 0)
    .map((resource) => `${RESOURCE_NAMES[resource]} +${income[resource]}`)
    .join(", ");
}

export function lower(text: string): string {
  return text.toLowerCase();
}

/** Имя героя из списка героев; незнакомое — как записано. */
export function heroName(state: GameState, kind: string): string {
  return state.heroKinds.find((hero) => hero.id === kind)?.name ?? kind;
}
